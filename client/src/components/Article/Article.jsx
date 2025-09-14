import { useEffect, useRef, useState, useMemo } from "react";
import { getJSON, upload, delJSON, absUrl } from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";
// import QROverlay from "../common/QROverlay"; // QR overlay not used anymore
import { loadAccess } from "../../utils/access";
// import AccessTimer from "../common/AccessTimer"; // not used after free-unlock
import useSubmissionStream from "../../hooks/useSubmissionStream";

/* ---------- helpers ---------- */
function stripHtml(html = "") {
  return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
function readingTimeFromHtml(html = "") {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}
// normalize expiry to ms (handles Date, ISO string, number)
function toMs(x) {
  if (!x) return 0;
  if (typeof x === "number") return x;
  const t = Date.parse(x);
  return Number.isNaN(t) ? 0 : t;
}

function ArticleCard({ a, email }) {
  const [open, setOpen] = useState(false);
  const [access, setAccess] = useState(null);
  const [forceUnlocked, setForceUnlocked] = useState(false);
  const cardRef = useRef(null);

  // initial access load
  useEffect(() => {
    let dead = false;
    (async () => {
      const v = await loadAccess("article", a.id || a._id, email);
      if (!dead) setAccess(v || null);
    })();
    return () => {
      dead = true;
    };
  }, [a.id, a._id, email]);

  // derived display bits
  const plain = useMemo(() => stripHtml(a.content || ""), [a.content]);
  const preview = useMemo(() => plain.split(/\s+/).slice(0, 120).join(" "), [plain]);
  const readMin = useMemo(() => readingTimeFromHtml(a.content || ""), [a.content]);

  // react to global access events for THIS article
  useEffect(() => {
    async function refreshIfMatch(e) {
      const d = e.detail || {};
      if (d.feature === "article" && d.featureId === (a.id || a._id) && d.email === email) {
        const v = await loadAccess("article", a.id || a._id, email);
        setAccess(v || null);
        const ms = toMs(v?.expiry);
        if (ms && ms > Date.now()) setForceUnlocked(true);
      }
    }
    async function onGranted(e) {
      const d = e.detail || {};
      if (d.feature === "article" && d.featureId === (a.id || a._id) && d.email === email) {
        setForceUnlocked(true); // prevent any flicker
        const v = await loadAccess("article", a.id || a._id, email);
        setAccess(v || null);
        setOpen(false);
      }
    }
    function onSoftRefresh() {
      (async () => {
        const v = await loadAccess("article", a.id || a._id, email);
        setAccess(v || null);
        const ms = toMs(v?.expiry);
        if (ms && ms > Date.now()) setForceUnlocked(true);
      })();
    }

    window.addEventListener("accessUpdated", refreshIfMatch);
    window.addEventListener("accessGranted", onGranted);
    window.addEventListener("softRefresh", onSoftRefresh);
    return () => {
      window.removeEventListener("accessUpdated", refreshIfMatch);
      window.removeEventListener("accessGranted", onGranted);
      window.removeEventListener("softRefresh", onSoftRefresh);
    };
  }, [a.id, a._id, email]);

  // Clicking "Read more" now permanently unlocks this article for the session
  async function openOverlay() {
    setForceUnlocked(true); // ✅ Direct unlock
    setOpen(false);
  }

  // free articles are always unlocked
  const isFree = !!(a?.isFree ?? a?.free);
  // ✅ Always unlocked once user clicks "Read more"
  const unlocked = isFree || forceUnlocked;

  useEffect(() => {
    if (open && unlocked) setOpen(false);
  }, [open, unlocked]);

  return (
    <article
      className="relative overflow-hidden rounded-2xl border bg-white/95 shadow-sm"
      ref={cardRef}
    >
      {(a.image || a.imageUrl) && (
        <div className="w-full bg-gray-50 rounded-t-2xl">
          <img
            src={absUrl(a.image || a.imageUrl)}
            alt=""
            className="w-full max-h-64 object-contain mx-auto"
            loading="lazy"
          />
        </div>
      )}

      {/* Title row */}
      <div className="px-4 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-extrabold text-xl tracking-tight">{a.title}</h3>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
            {readMin} min read
          </span>

          {isFree ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              Free
            </span>
          ) : unlocked ? (
            // ✅ No AccessTimer / expiry message anymore
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              Reading unlocked
            </span>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        {unlocked ? (
          a.allowHtml ? (
            // HTML mode: keep author's CSS intact
            <div className="not-prose html-embed">
              <style>{`
                .html-embed img, .html-embed video, .html-embed iframe { max-width: 100%; height: auto; }
                .html-embed .container { max-width: 100%; }
              `}</style>
              <div dangerouslySetInnerHTML={{ __html: a.content }} />
            </div>
          ) : (
            <div className="prose max-w-none prose-p:leading-7 prose-p:my-3 prose-img:rounded-lg prose-img:max-h-96 prose-img:object-contain">
              <p className="leading-7">{a.content}</p>
            </div>
          )
        ) : (
          <div className="relative">
            <p className="leading-7 text-[17px] text-gray-700">{preview}…</p>
            <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-10 bg-gradient-to-t from-white to-transparent" />
            <div className="mt-3 flex items-center justify-between">
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                onClick={openOverlay}
              >
                Read more
              </button>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                Locked
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ❌ No QROverlay — removed intentionally */}
    </article>
  );
}

/**
 * Article list
 * - Default: Articles page (feed + compact admin column)
 * - embed: just the feed
 */
export default function Article({ limit, embed = false }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    title: "",
    content: "",
    allowHtml: false,
    isFree: false,
    image: null,
  });

  // email for access checks (saved previously by overlay; harmless to keep)
  const [email] = useState(() => localStorage.getItem("userEmail") || "");

  // live grant/revoke events (SSE)
  useSubmissionStream(email);

  async function load() {
    const r = await getJSON("/api/articles");
    setItems(r.articles || r.data || []);
  }
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const noop = () => {};
    window.addEventListener("softRefresh", noop);
    return () => window.removeEventListener("softRefresh", noop);
  }, []);

  async function create(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("content", form.content || "");
      fd.append("allowHtml", String(form.allowHtml));
      fd.append("isFree", String(form.isFree));
      if (form.image) fd.append("image", form.image);
      await upload("/api/articles", fd);
      setForm({ title: "", content: "", allowHtml: false, isFree: false, image: null });
      await load();
      alert("✅ Article published");
    } catch (err) {
      console.error("Publish failed:", err);
      alert("❌ Failed to publish: " + (err?.message || "Unknown error"));
    }
  }

  async function remove(id) {
    try {
      await delJSON(`/api/articles/${id}`);
      await load();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("❌ Failed to delete");
    }
  }

  const list = limit ? items.slice(0, limit) : items;

  // ---------- EMBED MODE ----------
  if (embed) {
    return (
      <div className="space-y-6">
        {list.map((a) => (
          <div key={a.id || a._id} className="relative">
            <ArticleCard a={a} email={email} />
            <IfOwnerOnly>
              <div className="absolute top-3 right-3">
                <button
                  className="text-xs bg-white/90 px-2 py-1 rounded border"
                  onClick={() => remove(a.id || a._id)}
                >
                  Delete
                </button>
              </div>
            </IfOwnerOnly>
          </div>
        ))}
        {list.length === 0 && <div className="text-gray-400">No articles yet</div>}
      </div>
    );
  }

  // ---------- DEFAULT MODE (Articles page) ----------
  return (
    <section
      id="articles"
      className="w-[90%] mx-auto py-8 grid gap-6 md:[grid-template-columns:minmax(0,1fr)_max-content]"
    >
      {/* Feed */}
      <div className="space-y-6">
        {list.map((a) => (
          <div key={a.id || a._id} className="relative">
            <ArticleCard a={a} email={email} />
            <IfOwnerOnly>
              <div className="absolute top-3 right-3">
                <button
                  className="text-xs bg-white/90 px-2 py-1 rounded border"
                  onClick={() => remove(a.id || a._id)}
                >
                  Delete
                </button>
              </div>
            </IfOwnerOnly>
          </div>
        ))}
        {list.length === 0 && <div className="text-gray-400">No articles yet</div>}
      </div>

      {/* Admin compose — compact/narrow; collapses to 0 width when hidden for users */}
      <IfOwnerOnly>
        <form
          onSubmit={create}
          className="border rounded-2xl p-3 grid gap-2 bg-white text-sm md:sticky md:top-24 min-w-[240px] max-w-[260px]"
        >
          <h4 className="font-semibold text-base">Post new Article</h4>

          <input
            className="border rounded px-2 py-1.5"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <textarea
            className="border rounded px-2 py-1.5 min-h-[120px]"
            placeholder="Content (HTML allowed if checked)"
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowHtml}
              onChange={(e) => setForm({ ...form, allowHtml: e.target.checked })}
            />
            Render as HTML (viewer sees formatted content)
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.isFree}
              onChange={(e) => setForm({ ...form, isFree: e.target.checked })}
            />
            Make this article Free (no unlock)
          </label>

          <label className="border rounded px-2 py-1.5 cursor-pointer w-fit">
            Upload Image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setForm({ ...form, image: e.target.files?.[0] || null })}
            />
          </label>

          <button className="bg-black text-white px-3 py-1.5 rounded w-fit">Publish</button>
        </form>
      </IfOwnerOnly>
    </section>
  );
}
