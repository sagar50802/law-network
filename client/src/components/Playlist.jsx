import { useEffect, useRef, useState, useMemo } from "react";
import { getJSON, upload, delJSON, absUrl } from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";
import QROverlay from "../common/QROverlay";
import { loadAccess } from "../../utils/access";     // ✅ async
import AccessTimer from "../common/AccessTimer";    // ✅

function PlaylistCard({ p, email }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const pid = p.id || p._id;

  // ✅ keep access in state (async-safe) + tiny spinner
  const [access, setAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);

  // plain preview (first 5 items only)
  const preview = useMemo(() => (p.items || []).slice(0, 5), [p.items]);

  // ✅ initial fetch (async)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAccessLoading(true);
      try {
        const a = await loadAccess("playlist", pid, email);
        if (!cancelled) setAccess(a);
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pid, email]);

  // 🔔 Listen for global access events (update, grant, revoke) → async refresh
  useEffect(() => {
    async function refreshIfMatch() {
      setAccessLoading(true);
      try {
        const a = await loadAccess("playlist", pid, email);
        setAccess(a);
      } finally {
        setAccessLoading(false);
      }
    }

    function handleUpdate(e) {
      if (e.detail.feature === "playlist" && e.detail.featureId === pid && e.detail.email === email) {
        refreshIfMatch();
      }
    }

    function handleGranted(e) {
      if (e.detail.feature === "playlist" && e.detail.featureId === pid && e.detail.email === email) {
        setOpen(false); // ✅ auto close overlay immediately
        refreshIfMatch(); // ✅ refresh state
      }
    }

    function handleRevoked(e) {
      if (e.detail.feature === "playlist" && e.detail.featureId === pid && e.detail.email === email) {
        setAccess(null);   // ✅ instantly lock
        setOpen(true);     // ✅ reopen overlay immediately
      }
    }

    window.addEventListener("accessUpdated", handleUpdate);
    window.addEventListener("accessGranted", handleGranted);
    window.addEventListener("accessRevoked", handleRevoked);

    return () => {
      window.removeEventListener("accessUpdated", handleUpdate);
      window.removeEventListener("accessGranted", handleGranted);
      window.removeEventListener("accessRevoked", handleRevoked);
    };
  }, [pid, email]);

  // ✅ Refresh when window regains focus (no polling)
  useEffect(() => {
    const onFocus = async () => {
      setAccessLoading(true);
      try {
        const a = await loadAccess("playlist", pid, email);
        setAccess(a);
      } finally {
        setAccessLoading(false);
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [pid, email]);

  // ✅ Expiry-aware refresh: flip to 🔒 exactly when access expires
  useEffect(() => {
    if (!access?.expiry || access.expiry <= Date.now()) return;
    const delay = Math.max(0, access.expiry - Date.now() + 500); // small buffer
    const t = setTimeout(async () => {
      setAccessLoading(true);
      try {
        const a = await loadAccess("playlist", pid, email);
        setAccess(a);
      } finally {
        setAccessLoading(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [access?.expiry, pid, email]);

  // ✅ always re-check latest access before opening overlay (async)
  async function openOverlay() {
    setAccessLoading(true);
    try {
      const latest = await loadAccess("playlist", pid, email);
      if (latest?.expiry && latest.expiry > Date.now()) {
        setAccess(latest);
        return; // already unlocked → don’t reopen overlay
      }
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setOpen(true), 200);
    } finally {
      setAccessLoading(false);
    }
  }

  return (
    <div ref={cardRef} className="relative border rounded-2xl overflow-hidden bg-white">
      {p.image && (
        <img src={absUrl(p.image)} alt="" className="w-full h-48 object-cover" />
      )}

      <div className="p-4">
        <h3 className="font-bold text-lg">{p.title}</h3>

        {/* ✅ If unlocked → show full list + live timer */}
        {access?.expiry && access.expiry > Date.now() ? (
          <div className="mt-3">
            <ul className="list-disc pl-5">
              {p.items?.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            <div className="mt-2 text-green-600 text-sm flex items-center gap-2">
              <span>✅ Access Granted</span>
              <AccessTimer timeLeftMs={access.expiry - Date.now()} />
              {accessLoading && (
                <span className="animate-spin inline-block w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full"></span>
              )}
            </div>
          </div>
        ) : (
          // Locked → show preview + "Read more"
          <div className="mt-3">
            <ul className="list-disc pl-5 text-gray-600">
              {preview.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
              {p.items?.length > 5 && <li>…</li>}
            </ul>
            <button className="mt-2 text-blue-600 underline inline-flex items-center gap-2" onClick={openOverlay}>
              Read more
              {accessLoading && (
                <span className="animate-spin inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full"></span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* ✅ Only mount QROverlay if locked or expired */}
      {(!access?.expiry || access.expiry <= Date.now()) && (
        <QROverlay
          open={open}
          onClose={() => setOpen(false)}
          title={p.title}
          subjectLabel="Playlist"
          inline
          focusRef={cardRef}
          feature="playlist"
          featureId={pid}
        />
      )}
    </div>
  );
}

export default function Playlist({ limit }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({
    title: "",
    items: "",
    image: null,
  });

  // ✅ restore email from localStorage
  const [email] = useState(() => localStorage.getItem("userEmail") || "");

  async function load() {
    const r = await getJSON("/api/playlists");
    setItems(r.playlists || r.data || []);
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!form.title.trim()) return;

    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("items", form.items || "");
      if (form.image) fd.append("image", form.image);

      await upload("/api/playlists", fd);
      setForm({ title: "", items: "", image: null });
      await load();
      alert("✅ Playlist published");
    } catch (err) {
      console.error("Publish failed:", err);
      alert("❌ Failed to publish: " + (err?.message || "Unknown error"));
    }
  }

  async function remove(id) {
    try {
      await delJSON(`/api/playlists/${id}`);
      await load();
    } catch (err) {
      console.error("Delete failed:", err);
      alert("❌ Failed to delete");
    }
  }

  const list = limit ? items.slice(0, limit) : items;

  return (
    <section
      id="playlists"
      className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6"
    >
      {/* Feed */}
      <div className="md:col-span-2 space-y-4">
        {list.map((p) => (
          <div key={p.id || p._id} className="relative">
            <PlaylistCard p={p} email={email} />
            <IfOwnerOnly>
              <div className="absolute top-3 right-3">
                <button
                  className="text-xs bg-white/90 px-2 py-1 rounded border"
                  onClick={() => remove(p.id || p._id)}
                >
                  Delete
                </button>
              </div>
            </IfOwnerOnly>
          </div>
        ))}
        {list.length === 0 && <div className="text-gray-400">No playlists yet</div>}
      </div>

      {/* Admin compose */}
      <IfOwnerOnly className="md:col-span-1">
        <form onSubmit={create} className="border rounded-2xl p-4 grid gap-3">
          <h4 className="font-semibold">Post new Playlist</h4>

          <input
            className="border rounded p-2"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <textarea
            className="border rounded p-2 min-h-[120px]"
            placeholder="Items (comma separated)"
            value={form.items}
            onChange={(e) => setForm({ ...form, items: e.target.value })}
          />

          <label className="border rounded p-2 cursor-pointer w-fit">
            Upload Image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) =>
                setForm({ ...form, image: e.target.files?.[0] || null })
              }
            />
          </label>

          <button className="bg-black text-white px-4 py-2 rounded w-fit">
            Publish
          </button>
        </form>
      </IfOwnerOnly>
    </section>
  );
}
