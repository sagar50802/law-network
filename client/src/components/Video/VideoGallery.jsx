// src/components/videos/VideoGallery.jsx
import { useEffect, useRef, useState } from "react";
import { API_BASE, fetchJSON, authHeaders } from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";
import usePreviewLock from "../../hooks/usePreviewLock";
import QROverlay from "../common/QROverlay";
import { loadAccess } from "../../utils/access";
import AccessTimer from "../common/AccessTimer";
import useAccessSync from "../../hooks/useAccessSync";
import useSubmissionStream from "../../hooks/useSubmissionStream";

export default function VideoGallery() {
  const [playlists, setPlaylists] = useState([]);
  const [pid, setPid] = useState(null);
  const [clip, setClip] = useState(null);

  const [accessMap, setAccessMap] = useState({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [grantToast, setGrantToast] = useState(null);

  const panelRef = useRef(null);
  const videoRef = useRef(null);
  const [playlistOverlay, setPlaylistOverlay] = useState(null);

  const [email] = useState(() => localStorage.getItem("userEmail") || "");

  // Live events from server (SSE/polling)
  useSubmissionStream(email);

  // Queue for grants that arrive before playlists are available
  const pendingEventsRef = useRef([]);

  // ---------- helpers (id normalization + persistence) ----------
  const resolvePlaylistId = (featureId) => {
    if (!featureId) return null;
    const fid = String(featureId).trim().toLowerCase();
    const byId = playlists.find((pl) => String(pl.id).toLowerCase() === fid);
    if (byId) return byId.id;
    const byName = playlists.find(
      (pl) => String(pl.name || pl.title || "").toLowerCase() === fid
    );
    if (byName) return byName.id;
    const bySlug = playlists.find(
      (pl) => String(pl.slug || "").toLowerCase() === fid
    );
    if (bySlug) return bySlug.id;
    return null;
  };

  const persistLocalAccess = (playlistId, expiry) => {
    try {
      const key = `playlist:${playlistId}:${email}`;
      const store = JSON.parse(localStorage.getItem("access") || "{}");
      store[key] = { expiry };
      localStorage.setItem("access", JSON.stringify(store));
    } catch {}
  };

  const clearLocalAccess = (playlistId) => {
    try {
      const key = `playlist:${playlistId}:${email}`;
      const store = JSON.parse(localStorage.getItem("access") || "{}");
      if (store[key]) {
        delete store[key];
        localStorage.setItem("access", JSON.stringify(store));
      }
    } catch {}
  };

  // Read access by id + aliases (name/slug) and choose the latest expiry
  const getAccessForPlaylist = async (pl) => {
    const candidates = [];
    candidates.push(await loadAccess("playlist", pl.id, email));
    if (pl.name) candidates.push(await loadAccess("playlist", pl.name, email));
    if (pl.slug) candidates.push(await loadAccess("playlist", pl.slug, email));
    const valid = candidates.filter((x) => x?.expiry && x.expiry > Date.now());
    if (valid.length === 0) return null;
    // pick the farthest (latest) expiry
    return valid.reduce((a, b) => (a.expiry > b.expiry ? a : b));
  };

  const applyGrant = async ({ featureId, expiry, message }) => {
    // Try to normalize to a real playlist id; if not yet possible, queue
    const normalizedId = resolvePlaylistId(featureId);
    if (!normalizedId) {
      pendingEventsRef.current.push({ type: "grant", featureId, expiry, message });
      return;
    }

    // persist under normalized id and flip UI
    persistLocalAccess(normalizedId, expiry);
    setAccessMap((prev) => ({
      ...prev,
      [normalizedId]: { expiry, source: "event" },
    }));
    setPlaylistOverlay(null);

    const savedName = localStorage.getItem("userName");
    const fallbackName = email ? email.split("@")[0] : "User";
    const name = savedName || fallbackName || "User";
    setGrantToast(message || `🎉 Congratulations ${name}! Your access has been unlocked.`);
    setTimeout(() => setGrantToast(null), 4500);

    if (pid && String(pid) === String(normalizedId)) {
      try {
        await videoRef.current?.play?.();
      } catch {}
    }

    // confirm with backend
    const fresh = await loadAccess("playlist", normalizedId, email);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: fresh }));
  };

  const applyRevoke = ({ featureId }) => {
    const normalizedId = resolvePlaylistId(featureId);
    if (!normalizedId) {
      pendingEventsRef.current.push({ type: "revoke", featureId });
      return;
    }
    clearLocalAccess(normalizedId);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: null }));
    const targetPl = playlists.find((pl) => String(pl.id) === String(normalizedId));
    if (targetPl) setPlaylistOverlay(targetPl);
  };

  // ---------- data load ----------
  const load = async () => {
    setAccessLoading(true);
    const r = await fetchJSON(`${API_BASE}/api/videos`);
    const pls = r.playlists || [];
    setPlaylists(pls);
    if (!pid && pls[0]) setPid(pls[0].id);

    const newAccess = {};
    for (const pl of pls) {
      newAccess[pl.id] = await getAccessForPlaylist(pl); // ← id + aliases
    }
    setAccessMap(newAccess);
    setAccessLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile any queued events once playlists exist
  useEffect(() => {
    if (!playlists.length || pendingEventsRef.current.length === 0) return;
    const queue = pendingEventsRef.current.splice(0, pendingEventsRef.current.length);
    for (const ev of queue) {
      if (ev.type === "grant") applyGrant(ev);
      if (ev.type === "revoke") applyRevoke(ev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists.length]);

  useEffect(() => {
    if (!pid) return;
    const p = playlists.find((x) => x.id === pid);
    if (p && p.items?.[0]) setClip(p.items[0]);
  }, [pid, playlists]);

  // Refresh all (keeps UI smooth)
  const refreshAllAccess = async () => {
    if (playlists.length === 0) return;
    setAccessLoading(true);
    const next = {};
    for (const pl of playlists) {
      next[pl.id] = await getAccessForPlaylist(pl); // ← id + aliases
    }
    setAccessMap(next);
    setAccessLoading(false);
  };

  // ---------- live sync from events ----------
  useAccessSync(async (detail) => {
    if (!detail || detail.email !== email || detail.feature !== "playlist") return;

    if (detail.expiry && detail.expiry > Date.now()) {
      return applyGrant({
        featureId: detail.featureId,
        expiry: detail.expiry,
        message: detail.message,
      });
    }

    if (detail.revoked === true) {
      return applyRevoke({ featureId: detail.featureId });
    }

    // fallback: verify this single feature
    const normalizedId = resolvePlaylistId(detail.featureId) || detail.featureId;
    const stillHas = await loadAccess("playlist", normalizedId, email);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: stillHas }));
    if (!stillHas) {
      const targetPl = playlists.find((pl) => String(pl.id) === String(normalizedId));
      if (targetPl) setPlaylistOverlay(targetPl);
    } else {
      setPlaylistOverlay(null);
    }
  });

  // Refresh on window focus
  useEffect(() => {
    const onFocus = () => {
      refreshAllAccess();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists, email]);

  // 🔔 NEW: listen for silent app-wide refresh signals
  useEffect(() => {
    const doRefresh = () => refreshAllAccess();
    window.addEventListener("softRefresh", doRefresh);
    return () => window.removeEventListener("softRefresh", doRefresh);
  }, []);

  // Refresh exactly when the nearest expiry hits
  useEffect(() => {
    const now = Date.now();
    let nextExpiry = Infinity;
    for (const v of Object.values(accessMap)) {
      if (v?.expiry && v.expiry > now) nextExpiry = Math.min(nextExpiry, v.expiry);
    }
    if (!isFinite(nextExpiry)) return;
    const delay = Math.max(0, nextExpiry - now + 500);
    const t = setTimeout(() => {
      refreshAllAccess();
    }, delay);
    return () => clearTimeout(t);
  }, [accessMap]);

  // Per-video preview cutoff (10s) → auto-open overlay only when locked
  const lock = usePreviewLock({
    type: "video",
    id: clip?.id || "none",
    previewSeconds: 10,
  });

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    el.pause();

    let overlayOpenedForThisPlayback = false;

    const onTimeUpdate = () => {
      const plAccess = accessMap[pid];
      if (plAccess?.expiry && plAccess.expiry > Date.now()) return; // unlocked → no overlay
      if (!lock.unlocked && el.currentTime >= 10 && !overlayOpenedForThisPlayback) {
        el.pause();
        const currentPl = playlists.find((x) => x.id === pid);
        setPlaylistOverlay(currentPl || null);
        overlayOpenedForThisPlayback = true;
      }
    };

    const onPlay = () => {
      overlayOpenedForThisPlayback = false;
    };

    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("play", onPlay);
    };
  }, [clip?.id, lock.unlocked, pid, accessMap, playlists]);

  const p = playlists.find((x) => x.id === pid);

  // ---------- admin bits ----------
  const [newPlName, setNewPlName] = useState("");
  const createPlaylist = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE}/api/videos/playlists`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: newPlName || "New Playlist" }),
    });
    setNewPlName("");
    await load();
  };

  const [form, setForm] = useState({
    title: "",
    author: "",
    file: null,
    locked: true,
  });
  const uploadVideo = async (e) => {
    e.preventDefault();
    if (!pid || !form.file) return;
    const fd = new FormData();
    fd.append("title", form.title || "Untitled");
    fd.append("author", form.author || "");
    fd.append("locked", String(form.locked));
    fd.append("video", form.file);
    await fetch(`${API_BASE}/api/videos/playlists/${pid}/items`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    setForm({ title: "", author: "", file: null, locked: true });
    await load();
  };

  const delItem = async (iid) => {
    await fetch(`${API_BASE}/api/videos/playlists/${pid}/items/${iid}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    await load();
  };

  const toggleLock = async (iid, newState) => {
    await fetch(`${API_BASE}/api/videos/playlists/${pid}/items/${iid}/lock`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ locked: newState }),
    });
    await load();
  };

  // ---------- render ----------
  return (
    <section
      id="video"
      className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {/* Sidebar */}
      <aside className="md:col-span-1 border rounded-2xl bg-white">
        <div className="p-3 border-b font-semibold">Video Gallery</div>

        <div className="p-3 space-y-3 max-h-[60vh] overflow-auto">
          {playlists.map((pl) => {
            const plAccess = accessMap[pl.id];

            return (
              <div
                key={pl.id}
                className={`border rounded-xl ${
                  pid === pl.id ? "ring-2 ring-blue-500" : ""
                }`}
              >
                <div className="flex justify-between items-center px-3 py-2">
                  <button
                    onClick={() => setPid(pl.id)}
                    className="text-left font-medium flex-1"
                  >
                    {pl.name}
                  </button>

                  {plAccess?.expiry && plAccess.expiry > Date.now() ? (
                    <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full animate-pulse">
                      <span>✅ Unlocked</span>
                      <AccessTimer timeLeftMs={plAccess.expiry - Date.now()} />
                      {accessLoading && (
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-green-700 border-t-transparent rounded-full"></span>
                      )}
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-1 rounded"
                      onClick={() => setPlaylistOverlay(pl)}
                    >
                      <span>Unlock</span>
                      {accessLoading && (
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full"></span>
                      )}
                    </button>
                  )}
                </div>

                {pid === pl.id && (
                  <div className="px-2 pb-2 space-y-1">
                    {(pl.items || []).map((it) => {
                      const effectiveAccess =
                        plAccess?.expiry && plAccess.expiry > Date.now()
                          ? plAccess
                          : null;

                      return (
                        <div
                          key={it.id}
                          onClick={() => setClip(it)}
                          className={`px-2 py-2 rounded cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                            clip?.id === it.id ? "bg-gray-50" : ""
                          }`}
                        >
                          <div className="truncate">
                            <div className="text-sm font-medium truncate">
                              {it.title}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {it.author}
                            </div>
                          </div>

                          {effectiveAccess ? (
                            <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full animate-pulse">
                              <span>✅ Unlocked</span>
                              <AccessTimer
                                timeLeftMs={effectiveAccess.expiry - Date.now()}
                              />
                              {accessLoading && (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-green-700 border-t-transparent rounded-full"></span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              <span>Locked</span>
                              {accessLoading && (
                                <span className="animate-spin inline-block w-3 h-3 border-2 border-red-700 border-t-transparent rounded-full"></span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(pl.items || []).length === 0 && (
                      <div className="text-xs text-gray-500 px-2 pb-2">
                        No videos
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {playlists.length === 0 && (
            <div className="text-gray-500 text-sm">No playlists yet</div>
          )}
        </div>

        {/* Admin: create playlist */}
        <IfOwnerOnly className="p-3 border-t">
          <form
            onSubmit={createPlaylist}
            className="grid grid-cols-[1fr_auto] gap-2"
          >
            <input
              className="border rounded p-2"
              placeholder="New playlist name"
              value={newPlName}
              onChange={(e) => setNewPlName(e.target.value)}
            />
            <button className="bg-black text-white px-3 rounded">Add</button>
          </form>
        </IfOwnerOnly>
      </aside>

      {/* Main Player (blurs while overlay is open) */}
      <div
        ref={panelRef}
        className={`md:col-span-2 border rounded-2xl bg-white p-5 relative ${
          playlistOverlay ? "blur-sm opacity-80 pointer-events-none" : ""
        }`}
      >
        {/* 🎉 Congrats toast */}
        {grantToast && (
          <div className="absolute top-3 right-3 z-20 bg-green-600 text-white text-sm px-3 py-2 rounded-lg shadow">
            {grantToast}
          </div>
        )}

        {clip ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-lg font-semibold">{clip.title}</div>
                <div className="text-sm text-gray-500">{clip.author}</div>
              </div>
              {(() => {
                const plAccess = accessMap[pid];
                return (
                  <div
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      plAccess?.expiry && plAccess.expiry > Date.now()
                        ? "bg-green-100 text-green-700 animate-pulse"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {plAccess?.expiry && plAccess.expiry > Date.now() ? (
                      <>
                        ✅ Unlocked{" "}
                        <AccessTimer timeLeftMs={plAccess.expiry - Date.now()} />
                      </>
                    ) : (
                      `Locked (${lock.countLeft}s preview)`
                    )}
                    {accessLoading && (
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full"></span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="rounded-xl border p-3 bg-black">
              <video
                ref={videoRef}
                src={`${API_BASE}${clip.url}`}
                controls
                preload="metadata"
                className="w-full rounded-lg"
                controlsList="nodownload noplaybackrate noremoteplayback"
                disablePictureInPicture
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          </>
        ) : (
          <div className="text-gray-500">Select a video</div>
        )}

        {/* Admin: upload */}
        <IfOwnerOnly>
          <form onSubmit={uploadVideo} className="mt-6 border-t pt-4 grid gap-2">
            <div className="font-semibold">Upload video to playlist</div>
            <div className="grid md:grid-cols-3 gap-2">
              <input
                className="border rounded p-2"
                placeholder="Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <input
                className="border rounded p-2"
                placeholder="Author"
                value={form.author}
                onChange={(e) => setForm({ ...form, author: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.locked}
                  onChange={(e) =>
                    setForm({ ...form, locked: e.target.checked })
                  }
                />
                Locked by default
              </label>
            </div>
            <input
              type="file"
              accept="video/mp4,video/webm,video/ogg"
              onChange={(e) =>
                setForm({ ...form, file: e.target.files?.[0] || null })
              }
            />
            <div className="text-xs text-gray-500">Playlist: {p?.name || "—"}</div>
            <button
              className="bg-black text-white px-4 py-2 rounded w-fit"
              disabled={!pid || !form.file}
            >
              Upload
            </button>
          </form>
        </IfOwnerOnly>
      </div>

      {/* QROverlay kept OUTSIDE the blurred panel so it stays crisp */}
      {playlistOverlay && (
        <QROverlay
          open={!!playlistOverlay}
          onClose={() => setPlaylistOverlay(null)}
          title={playlistOverlay.name}
          subjectLabel="Playlist"
          inline
          focusRef={panelRef}
          feature="playlist"
          featureId={playlistOverlay.id}
        />
      )}
    </section>
  );
}
