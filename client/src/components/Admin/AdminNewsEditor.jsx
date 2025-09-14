import { useEffect, useState } from "react";
import { API_BASE, getJSON, authHeaders } from "../../utils/api";

export default function AdminNewsEditor() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: "", link: "", image: null });

  async function load() {
    const r = await getJSON("/api/news");
    setItems(r?.news || []);
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!form.title.trim()) return alert("Title required");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title.trim());
      fd.append("link", (form.link || "").trim());
      if (form.image) fd.append("image", form.image);

      const res = await fetch(`${API_BASE}/api/news`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) throw new Error(await res.text());
      setForm({ title: "", link: "", image: null });
      await load();
    } catch (e) {
      alert("Create failed: " + (e.message || ""));
    } finally {
      setBusy(false);
    }
  }

  async function patch(id, { title, link, image }) {
    const fd = new FormData();
    if (title != null) fd.append("title", title);
    if (link != null) fd.append("link", link);
    if (image) fd.append("image", image);

    const res = await fetch(`${API_BASE}/api/news/${id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: fd,
    });
    if (!res.ok) throw new Error(await res.text());
  }

  async function remove(id) {
    if (!confirm("Delete?")) return;
    const res = await fetch(`${API_BASE}/api/news/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) throw new Error(await res.text());
    await load();
  }

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">News Ticker</h3>

      <form onSubmit={create} className="grid gap-2 border rounded-2xl p-4 bg-white max-w-xl">
        <input
          className="border rounded p-2"
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          className="border rounded p-2"
          placeholder="Link https://"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
        />
        <label className="border rounded p-2 cursor-pointer w-fit">
          {form.image ? "Image selected" : "Choose image"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setForm({ ...form, image: e.target.files?.[0] || null })}
          />
        </label>
        <button className="bg-black text-white px-4 py-2 rounded w-fit disabled:opacity-60" disabled={busy}>
          {busy ? "Saving…" : "Create"}
        </button>
      </form>

      <div className="grid gap-3">
        {items.map((n) => (
          <div key={n.id} className="border rounded-2xl p-4 bg-white grid md:grid-cols-[160px_1fr_auto] gap-4">
            <img
              src={n.image ? `${API_BASE}${n.image}` : ""}
              alt=""
              className="w-full h-28 object-cover rounded-lg bg-gray-50"
            />
            <div className="grid gap-2">
              <LineEdit
                label="Title"
                value={n.title}
                onSave={async (v) => { await patch(n.id, { title: v }); await load(); }}
              />
              <LineEdit
                label="Link"
                value={n.link}
                onSave={async (v) => { await patch(n.id, { link: v }); await load(); }}
              />
              <label className="text-sm inline-flex items-center gap-2 w-fit">
                <span className="px-2 py-1 border rounded">Replace image</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    await patch(n.id, { image: f });
                    await load();
                  }}
                />
              </label>
            </div>
            <div className="flex items-start justify-end">
              <button className="px-3 py-1.5 rounded border text-red-600" onClick={() => remove(n.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-gray-500">No news yet</div>}
      </div>
    </div>
  );
}

function LineEdit({ label, value, onSave }) {
  const [v, setV] = useState(value || "");
  useEffect(() => setV(value || ""), [value]);
  return (
    <div className="grid gap-1">
      <label className="text-sm text-gray-600">{label}</label>
      <div className="flex gap-2">
        <input className="border rounded p-2 w-full" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="px-3 py-1.5 rounded border bg-green-50 text-green-700" onClick={() => onSave(v)}>
          Save
        </button>
      </div>
    </div>
  );
}
