import { useEffect, useRef, useState } from "react";
import { getJSON, postJSON, upload, delJSON } from "../../utils/api";

export default function AdminPDFEditor() {
  const [subjects, setSubjects] = useState([]);
  const [sel, setSel] = useState("");
  const [newName, setNewName] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function load() {
    const r = await getJSON("/api/pdfs");
    setSubjects(r.subjects || []);
    if (!sel && r.subjects?.[0]) setSel(r.subjects[0].id);
  }
  useEffect(() => { load(); }, []);

  async function addSubject() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      await postJSON("/api/pdfs/subjects", { name: newName });
      setNewName("");
      await load();
    } finally { setBusy(false); }
  }

  async function deleteSubject(id) {
    if (!confirm("Delete subject and all chapters?")) return;
    setBusy(true);
    try {
      await delJSON(`/api/pdfs/subjects/${id}`);
      if (sel === id) setSel("");
      await load();
    } finally { setBusy(false); }
  }

  async function addChapter(e) {
    e.preventDefault();
    if (!sel || !file) return;
    const fd = new FormData();
    fd.append("title", title || "Untitled");
    fd.append("locked", "true");
    fd.append("pdf", file);
    await upload(`/api/pdfs/subjects/${sel}/chapters`, fd);
    setTitle(""); setFile(null); if (fileRef.current) fileRef.current.value = "";
    await load();
  }

  async function delChapter(cid) {
    if (!confirm("Delete this chapter?")) return;
    await delJSON(`/api/pdfs/subjects/${sel}/chapters/${cid}`);
    await load();
  }

  const selected = subjects.find((s) => s.id === sel);

  return (
    <div className="space-y-4">
      {/* Create subject */}
      <div className="flex gap-2">
        <input
          className="border p-2 rounded flex-1"
          placeholder="New subject name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={busy}
        />
        <button onClick={addSubject} className="bg-black text-white px-3 rounded" disabled={busy}>
          Add
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Subjects */}
        <div className="space-y-2">
          {subjects.map((s) => (
            <div
              key={s.id}
              className={`border rounded p-2 flex items-center justify-between cursor-pointer ${sel===s.id ? "ring-2 ring-blue-500" : ""}`}
              onClick={() => setSel(s.id)}
            >
              <div>
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-gray-500">{s.chapters?.length || 0} chapters</div>
              </div>
              <button className="text-red-600 text-sm"
                onClick={(e) => { e.stopPropagation(); deleteSubject(s.id); }}>
                Delete
              </button>
            </div>
          ))}
          {subjects.length === 0 && <div className="text-gray-400">No subjects yet</div>}
        </div>

        {/* Upload chapter */}
        <form onSubmit={addChapter} className="space-y-2">
          <input className="border p-2 rounded w-full"
            placeholder="Chapter title" value={title}
            onChange={(e) => setTitle(e.target.value)} />
          <input ref={fileRef} type="file" accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {selected && <div className="text-xs text-gray-500">Subject: {selected.name}</div>}
          <button type="submit" className="bg-black text-white px-3 rounded" disabled={!sel || !file}>
            Upload
          </button>
        </form>
      </div>

      {/* Chapters in selected */}
      {selected && (
        <div className="space-y-2">
          <h4 className="font-semibold">Chapters in “{selected.name}”</h4>
          <ul className="space-y-2">
            {(selected.chapters || []).map((ch) => (
              <li key={ch.id} className="border rounded p-2 flex items-center justify-between">
                <div className="truncate">
                  <div className="font-medium">{ch.title}</div>
                  <a href={ch.url} target="_blank" rel="noreferrer"
                     className="text-xs underline text-blue-600">Open</a>
                </div>
                <button className="text-red-600 text-sm" onClick={() => delChapter(ch.id)}>
                  Delete
                </button>
              </li>
            ))}
            {(selected.chapters?.length ?? 0) === 0 && <li className="text-gray-400">No chapters yet</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
