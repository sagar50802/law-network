import { useEffect, useState } from "react";
import { getJSON, postJSON, upload, delJSON } from "../../utils/api";

export default function AdminArticleEditor() {
  const [articles, setArticles] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [allowHtml, setAllowHtml] = useState(false);
  const [file, setFile] = useState(null);

  async function load(){ const r = await getJSON("/api/articles"); setArticles(r.articles || r.data || []); }
  useEffect(() => { load(); }, []);

  async function onSubmit(e){
    e.preventDefault();
    if (file) {
      const fd = new FormData();
      fd.append("title", title);
      fd.append("content", content);
      fd.append("allowHtml", String(allowHtml));
      fd.append("image", file);
      await upload("/api/articles", fd);
    } else {
      await postJSON("/api/articles", { title, content, allowHtml });
    }
    setTitle(""); setContent(""); setAllowHtml(false); setFile(null);
    await load();
  }

  async function onDel(id){ await delJSON(`/api/articles/${id}`); await load(); }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-2 border rounded p-3 max-w-sm">
        <input className="border p-2 rounded" placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)} />
        <textarea className="border p-2 rounded h-32" placeholder="Content" value={content} onChange={e=>setContent(e.target.value)} />
        <label className="text-sm flex items-center gap-2">
          <input type="checkbox" checked={allowHtml} onChange={e=>setAllowHtml(e.target.checked)} />
          Allow HTML rendering
        </label>
        <input type="file" accept="image/*" onChange={e=>setFile(e.target.files?.[0] || null)} />
        <button className="bg-black text-white px-3 py-1 rounded">Publish</button>
      </form>

      <ul className="space-y-2">
        {articles.map(a => (
          <li key={a._id || a.id} className="flex items-center justify-between">
            <span>{a.title}</span>
            <button onClick={() => onDel(a._id || a.id)} className="text-red-600 text-sm">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
