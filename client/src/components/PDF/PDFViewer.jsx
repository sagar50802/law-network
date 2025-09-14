// src/components/pdfs/PDFViewer.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { API_BASE, fetchJSON, authHeaders } from "../../utils/api";
import usePreviewLock from "../../hooks/usePreviewLock";
import IfOwnerOnly from "../common/IfOwnerOnly";
import QROverlay from "../common/QROverlay";
import { loadAccess } from "../../utils/access";
import AccessTimer from "../common/AccessTimer";
import useAccessSync from "../../hooks/useAccessSync";
import useSubmissionStream from "../../hooks/useSubmissionStream";

// Worker for react-pdf (Vite-safe)
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

export default function PDFViewer() {
  const [subjects, setSubjects] = useState([]); // [{id,name,slug?,chapters:[{id,title,url,locked}]}]
  const [sid, setSid] = useState(null);
  const [chapter, setChapter] = useState(null);
  const [numPages, setNumPages] = useState(1);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);

  // Access + UI
  const [accessMap, setAccessMap] = useState({});
  const [accessLoading, setAccessLoading] = useState(false);
  const [grantToast, setGrantToast] = useState(null);

  const panelRef = useRef(null);
  const [subjectOverlay, setSubjectOverlay] = useState(null); // overlay controller
  const [forceBlur, setForceBlur] = useState(false); // ⬅️ NEW: keep panel blurred after manual-close

  const [email] = useState(() => localStorage.getItem("userEmail") || "");

  // 🔊 Live server events (SSE / polling)
  useSubmissionStream(email);

  // Grants may arrive before subjects are loaded
  const pendingEventsRef = useRef([]);

  // ---------- helpers: id normalization + persistence ----------
  const resolveSubjectId = (featureId) => {
    if (!featureId) return null;
    const fid = String(featureId).trim().toLowerCase();
    const byId = subjects.find((s) => String(s.id).toLowerCase() === fid);
    if (byId) return byId.id;
    const byName = subjects.find(
      (s) => String(s.name || s.title || "").toLowerCase() === fid
    );
    if (byName) return byName.id;
    const bySlug = subjects.find((s) => String(s.slug || "").toLowerCase() === fid);
    if (bySlug) return bySlug.id;
    return null;
  };

  const persistLocalAccess = (subjectId, expiry) => {
    try {
      const key = `pdf:${subjectId}:${email}`;
      const store = JSON.parse(localStorage.getItem("access") || "{}");
      store[key] = { expiry };
      localStorage.setItem("access", JSON.stringify(store));
    } catch {}
  };

  const clearLocalAccess = (subjectId) => {
    try {
      const key = `pdf:${subjectId}:${email}`;
      const store = JSON.parse(localStorage.getItem("access") || "{}");
      if (store[key]) {
        delete store[key];
        localStorage.setItem("access", JSON.stringify(store));
      }
    } catch {}
  };

  // Read access by id + aliases (name/slug) and choose the latest expiry
  const getAccessForSubject = async (subj) => {
    const candidates = [];
    candidates.push(await loadAccess("pdf", subj.id, email));
    if (subj.name) candidates.push(await loadAccess("pdf", subj.name, email));
    if (subj.slug) candidates.push(await loadAccess("pdf", subj.slug, email));
    const valid = candidates.filter((x) => x?.expiry && x.expiry > Date.now());
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => (a.expiry > b.expiry ? a : b));
  };

  const applyGrant = async ({ featureId, expiry, message }) => {
    const normalizedId = resolveSubjectId(featureId);
    if (!normalizedId) {
      pendingEventsRef.current.push({ type: "grant", featureId, expiry, message });
      return;
    }

    persistLocalAccess(normalizedId, expiry);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: { expiry, source: "event" } }));
    setSubjectOverlay(null);
    setForceBlur(false); // ⬅️ clear any manual blur on successful grant

    const savedName = localStorage.getItem("userName");
    const fallbackName = email ? email.split("@")[0] : "User";
    const name = savedName || fallbackName || "User";
    setGrantToast(message || `🎉 Congratulations ${name}! Your access has been unlocked.`);
    setTimeout(() => setGrantToast(null), 4500);

    // confirm with backend
    const fresh = await loadAccess("pdf", normalizedId, email);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: fresh }));
  };

  const applyRevoke = ({ featureId }) => {
    const normalizedId = resolveSubjectId(featureId);
    if (!normalizedId) {
      pendingEventsRef.current.push({ type: "revoke", featureId });
      return;
    }
    clearLocalAccess(normalizedId);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: null }));
    const target = subjects.find((s) => String(s.id) === String(normalizedId));
    if (target) setSubjectOverlay(target);
    setForceBlur(true); // ⬅️ keep it blurred after a revoke
  };

  // ---------- data load ----------
  const load = async () => {
    setAccessLoading(true);
    const r = await fetchJSON(`${API_BASE}/api/pdfs`);
    const subs = r.subjects || [];
    setSubjects(subs);
    if (!sid && subs[0]) setSid(subs[0].id);

    const newAccess = {};
    for (const s of subs) {
      newAccess[s.id] = await getAccessForSubject(s);
    }
    setAccessMap(newAccess);
    setAccessLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile queued events once subjects are ready
  useEffect(() => {
    if (!subjects.length || pendingEventsRef.current.length === 0) return;
    const queue = pendingEventsRef.current.splice(0, pendingEventsRef.current.length);
    for (const ev of queue) {
      if (ev.type === "grant") applyGrant(ev);
      if (ev.type === "revoke") applyRevoke(ev);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.length]);

  // Select first chapter when subject changes
  useEffect(() => {
    if (!sid) return;
    const s = subjects.find((x) => x.id === sid);
    if (s && s.chapters?.[0]) {
      setChapter(s.chapters[0]);
      setPage(1);
      setScale(1);
      setSubjectOverlay(null);
      // do not auto-clear forceBlur here; we respect user's manual close intent
    } else {
      setChapter(null);
    }
  }, [sid, subjects]);

  // When the current subject becomes unlocked, remove manual blur
  useEffect(() => {
    const a = accessMap[sid];
    if (a?.expiry && a.expiry > Date.now()) setForceBlur(false);
  }, [accessMap, sid]);

  // 2s preview lock (per chapter)
  const lock = usePreviewLock({
    type: "notebook",
    id: chapter?.id || "none",
    previewSeconds: 2,
  });

  // After 2s (if current SUBJECT is locked), open overlay
  useEffect(() => {
    if (!chapter) return;
    const currentAccess = accessMap[sid];
    if (currentAccess?.expiry && currentAccess.expiry > Date.now()) return; // unlocked
    if (lock.unlocked) return;

    const t = setTimeout(() => {
      const subj = subjects.find((x) => x.id === sid);
      if (subj) setSubjectOverlay(subj);
    }, 2000);
    return () => clearTimeout(t);
  }, [chapter?.id, sid, subjects, lock.unlocked, accessMap]);

  const onDocLoad = ({ numPages }) => {
    setNumPages(numPages || 1);
    setPage(1);
  };

  // Refresh all access (smooth UI)
  const refreshAllAccess = async () => {
    if (subjects.length === 0) return;
    setAccessLoading(true);
    const next = {};
    for (const s of subjects) {
      next[s.id] = await getAccessForSubject(s);
    }
    setAccessMap(next);
    setAccessLoading(false);
  };

  // Live sync from events
  useAccessSync(async (detail) => {
    if (!detail || detail.email !== email || detail.feature !== "pdf") return;

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

    // fallback: verify single feature
    const normalizedId = resolveSubjectId(detail.featureId) || detail.featureId;
    const stillHas = await loadAccess("pdf", normalizedId, email);
    setAccessMap((prev) => ({ ...prev, [normalizedId]: stillHas }));
    if (!stillHas) {
      const target = subjects.find((s) => String(s.id) === String(normalizedId));
      if (target) setSubjectOverlay(target);
      setForceBlur(true);
    } else {
      setSubjectOverlay(null);
      setForceBlur(false);
    }
  });

  // Refresh on focus
  useEffect(() => {
    const onFocus = () => refreshAllAccess();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, email]);

  // 🔔 Silent soft refresh trigger (from QROverlay auto-close)
  useEffect(() => {
    const doRefresh = () => refreshAllAccess();
    window.addEventListener("softRefresh", doRefresh);
    return () => window.removeEventListener("softRefresh", doRefresh);
  }, []);

  // Flip UI exactly at nearest expiry
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

  // ---- Admin actions ----
  const [newSubject, setNewSubject] = useState("");
  const [form, setForm] = useState({ title: "", file: null, locked: true });

  const createSubject = async (e) => {
    e.preventDefault();
    await fetch(`${API_BASE}/api/pdfs/subjects`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: newSubject || "New Subject" }),
    });
    setNewSubject("");
    await load();
  };

  const uploadPDF = async (e) => {
    e.preventDefault();
    if (!sid || !form.file) return;
    const fd = new FormData();
    fd.append("title", form.title || "Untitled");
    fd.append("locked", String(form.locked));
    fd.append("pdf", form.file);
    await fetch(`${API_BASE}/api/pdfs/subjects/${sid}/chapters`, {
      method: "POST",
      headers: authHeaders(),
      body: fd,
    });
    setForm({ title: "", file: null, locked: true });
    await load();
  };

  const delChapter = async (cid) => {
    await fetch(`${API_BASE}/api/pdfs/subjects/${sid}/chapters/${cid}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    await load();
  };

  const toggleLock = async (cid, newState) => {
    await fetch(`${API_BASE}/api/pdfs/subjects/${sid}/chapters/${cid}/lock`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ locked: newState }),
    });
    await load();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowRight") setPage((p) => Math.min(numPages, p + 1));
      if (e.key === "ArrowLeft") setPage((p) => Math.max(1, p - 1));
      if (e.key === "+" || e.key === "=")
        setScale((s) => Math.min(2, +(s + 0.1).toFixed(2)));
      if (e.key === "-") setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(2)));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [numPages]);

  const s = subjects.find((x) => x.id === sid);
  const canPrev = useMemo(() => page > 1, [page]);
  const canNext = useMemo(() => page < numPages, [page, numPages]);

  const unlocked =
    accessMap[sid]?.expiry && accessMap[sid].expiry > Date.now();

  return (
    <section
      id="pdf"
      className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {/* Sidebar: subjects & chapters */}
      <aside className="md:col-span-1 border rounded-2xl bg-white">
        <div className="p-3 border-b font-semibold">PDF Notebook</div>
        <div className="p-3 space-y-3 max-h-[60vh] overflow-auto">
          {subjects.map((sub) => {
            const subjAccess = accessMap[sub.id];

            return (
              <div
                key={sub.id}
                className={`border rounded-xl ${
                  sid === sub.id ? "ring-2 ring-blue-500" : ""
                }`}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <button
                    onClick={() => setSid(sub.id)}
                    className="text-left font-medium flex-1"
                  >
                    {sub.name}
                  </button>

                  {subjAccess?.expiry && subjAccess.expiry > Date.now() ? (
                    <div className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full animate-pulse">
                      <span>✅ Unlocked</span>
                      <AccessTimer timeLeftMs={subjAccess.expiry - Date.now()} />
                      {accessLoading && (
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-green-700 border-t-transparent rounded-full"></span>
                      )}
                    </div>
                  ) : (
                    <button
                      className="flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-1 rounded"
                      onClick={() => {
                        setSubjectOverlay(sub);
                        setForceBlur(false); // overlay will blur via subjectOverlay
                      }}
                    >
                      <span>Unlock</span>
                      {accessLoading && (
                        <span className="animate-spin inline-block w-3 h-3 border-2 border-white/80 border-t-transparent rounded-full"></span>
                      )}
                    </button>
                  )}
                </div>

                {sid === sub.id && (
                  <div className="px-2 pb-2 space-y-1">
                    {(sub.chapters || []).map((ch) => {
                      const effectiveAccess =
                        subjAccess?.expiry && subjAccess.expiry > Date.now()
                          ? subjAccess
                          : null;

                      return (
                        <div
                          key={ch.id}
                          className={`px-2 py-2 rounded cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                            chapter?.id === ch.id ? "bg-gray-50" : ""
                          }`}
                          onClick={() => {
                            setChapter(ch);
                            setScale(1);
                            setPage(1);
                          }}
                        >
                          <div className="truncate">
                            <div className="text-sm font-medium truncate">
                              {ch.title}
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
                    {(sub.chapters || []).length === 0 && (
                      <div className="text-xs text-gray-500 px-2 pb-2">
                        No chapters
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {subjects.length === 0 && (
            <div className="text-gray-500 text-sm">No subjects yet</div>
          )}
        </div>

        {/* Admin: create subject */}
        <IfOwnerOnly className="p-3 border-t">
          <form onSubmit={createSubject} className="grid grid-cols-[1fr_auto] gap-2">
            <input
              className="border rounded p-2"
              placeholder="New subject name"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
            <button className="bg-black text-white px-3 rounded">Add</button>
          </form>
        </IfOwnerOnly>
      </aside>

      {/* Main viewer (blurs while overlay is open, or if user closed overlay manually without submitting) */}
      <div
        ref={panelRef}
        className={`md:col-span-2 border rounded-2xl bg-white p-5 relative ${
          (subjectOverlay || (forceBlur && !unlocked))
            ? "blur-sm opacity-80 pointer-events-none"
            : ""
        }`}
      >
        {/* 🎉 Congrats toast */}
        {grantToast && (
          <div className="absolute top-3 right-3 z-20 bg-green-600 text-white text-sm px-3 py-2 rounded-lg shadow">
            {grantToast}
          </div>
        )}

        {chapter ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold">{chapter.title}</div>
              {(() => {
                const subjAccess = accessMap[sid];
                return (
                  <div
                    className={`text-xs px-2 py-1 rounded-full ${
                      subjAccess?.expiry && subjAccess.expiry > Date.now()
                        ? "bg-green-100 text-green-700 animate-pulse"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {subjAccess?.expiry && subjAccess.expiry > Date.now() ? (
                      <>
                        ✅ Unlocked{" "}
                        <AccessTimer timeLeftMs={subjAccess.expiry - Date.now()} />
                      </>
                    ) : (
                      `Locked (${lock.countLeft}s preview)`
                    )}
                    {accessLoading && (
                      <span className="ml-1 align-middle animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full"></span>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-center gap-3 mb-3 text-sm">
              <button
                onClick={() => setScale((s) => Math.max(0.6, +(s - 0.1).toFixed(2)))}
                className="px-3 py-1 rounded border"
              >
                -
              </button>
              <span>{Math.round(scale * 100)}%</span>
              <button
                onClick={() => setScale((s) => Math.min(2, +(s + 0.1).toFixed(2)))}
                className="px-3 py-1 rounded border"
              >
                +
              </button>
              <button onClick={() => setScale(1)} className="px-3 py-1 rounded border">
                Reset
              </button>

              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`px-3 py-1 rounded border ${
                  page <= 1 ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Prev
              </button>
              <span>
                Page {page} / {numPages}
              </span>
              <button
                disabled={page >= numPages}
                onClick={() => setPage((p) => Math.min(numPages, p + 1))}
                className={`px-3 py-1 rounded border ${
                  page >= numPages ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                Next
              </button>
            </div>

            <div
              className={`bg-white shadow-lg p-3 max-h-[70vh] overflow-auto rounded-xl ${
                accessMap[sid]?.expiry ? "" : "select-none"
              }`}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Document
                file={`${API_BASE}${chapter.url}`}
                onLoadSuccess={onDocLoad}
                renderMode="canvas"
                loading={<div className="p-6 text-gray-500">Loading PDF…</div>}
              >
                <Page
                  pageNumber={page}
                  scale={scale}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </Document>
            </div>

            {/* Admin actions */}
            <IfOwnerOnly>
              <div className="mt-3 flex gap-2">
                <button
                  className="text-xs px-3 py-1 rounded border"
                  onClick={() => toggleLock(chapter.id, !chapter.locked)}
                >
                  {chapter.locked ? "Unlock" : "Lock"}
                </button>
                <button
                  className="text-xs px-3 py-1 rounded border text-red-600"
                  onClick={() => delChapter(chapter.id)}
                >
                  Delete
                </button>
              </div>
            </IfOwnerOnly>
          </>
        ) : (
          <div className="text-gray-500">Select a chapter</div>
        )}
      </div>

      {/* Keep overlay COMPLETELY OUTSIDE the blurred panel so it stays crisp */}
      {subjectOverlay && (
        <QROverlay
          open={!!subjectOverlay}
          onClose={() => {
            setSubjectOverlay(null);
            setForceBlur(true); // ⬅️ user closed without submitting → keep panel blurred
          }}
          title={subjectOverlay.name}
          subjectLabel="PDF Notebook"
          inline
          focusRef={panelRef}
          feature="pdf"
          featureId={subjectOverlay.id}
        />
      )}

      {/* Admin upload (kept outside the blurred panel logic) */}
      {chapter && (
        <IfOwnerOnly>
          <form onSubmit={uploadPDF} className="md:col-span-3 mt-6 border-t pt-4 grid gap-2">
            <div className="font-semibold">Upload chapter (PDF) to subject</div>
            <div className="grid md:grid-cols-3 gap-2">
              <input
                className="border rounded p-2"
                placeholder="Chapter title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.locked}
                  onChange={(e) => setForm({ ...form, locked: e.target.checked })}
                />
                Locked by default
              </label>
            </div>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) =>
                setForm({ ...form, file: e.target.files?.[0] || null })
              }
            />
            <div className="text-xs text-gray-500">Subject: {s?.name || "—"}</div>
            <button
              className="bg-black text-white px-4 py-2 rounded w-fit"
              disabled={!sid || !form.file}
            >
              Upload
            </button>
          </form>
        </IfOwnerOnly>
      )}
    </section>
  );
}
