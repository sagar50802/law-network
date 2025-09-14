import { useEffect, useState } from "react";
import { API_BASE, getJSON, delJSON, authHeaders } from "../../utils/api";

/* ---- headers for multipart ---- */
function safeAuthHeaders() {
  const h = (typeof authHeaders === "function" ? authHeaders() : {}) || {};
  const out = {};
  if (h.Authorization) out.Authorization = h.Authorization;
  if (h.authorization) out.authorization = h.authorization;
  if (h["X-Owner-Key"]) out["X-Owner-Key"] = h["X-Owner-Key"];
  if (h["x-owner-key"]) out["x-owner-key"] = h["x-owner-key"];
  return out;
}

/* ---- API ---- */
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
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`POST /api/consultancy ${res.status}: ${msg}`);
  }
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
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`PATCH /api/consultancy/${id} ${res.status}: ${msg}`);
  }
  return res.json();
}

export default function AdminConsultancyEditor() {
  const [slides, setSlides] = useState([]);
  const [busy, setBusy] = useState(false);

  // create form
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [file, setFile] = useState(null);

  async function load() {
    const r = await getJSON("/api/consultancy");
    setSlides(r?.slides || r?.items || []);
  }
  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    if (!title.trim()) return alert("Title is required.");
    if (!file) return alert("Choose an image first.");
    setBusy(true);
    try {
      await uploadSlide({ title: title.trim(), intro: intro.trim(), file });
      setTitle(""); setIntro(""); setFile(null);
      await load();
    } catch (err) {
      console.error(err);
      alert("Failed to create slide");
    } finally {
      setBusy(false);
    }
  }

  async function saveTitle(s, newTitle) {
    setBusy(true);
    try { await patchSlide(s.id || s._id, { title: newTitle }); await load(); }
    catch (err) { console.error(err); alert("Failed to update title"); }
    finally { setBusy(false); }
  }

  async function saveIntro(s, newIntro) {
    setBusy(true);
    try { await patchSlide(s.id || s._id, { intro: newIntro }); await load(); }
    catch (err) { console.error(err); alert("Failed to update intro"); }
    finally { setBusy(false); }
  }

  async function replaceImage(s, newFile) {
    if (!newFile) return;
    setBusy(true);
    try { await patchSlide(s.id || s._id, { file: newFile }); await load(); }
    catch (err) { console.error(err); alert("Failed to replace image"); }
    finally { setBusy(false); }
  }

  async function remove(id) {
    if (!confirm("Delete this slide?")) return;
    setBusy(true);
    try { await delJSON(`/api/consultancy/${id}`); await load(); }
    catch (err) { console.error(err); alert("Failed to delete"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Consultancy Slides</h3>
        <span className="text-sm text-gray-500">{slides.length} total</span>
      </header>

      {/* Create new */}
      <form onSubmit={create} className="grid gap-3 border rounded-2xl p-4 bg-white max-w-xl">
        <div className="font-medium">Add new slide</div>
        <input
          className="border rounded p-2"
          placeholder="Title (required)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          placeholder="Short intro to show over the image"
          className="border rounded p-2 min-h-[80px]"
        />
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <button className="bg-black text-white px-4 py-2 rounded w-fit disabled:opacity-50" disabled={busy || !file || !title.trim()}>
          {busy ? "Saving…" : "Create Slide"}
        </button>
      </form>

      {/* Existing */}
      <div className="grid gap-4">
        {slides.map((s, idx) => (
          <div key={s.id || s._id} className="border rounded-2xl p-4 bg-white grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm text-gray-500">#{idx + 1}</div>
              <img
                src={s.image ? `${API_BASE}${s.image}` : `${API_BASE}${s.imageUrl || ""}`}
                alt=""
                className="w-full max-h-56 object-contain rounded-lg bg-gray-50"
                loading="lazy"
              />
              <label className="text-sm inline-flex items-center gap-2">
                <span className="px-2 py-1 border rounded">Replace image</span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => replaceImage(s, e.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="grid content-start gap-2">
              <label className="text-sm text-gray-600">Title</label>
              <AutoGrowInput defaultValue={s.title || ""} onSave={(text) => saveTitle(s, text)} />

              <label className="text-sm text-gray-600 mt-2">Intro text</label>
              <AutoGrowTextarea defaultValue={s.intro || ""} onSave={(text) => saveIntro(s, text)} />

              <div className="mt-2">
                <button className="px-3 py-1.5 rounded border text-red-600" onClick={() => remove(s.id || s._id)} disabled={busy}>
                  Delete
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2">
                Created: {s.createdAt ? new Date(s.createdAt).toLocaleString() : "—"}
              </div>
            </div>
          </div>
        ))}

        {slides.length === 0 && <div className="text-gray-500 text-sm">No slides yet</div>}
      </div>
    </div>
  );
}

function AutoGrowTextarea({ defaultValue, onSave }) {
  const [val, setVal] = useState(defaultValue || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setVal(defaultValue || ""), [defaultValue]);
  async function save() {
    if (saving) return;
    setSaving(true);
    try { await onSave(val); } finally { setSaving(false); }
  }
  return (
    <div className="grid gap-2">
      <textarea value={val} onChange={(e) => setVal(e.target.value)} className="border rounded p-2 min-h-[120px]" placeholder="Write a short, friendly intro…" />
      <div className="flex gap-2">
        <button onClick={save} className="px-3 py-1.5 rounded border bg-green-50 text-green-700 disabled:opacity-50" disabled={saving}>
          {saving ? "Saving…" : "Save Intro"}
        </button>
        <button onClick={() => setVal(defaultValue || "")} className="px-3 py-1.5 rounded border" type="button">Reset</button>
      </div>
    </div>
  );
}

function AutoGrowInput({ defaultValue, onSave }) {
  const [val, setVal] = useState(defaultValue || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setVal(defaultValue || ""), [defaultValue]);
  async function save() {
    if (saving) return;
    if (!val.trim()) return alert("Title cannot be empty.");
    setSaving(true);
    try { await onSave(val.trim()); } finally { setSaving(false); }
  }
  return (
    <div className="flex gap-2">
      <input value={val} onChange={(e) => setVal(e.target.value)} className="border rounded p-2 flex-1" placeholder="Title" />
      <button onClick={save} className="px-3 py-1.5 rounded border bg-green-50 text-green-700 disabled:opacity-50" disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
