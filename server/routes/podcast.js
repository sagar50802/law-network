// client/src/components/podcasts/Podcast.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, getJSON, authHeaders, absUrl } from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";
import usePreviewLock from "../../hooks/usePreviewLock";
import QROverlay from "../common/QROverlay";
import { loadAccess } from "../../utils/access";
import AccessTimer from "../common/AccessTimer";
import useAccessSync from "../../hooks/useAccessSync";
import useSubmissionStream from "../../hooks/useSubmissionStream";

export default function Podcast() {
  const [playlists, setPlaylists] = useState([]);
  const [pid, setPid] = useState(null);
  const [track, setTrack] = useState(null);

  const [accessMap, setAccessMap] = useState({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [grantToast, setGrantToast] = useState(null);

  const panelRef = useRef(null);
  const audioRef = useRef(null);
  const [playlistOverlay, setPlaylistOverlay] = useState(null);
  const [audioError, setAudioError] = useState("");
  const [audioReady, setAudioReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);

  const [email] = useState(() => localStorage.getItem("userEmail") || "");
  useSubmissionStream(email);
  const pendingEventsRef = useRef([]);

  const resolvePlaylistId = (featureId) => {
    if (!featureId) return null;
    const fid = String(featureId).trim().toLowerCase();
    const byId = playlists.find((pl) => String(pl.id).toLowerCase() === fid);
    if (byId) return byId.id;
    const byName = playlists.find((pl) => String(pl.name || pl.title || "").toLowerCase() === fid);
    if (byName) return byName.id;
    const bySlug = playlists.find((pl) => String(pl.slug || "").toLowerCase() === fid);
    if (bySlug) return bySlug.id;
    return null;
  };

  const persistLocalAccess = (playlistId, expiry) => {
    try {
      const key = `podcast:${playlistId}:${email}`;
      const store = JSON.parse(localStorage.getItem("access") || "{}");
      store[key] = { expiry };
      localStorage.setItem("access", JSON.stringify(store));
    } catch {}
  };

  const clearLocalAccess = (playlistId) => {
    try {
      const key = `podcast:${playlistId}:${email}`;
      const store = JSON.parse(localStorage.getItem("access") || "{}");
      if (store[key]) {
        delete store[key];
        localStorage.setItem("access", JSON.stringify(store));
      }
    } catch {}
  };

  const getAccessForPlaylist = async (pl) => {
    const candidates = [];
    candidates.push(await loadAccess("podcast", pl.id, email));
    if (pl.name) candidates.push(await loadAccess("podcast", pl.name, email));
    if (pl.slug) candidates.push(await loadAccess("podcast", pl.slug, email));
    const valid = candidates.filter((x) => x?.expiry && x.expiry > Date.now());
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => (a.expiry > b.expiry ? a : b));
  };

  const applyGrant = async ({ featureId, expiry, message }) => {
    const normalizedId = resolvePlaylistId(featureId);
    if (!normalizedId) {
      pendingEventsRef.current.push({ type: "grant", featureId, expiry, message });
      return;
    }
    persistLocalAccess(normalizedId, expiry);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: { expiry, source: "event" } }));
    setPlaylistOverlay(null);

    const savedName = localStorage.getItem("userName");
    const fallbackName = email ? email.split("@")[0] : "User";
    const name = savedName || fallbackName || "User";
    setGrantToast(message || `🎉 Congratulations ${name}! Your access has been unlocked.`);
    setTimeout(() => setGrantToast(null), 4500);

    if (pid && String(pid) === String(normalizedId)) {
      try { await audioRef.current?.play?.(); } catch {}
    }

    const fresh = await loadAccess("podcast", normalizedId, email);
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

  const load = async () => {
    setAccessLoading(true);
    setAudioError("");
    const r = await getJSON("/podcasts");
    const pls = r.playlists || [];
    const normalized = pls.map((p) => ({ ...p, id: String(p.id || p._id || p.slug || p.name) }));
    setPlaylists(normalized);
    if (!pid && normalized[0]) setPid(normalized[0].id);

    const next = {};
    for (const pl of normalized) next[pl.id] = await getAccessForPlaylist(pl);
    setAccessMap(next);
    setAccessLoading(false);
  };

  useEffect(() => { load(); }, []);

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
    const pl = playlists.find((p) => p.id === pid);
    if (pl && pl.items?.[0]) setTrack(pl.items[0]);
    setAudioError("");
    setAudioReady(false);
  }, [pid, playlists]);

  const refreshAllAccess = async () => {
    if (playlists.length === 0) return;
    setAccessLoading(true);
    const next = {};
    for (const pl of playlists) next[pl.id] = await getAccessForPlaylist(pl);
    setAccessMap(next);
    setAccessLoading(false);
  };

  useAccessSync(async (detail) => {
    if (!detail || detail.email !== email || detail.feature !== "podcast") return;

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

    const normalizedId = resolvePlaylistId(detail.featureId) || detail.featureId;
    const stillHas = await loadAccess("podcast", normalizedId, email);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: stillHas }));
    if (!stillHas) {
      const targetPl = playlists.find((pl) => String(pl.id) === String(normalizedId));
      if (targetPl) setPlaylistOverlay(targetPl);
    } else {
      setPlaylistOverlay(null);
    }
  });

  useEffect(() => {
    const onFocus = () => refreshAllAccess();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlists, email]);

  useEffect(() => {
    const doRefresh = () => refreshAllAccess();
    window.addEventListener("softRefresh", doRefresh);
    return () => window.removeEventListener("softRefresh", doRefresh);
  }, []);

  useEffect(() => {
    const now = Date.now();
    let nextExpiry = Infinity;
    for (const v of Object.values(accessMap)) {
      if (v?.expiry && v.expiry > now) nextExpiry = Math.min(nextExpiry, v.expiry);
    }
    if (!isFinite(nextExpiry)) return;
    const delay = Math.max(0, nextExpiry - now + 500);
    const t = setTimeout(() => refreshAllAccess(), delay);
    return () => clearTimeout(t);
  }, [accessMap]);

  const lock = usePreviewLock({
    type: "podcast",
    id: track?.id || "none",
    previewSeconds: 10,
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);

  // *** PROXIFY R2: use API /media for r2.dev links to dodge CORS ***
  const audioSrc = useMemo(() => {
    const raw = track?.url ? absUrl(track.url) : "";
    if (raw && /\.r2\.dev\/.+/.test(raw)) {
      return `${API_BASE}/podcasts/media?u=${encodeURIComponent(raw)}`;
    }
    return raw;
  }, [track?.url]);

  const pl = useMemo(() => playlists.find((p) => p.id === pid) || null, [pid, playlists]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    el.currentTime = 0;
    el.pause();
    setCur(0);
    setIsPlaying(false);
    setAudioError("");
    setAudioReady(false);

    let overlayOpenedForThisPlayback = false;

    const onLoadedMetadata = () => {
      setDur(Number.isFinite(el.duration) ? el.duration : 0);
      setAudioReady(true);
    };
    const onCanPlay = () => setAudioReady(true);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onVolume = () => setVol(el.volume);
    const onEnded = () => setIsPlaying(false);
    const onTime = () => {
      if (!isSeeking) setCur(el.currentTime || 0);
      const hasAccess = accessMap[pid]?.expiry && accessMap[pid].expiry > Date.now();
      if (!hasAccess && !lock.unlocked && el.currentTime >= 10 && !overlayOpenedForThisPlayback) {
        el.pause();
        el.currentTime = 10;
        const currentPl = playlists.find((x) => x.id === pid);
        setPlaylistOverlay(currentPl || null);
        overlayOpenedForThisPlayback = true;
        setIsPlaying(false);
      }
    };
    const onError = () => {
      setAudioError("Audio failed to load. Check the file URL or CORS.");
      setAudioReady(false);
      setIsPlaying(false);
      setDur(0);
      setCur(0);
    };

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.addEventListener("canplay", onCanPlay);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("volumechange", onVolume);
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    el.addEventListener("stalled", onError);

    return () => {
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      el.removeEventListener("canplay", onCanPlay);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("volumechange", onVolume);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("stalled", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, pid, playlists, lock.unlocked, accessMap[pid]?.expiry, isSeeking, audioSrc]);

  const mmss = (s) => {
    if (!isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el || audioError) return;
    if (isPlaying) el.pause();
    else {
      try {
        await el.play();
        setIsPlaying(true);
      } catch (e) {
        setAudioError((e && e.message) || "Unable to start playback.");
      }
    }
  };

  const seekToTime = (t) => {
    const el = audioRef.current;
    if (!el) return;
    const hasAccess = accessMap[pid]?.expiry && accessMap[pid].expiry > Date.now();
    const maxT = hasAccess ? (dur || el.duration || 0) : Math.min(10, dur || el.duration || 10);
    const nt = Math.max(0, Math.min(maxT, t));
    el.currentTime = nt;
    setCur(nt);
  };

  const barRef = useRef(null);
  const onBarClick = (e) => {
    const rect = barRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const t = (dur || 0) * Math.max(0, Math.min(1, pct));
    seekToTime(t);
  };

  const startDrag = (e) => {
    e.preventDefault();
    setIsSeeking(true);
    const move = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const rect = barRef.current.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      setCur(Math.max(0, Math.min(1, pct)) * (dur || 0));
    };
    const up = (ev) => {
      const clientX = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
      const rect = barRef.current.getBoundingClientRect();
      const pct = (clientX - rect.left) / rect.width;
      seekToTime(Math.max(0, Math.min(1, pct)) * (dur || 0));
      setIsSeeking(false);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", move);
    window.addEventListener("touchend", up);
  };

  const skip = (sec) => {
    const el = audioRef.current;
    if (!el) return;
    seekToTime((el.currentTime || 0) + sec);
  };

  const setVolume = (v) => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, v));
    setVol(el.volume);
  };

  return (
    <section id="podcast" className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Sidebar */}
      <aside className="md:col-span-1 border rounded-2xl bg-white">
        <div className="p-3 border-b font-semibold">Podcasts</div>
        <div className="p-3 space-y-3 max-h-[60vh] overflow-auto">
          {playlists.map((p) => {
            const plAccess = accessMap[p.id];
            const active = pid === p.id;
            return (
              <div key={p.id} className={`border rounded-xl ${active ? "ring-2 ring-blue-500" : ""}`}>
                <div className="flex items-center justify-between px-3 py-2">
                  <button onClick={() => setPid(p.id)} className="text-left font-medium flex-1">
                    {p.name}
                  </button>
                  {plAccess?.expiry && plAccess.expiry > Date.now() ? (
                    <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                      <span>✅ Unlocked</span>
                      <AccessTimer timeLeftMs={plAccess.expiry - Date.now()} />
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-1 rounded"
                      onClick={() => setPlaylistOverlay(p)}
                    >
                      <span>Unlock</span>
                    </button>
                  )}
                </div>

                {active && (
                  <div className="px-2 pb-2 space-y-1">
                    {(p.items || []).map((it) => {
                      const effectiveAccess =
                        plAccess?.expiry && plAccess.expiry > Date.now() ? plAccess : null;
                      const isCurrent = track?.id === it.id;
                      return (
                        <div
                          key={it.id}
                          className={`px-2 py-2 rounded cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                            isCurrent ? "bg-gray-50" : ""
                          }`}
                          onClick={() => {
                            setTrack(it);
                            setAudioError("");
                            setAudioReady(false);
                          }}
                        >
                          <div className="truncate">
                            <div className="text-sm font-medium truncate">{it.title}</div>
                            <div className="text-xs text-gray-500 truncate">{it.artist}</div>
                          </div>
                          {effectiveAccess ? (
                            <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                              <span>✅ Unlocked</span>
                              <AccessTimer timeLeftMs={effectiveAccess.expiry - Date.now()} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                              <span>Locked</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(p.items || []).length === 0 && (
                      <div className="text-xs text-gray-500 px-2 pb-2">No items</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {playlists.length === 0 && <div className="text-gray-500 text-sm">No playlists yet</div>}
        </div>

        <IfOwnerOnly className="hidden" />
      </aside>

      {/* Main player */}
      <div
        ref={panelRef}
        className={`md:col-span-2 border rounded-2xl bg-white p-5 relative ${
          playlistOverlay ? "blur-sm opacity-80 pointer-events-none" : ""
        }`}
      >
        {grantToast && (
          <div className="absolute top-3 right-3 z-20 bg-green-600 text-white text-sm px-3 py-2 rounded-lg shadow">
            {grantToast}
          </div>
        )}

        {track ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{track.title}</div>
                <div className="text-sm text-gray-500 truncate">{track.artist}</div>
              </div>
              {(() => {
                const plAccess = accessMap[pid];
                return (
                  <div
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                      plAccess?.expiry && plAccess.expiry > Date.now()
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {plAccess?.expiry && plAccess.expiry > Date.now() ? (
                      <>
                        ✅ Unlocked <AccessTimer timeLeftMs={plAccess.expiry - Date.now()} />
                      </>
                    ) : (
                      `Locked (10s preview)`
                    )}
                    {accessLoading && (
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full"></span>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Audio element */}
            <audio
              key={track?.id || "none"}
              ref={audioRef}
              src={audioSrc}
              preload="metadata"
              controls={false}
              crossOrigin="anonymous"
              controlsList="nodownload noplaybackrate"
              onContextMenu={(e) => e.preventDefault()}
            />

            {/* Player UI */}
            <div className="rounded-2xl p-4 bg-[#121212] text-white shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-md bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shrink-0 overflow-hidden">
                  <span className="text-xs uppercase tracking-wider opacity-80">
                    {track?.title?.slice(0, 3) || "Pod"}
                  </span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    <button
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-60"
                      onClick={() => skip(-15)}
                      aria-label="Back 15 seconds"
                      disabled={!audioReady || !!audioError}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v2a5 5 0 1 0 5 5h2A7 7 0 1 1 12 5Z" fill="currentColor" />
                        <path d="M11 8v8l-5-4 5-4Z" fill="currentColor" />
                      </svg>
                    </button>

                    <button
                      className={`p-3 rounded-full ${
                        isPlaying ? "bg-white/90 text-black" : "bg-[#1DB954] text-black"
                      } hover:brightness-95 shadow disabled:opacity-60`}
                      onClick={togglePlay}
                      aria-label={isPlaying ? "Pause" : "Play"}
                      disabled={!!audioError || !audioReady}
                    >
                      {isPlaying ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7L8 5Z" />
                        </svg>
                      )}
                    </button>

                    <button
                      className="p-2 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-60"
                      onClick={() => skip(15)}
                      aria-label="Forward 15 seconds"
                      disabled={!audioReady || !!audioError}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M12 5v2a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z" fill="currentColor" />
                        <path d="M13 8v8l5-4-5-4Z" fill="currentColor" />
                      </svg>
                    </button>

                    <div className="ml-2 hidden sm:flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M5 10v4h3l4 3V7L8 10H5z" />
                      </svg>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={vol}
                        onChange={(e) => setVolume(parseFloat(e.target.value))}
                        className="w-28 accent-[#1DB954]"
                        disabled={!!audioError}
                      />
                    </div>

                    {!audioReady && !audioError && (
                      <span className="text-xs text-white/70">Loading audio…</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 select-none">
                    <span className="text-xs tabular-nums text-white/70 w-10 text-right">
                      {mmss(cur)}
                    </span>

                    <div
                      ref={barRef}
                      className="relative h-2 rounded-full bg-white/15 flex-1 cursor-pointer"
                      onClick={onBarClick}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-[#1DB954]"
                        style={{ width: `${(dur ? cur / dur : 0) * 100}%` }}
                      />
                      <div
                        className="absolute -top-1.5 h-5 w-5 rounded-full bg-white shadow -translate-x-1/2"
                        style={{ left: `${(dur ? cur / dur : 0) * 100}%` }}
                        onMouseDown={startDrag}
                        onTouchStart={startDrag}
                        role="slider"
                        aria-valuemin={0}
                        aria-valuemax={dur || 0}
                        aria-valuenow={cur || 0}
                        tabIndex={0}
                      />
                    </div>

                    <span className="text-xs tabular-nums text-white/70 w-10">
                      {mmss(dur)}
                    </span>
                  </div>

                  {!accessMap[pid]?.expiry && (
                    <div className="text-[11px] text-white/60 mt-2">
                      Preview will auto-stop at 10s. Subscribe to continue.
                    </div>
                  )}
                  {!!audioError && (
                    <div className="text-[11px] text-red-300 mt-2">{audioError}</div>
                  )}
                </div>
              </div>
            </div>

            <IfOwnerOnly>
              <div className="mt-3 flex gap-2">
                <button
                  className="text-xs px-3 py-1 rounded border"
                  onClick={async () => {
                    if (!pl || !track) return;
                    const newState = !track.locked;
                    await fetch(`${API_BASE}/api/podcasts/playlists/${pl.id}/items/${track.id}/lock`, {
                      method: "PATCH",
                      headers: { ...authHeaders(), "Content-Type": "application/json" },
                      body: JSON.stringify({ locked: newState }),
                    });
                    await load();
                  }}
                >
                  {track.locked ? "Unlock" : "Lock"}
                </button>
                <button
                  className="text-xs px-3 py-1 rounded border text-red-600"
                  onClick={async () => {
                    if (!pl || !track) return;
                    if (!confirm("Delete this audio item?")) return;
                    await fetch(`${API_BASE}/api/podcasts/playlists/${pl.id}/items/${track.id}`, {
                      method: "DELETE",
                      headers: authHeaders(),
                    });
                    await load();
                  }}
                >
                  Delete
                </button>
              </div>
            </IfOwnerOnly>
          </>
        ) : (
          <div className="text-gray-500">Select a playlist item</div>
        )}
      </div>

      {playlistOverlay && (
        <QROverlay
          open={!!playlistOverlay}
          onClose={() => setPlaylistOverlay(null)}
          title={playlistOverlay.name}
          subjectLabel="Podcast"
          inline
          focusRef={panelRef}
          feature="podcast"
          featureId={playlistOverlay.id}
        />
      )}
    </section>
  );
}
