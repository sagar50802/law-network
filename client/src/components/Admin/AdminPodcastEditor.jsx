import { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON, upload, delJSON } from "../../utils/api";

export default function AdminPodcastEditor() {
  const [playlists, setPlaylists] = useState([]);
  const [sel, setSel] = useState(""); // selected playlist id/key
  const [newName, setNewName] = useState("");

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const normalize = (r) => {
    if (Array.isArray(r)) return r;
    if (Array.isArray(r?.playlists)) return r.playlists;
    if (Array.isArray(r?.items)) return r.items;
    if (Array.isArray(r?.data)) return r.data;
    return [];
  };

  async function load() {
    try {
      setError("");
      const r = await getJSON("/api/podcasts");
      const arr = normalize(r);
      setPlaylists(arr);
      if (arr.length) {
        const keep = arr.find(p => (p._id || p.id || p.name) === sel);
        setSel(keep ? (keep._id || keep.id || keep.name)
                    : (arr[0]._id || arr[0].id || arr[0].name));
      } else {
        setSel("");
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load podcasts");
      setPlaylists([]); setSel("");
    }
  }
  useEffect(() => { load(); }, []);

  const selected = useMemo(
    () => playlists.find(p => (p._id || p.id || p.name) === sel),
    [playlists, sel]
  );

  // create playlist
  async function addPlaylist() {
    const name = newName.trim();
    if (!name) return;
    try {
      setBusy(true); setError("");
      await postJSON("/api/podcasts/playlists", { name });
      setNewName(""); await load();
    } catch (err) {
      console.error(err);
      alert("Create playlist failed: " + (err?.message || err));
    } finally { setBusy(false); }
  }

  // delete playlist
  async function deletePlaylist(id) {
    if (!id) return;
    if (!confirm("Delete this playlist and all its items?")) return;
    try {
      setBusy(true); setError("");
      await delJSON(`/api/podcasts/${encodeURIComponent(id)}`);
      if (sel === id) setSel("");
      await load();
    } catch (err) {
      try {
        await delJSON(`/api/podcasts/playlists/${encodeURIComponent(id)}`);
        if (sel === id) setSel("");
        await load();
      } catch (err2) {
        console.error(err2);
        alert("Delete playlist failed: " + (err2?.message || err2));
      }
    } finally { setBusy(false); }
  }

  // upload audio — POST /api/podcasts/items
  async function uploadAudio(e) {
    e?.preventDefault?.();
    const key = selected?._id || selected?.id || selected?.name || sel;
    if (!key) return alert("Select a playlist first");
    if (!file && !url) return alert("Choose a .mp3 file or paste a direct audio URL");

    const fd = new FormData();
    fd.append("playlist", key);
    fd.append("title", title || "Untitled");
    fd.append("author", author || "");
    if (file) fd.append("file", file); else fd.append("url", url);

    try {
      setBusy(true); setError("");
      await upload("/api/podcasts/items", fd);   // ✅ stable server route
      setTitle(""); setAuthor(""); setFile(null); setUrl("");
      await load();
    } catch (err) {
      alert("Upload failed:\n" + (err?.message || String(err)));
    } finally { setBusy(false); }
  }

  // delete one item
  async function deleteAudio(itemId) {
    if (!itemId) return;
    try {
      setBusy(true); setError("");
      await delJSON(`/api/podcasts/items/${encodeURIComponent(itemId)}`);
      await load();
    } catch (err) {
      console.error(err);
      alert("Delete failed: " + (err?.message || err));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      {/* Create playlist */}
      <div className="flex gap-2">
        <input
          className="border p-2 rounded flex-1"
          placeholder="New playlist name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          disabled={busy}
        />
        <button
          onClick={addPlaylist}
          className="bg-black text-white px-3 rounded disabled:opacity-60"
          disabled={busy || !newName.trim()}
        >
          Add Playlist
        </button>
      </div>

      {/* Playlists + selection + upload form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-2">
          {playlists.map((p) => {
            const id = p._id || p.id || p.name;
            const active = id === sel;
            return (
              <div
                key={id}
                className={`border rounded p-2 flex items-center justify-between cursor-pointer ${active ? "ring-2 ring-blue-500" : ""}`}
                onClick={() => setSel(id)}
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-gray-500">{(p.items?.length ?? 0)} items</div>
                </div>
                <button
                  className="text-red-600 text-sm"
                  onClick={(e) => { e.stopPropagation(); deletePlaylist(id); }}
                  disabled={busy}
                >
                  Delete
                </button>
              </div>
            );
          })}
          {playlists.length === 0 && <div className="text-gray-400">No playlists yet</div>}
        </div>

        <form onSubmit={uploadAudio} className="space-y-2">
          <input
            className="border p-2 rounded w-full"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
          <input
            className="border p-2 rounded w-full"
            placeholder="Author / Speaker"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={busy}
          />
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={busy}
          />
          <input
            className="border p-2 rounded w-full"
            placeholder="Audio URL (optional, direct .mp3)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
          {selected && (
            <div className="text-xs text-gray-500">
              Selected key: <code>{selected._id || selected.id || selected.name}</code>
            </div>
          )}
          <button
            type="submit"
            className="bg-black text-white px-3 rounded disabled:opacity-60"
            disabled={busy || !sel}
          >
            Upload
          </button>
        </form>
      </div>

      {error && <div className="text-sm whitespace-pre-wrap text-red-600">{error}</div>}

      {selected && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Items in “{selected.name}”</h4>
            <button
              className="text-red-600 text-sm"
              onClick={() => deletePlaylist(selected._id || selected.id || selected.name)}
              disabled={busy}
            >
              Delete Playlist
            </button>
          </div>
          <ul className="space-y-2">
            {(selected.items || []).map((it) => (
              <li key={it._id || it.id} className="border rounded p-2 flex items-center justify-between">
                <div>
                  <div className="font-medium">{it.title}</div>
                  <div className="text-xs text-gray-500">{it.author || it.artist}</div>
                </div>
                <button
                  className="text-red-600 text-sm"
                  onClick={() => deleteAudio(it._id || it.id)}
                  disabled={busy}
                >
                  Delete
                </button>
              </li>
            ))}
            {(selected.items?.length ?? 0) === 0 && <li className="text-gray-400">No audios yet</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
