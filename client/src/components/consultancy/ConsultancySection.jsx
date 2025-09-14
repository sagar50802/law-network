// client/src/components/consultancy/ConsultancySection.jsx
import { useEffect, useRef, useState } from "react";
import { API_BASE, authHeaders } from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";

/* ---------- helpers ---------- */
function safeAuthHeaders() {
  const h = (typeof authHeaders === "function" ? authHeaders() : {}) || {};
  const out = {};
  if (h.Authorization) out.Authorization = h.Authorization;
  if (h.authorization) out.authorization = h.authorization;
  if (h["X-Owner-Key"]) out["X-Owner-Key"] = h["X-Owner-Key"];
  if (h["x-owner-key"]) out["x-owner-key"] = h["x-owner-key"];
  return out;
}
async function uploadSlide({ title, intro, file }) {
  const fd = new FormData();
  fd.append("title", title || "Untitled");
  if (intro != null) fd.append("intro", intro);
  if (file) fd.append("image", file);
  const res = await fetch(`${API_BASE}/api/consultancy`, {
    method: "POST",
    headers: safeAuthHeaders(),
    body: fd,
  });
  if (!res.ok) throw new Error(`POST /api/consultancy ${res.status}`);
  return res.json();
}
async function patchSlide(id, { title, intro, file }) {
  const fd = new FormData();
  if (title != null) fd.append("title", title);
  if (intro != null) fd.append("intro", intro);
  if (file) fd.append("image", file);
  const res = await fetch(`${API_BASE}/api/consultancy/${id}`, {
    method: "PATCH",
    headers: safeAuthHeaders(),
    body: fd,
  });
  if (!res.ok) throw new Error(`PATCH /api/consultancy/${id} ${res.status}`);
  return res.json();
}
async function delSlide(id) {
  const res = await fetch(`${API_BASE}/api/consultancy/${id}`, {
    method: "DELETE",
    headers: safeAuthHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE /api/consultancy/${id} ${res.status}`);
}

/* ---------- component ---------- */
export default function ConsultancySection({ autoScroll = true }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const railRef = useRef(null);
  const pausedRef = useRef(false);
  const visibleRef = useRef(true);

  async function load() {
    try {
      const r = await fetch(`${API_BASE}/api/consultancy`).then((x) => x.json());
      setItems(r?.items || r?.slides || []);
    } catch (e) {
      console.error("Consultancy load failed:", e);
    }
  }
  useEffect(() => { load(); }, []);

  // Vertical auto-scroll with smooth up<->down reversal + brief dwell at ends
  useEffect(() => {
    if (!autoScroll) return;
    const el = railRef.current;
    if (!el) return;

    let raf = 0;
    let last = performance.now();

     const SPEED = 108;      // px/sec (you can nudge 96/108 if you want faster)
    const DWELL = 650;     // ms pause when reaching top/bottom
    const dirRef = { cur: 1 };     // 1 = down, -1 = up
    let holdUntil = 0;             // timestamp until which we pause at ends

    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = entry?.isIntersecting ?? true;
    }, { threshold: 0.05 });
    io.observe(el);

    const tick = (now) => {
      const dt = now - last;
      last = now;

      if (visibleRef.current && !pausedRef.current && el.scrollHeight > el.clientHeight) {
        // hold at the ends for a moment before reversing
        if (now >= holdUntil) {
          const max = el.scrollHeight - el.clientHeight;
          const delta = (SPEED * dt) / 1000 * dirRef.cur;
          let next = el.scrollTop + delta;

          if (next <= 0) {
            next = 0;
            dirRef.cur = 1;
            holdUntil = now + DWELL;
          } else if (next >= max) {
            next = max;
            dirRef.cur = -1;
            holdUntil = now + DWELL;
          }
          el.scrollTop = next;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const pause = () => (pausedRef.current = true);
    const resume = () => (pausedRef.current = false);

    el.addEventListener("mouseenter", pause);
    el.addEventListener("mouseleave", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume);

    let wheelTO = 0;
    const onWheel = () => {
      pause();
      clearTimeout(wheelTO);
      wheelTO = window.setTimeout(resume, 900);
    };
    el.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      el.removeEventListener("mouseenter", pause);
      el.removeEventListener("mouseleave", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
      el.removeEventListener("wheel", onWheel);
      clearTimeout(wheelTO);
    };
  }, [autoScroll, items.length]);

  // quick owner add controls
  const [openAdd, setOpenAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [file, setFile] = useState(null);

  async function onCreate(e) {
    e?.preventDefault?.();
    if (!title.trim()) return alert("Please enter a title.");
    if (!file) return alert("Choose an image first.");
    setBusy(true);
    try {
      const saved = await uploadSlide({ title: title.trim(), intro: intro.trim(), file });
      const slide = saved?.item || saved?.slide || saved?.data || saved;
      setItems((prev) => [slide, ...prev]);
      setTitle(""); setIntro(""); setFile(null); setOpenAdd(false);
    } catch (err) {
      console.error(err);
      alert("Failed to create slide");
    } finally { setBusy(false); }
  }

  async function onReplace(s, newFile) {
    if (!newFile) return;
    setBusy(true);
    try { await patchSlide(s.id || s._id, { file: newFile }); await load(); }
    catch (err) { console.error(err); alert("Failed to replace image"); }
    finally { setBusy(false); }
  }
  async function onDelete(s) {
    if (!confirm("Delete this slide?")) return;
    setBusy(true);
    try { await delSlide(s.id || s._id); setItems((p) => p.filter((x) => (x.id || x._id) !== (s.id || s._id))); }
    catch (err) { console.error(err); alert("Failed to delete"); }
    finally { setBusy(false); }
  }

  // 0% extra top spacing, so it butts up nicely with Articles in your layout
  return (
    <section className="mt-0">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-2xl font-semibold">Consultancy</h2>
        <IfOwnerOnly>
          <div className="flex items-center gap-2">
            <button
              className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50"
              onClick={() => setOpenAdd((v) => !v)}
            >
              {openAdd ? "Close" : "Add card"}
            </button>
            <button className="text-xs px-2 py-1 rounded border" onClick={() => load()} disabled={busy}>
              Refresh
            </button>
          </div>
        </IfOwnerOnly>
      </div>

      <IfOwnerOnly>
        {openAdd && (
          <form
            onSubmit={onCreate}
            className="mb-2 grid gap-2 border rounded-xl p-3 bg-white text-sm max-w-md"
          >
            <input
              className="border rounded px-2 py-1.5"
              placeholder="Title (required)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="border rounded p-2 min-h-[70px]"
              placeholder="Short intro (optional)"
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <button
                className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
                disabled={busy || !file || !title.trim()}
              >
                {busy ? "Saving…" : "Create"}
              </button>
            </div>
          </form>
        )}
      </IfOwnerOnly>

      {/* vertical rail */}
      <div className="relative overflow-hidden rounded-2xl border bg-white">
        <div
          ref={railRef}
          className="flex flex-col gap-3 overflow-y-auto overflow-x-hidden scroll-smooth p-3"
          style={{ maxHeight: 520 }}
        >
          {items.map((it) => (
            <Card
              key={it._id || it.id}
              item={it}
              onReplace={(f) => onReplace(it, f)}
              onDelete={() => onDelete(it)}
            />
          ))}
          {items.length === 0 && (
            <div className="text-gray-500 p-6">No consultancy cards yet</div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------- Card: photo first (contain), details below ---------- */
function Card({ item, onReplace, onDelete }) {
  const imgPath =
    item.image?.startsWith?.("/uploads")
      ? `${API_BASE}${item.image}`
      : item.imageUrl || `${API_BASE}${item.image || ""}`;

  return (
    <div className="w-full rounded-2xl border bg-white shadow-sm ring-1 ring-black/5">
      <div className="relative p-2">
        <div
          className="h-[260px] md:h-[280px] rounded-xl bg-gradient-to-br from-gray-50 to-gray-100
                     flex items-center justify-center overflow-hidden ring-1 ring-gray-200"
        >
          {imgPath ? (
            <img
              src={imgPath}
              alt={item.title || "Consultancy"}
              className="max-h-[96%] max-w-[96%] object-contain transition-transform duration-500"
              loading="lazy"
            />
          ) : (
            <div className="text-gray-400 text-sm">No image</div>
          )}
        </div>

        <IfOwnerOnly>
          <div className="absolute top-3 right-3 flex items-center gap-1">
            <label className="text-[11px] px-2 py-0.5 rounded bg-white/95 border cursor-pointer hover:bg-white">
              Replace
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onReplace(e.target.files?.[0] || null)}
              />
            </label>
            <button
              className="text-[11px] px-2 py-0.5 rounded bg-white/95 border text-red-600 hover:bg-white"
              onClick={(ev) => { ev.preventDefault(); onDelete(); }}
            >
              Delete
            </button>
          </div>
        </IfOwnerOnly>
      </div>

      <div className="px-3 pb-3">
        <div className="font-semibold text-gray-900 text-sm truncate">
          {item.title || "—"}
        </div>
        <div className="text-xs text-gray-600 line-clamp-2">
          {item.intro || ""}
        </div>
      </div>
    </div>
  );
}
