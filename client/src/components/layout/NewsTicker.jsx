import { useEffect, useState } from "react";
import { API_BASE, fetchJSON, authHeaders } from "../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";

export default function NewsTicker() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: "", link: "", image: null });

  const load = async () => {
    const r = await fetchJSON(`${API_BASE}/api/news`);
    setItems(r.news || []);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    const fd = new FormData();
    fd.append("title", form.title.trim());
    fd.append("link", (form.link || "").trim());
    if (form.image) fd.append("image", form.image);
    await fetch(`${API_BASE}/api/news`, { method: "POST", headers: authHeaders(), body: fd });
    setForm({ title: "", link: "", image: null });
    await load();
  };

  const del = async (id) => {
    await fetch(`${API_BASE}/api/news/${id}`, { method: "DELETE", headers: authHeaders() });
    await load();
  };

  return (
    <section className="border-y bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3">
        {/* horizontal scroller */}
        <div className="flex gap-6 overflow-x-auto no-scrollbar items-center">
          {items.map((n) => (
            <div key={n.id || n._id} className="flex items-center gap-3 shrink-0">
              {!!n.image && (
                <img
                  src={`${API_BASE}${n.image}`}
                  alt=""
                  className="w-12 h-12 object-cover rounded-lg"
                  loading="lazy"
                />
              )}
              {n.link ? (
                <a
                  className="text-blue-600 hover:underline"
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                >
                  {n.title}
                </a>
              ) : (
                <span className="text-gray-800">{n.title}</span>
              )}
              <IfOwnerOnly>
                <button className="text-xs text-red-600" onClick={() => del(n.id || n._id)}>
                  Delete
                </button>
              </IfOwnerOnly>
            </div>
          ))}

          {items.length === 0 && <div className="text-gray-400">No news yet</div>}
        </div>

        {/* Admin compose (shows only for owner) */}
        <IfOwnerOnly className="mt-3">
          <form onSubmit={add} className="flex flex-wrap gap-2 items-center">
            <input
              className="border rounded p-2"
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <input
              className="border rounded p-2 min-w-[260px]"
              placeholder="Link https://"
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
            />
            <label className="border rounded p-2 cursor-pointer">
              Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setForm({ ...form, image: e.target.files?.[0] || null })}
              />
            </label>
            <button className="bg-black text-white px-4 py-2 rounded">Add</button>
          </form>
        </IfOwnerOnly>
      </div>
    </section>
  );
}
