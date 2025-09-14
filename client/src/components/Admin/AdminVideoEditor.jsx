// client/src/components/Admin/AdminVideoEditor.jsx
import { useEffect, useMemo, useState } from "react";
import { getJSON, postJSON, upload, delJSON, absUrl } from "../../utils/api";

export default function AdminVideoEditor() {
  const [playlists, setPlaylists] = useState([]);
  const [sel, setSel] = useState("");
  const [newName, setNewName] = useState("");

  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      const r = await getJSON("/api/videos");
      const arr = normalize(r);
      setPlaylists(arr);
      if (arr.length) {
        const keep = arr.find(p => (p._id || p.id || p.name) === sel);
        setSel(keep ? (keep._id || keep.id || keep.name) : (arr[0]._id || arr[0].id || arr[0].name));
      } else setSel("");
    } catch (e) {
      console.error(e);
      setError("Failed to load video playlists");
      setPlaylists([]); setSel("");
    }
  }
  useEffect(() => { load(); }, []);

  const selected = useMemo(
    () => playlists.find(p => (p._id || p.id || p.name) === sel),
    [playlists, sel]
  );

  async function addPlaylist() {
    const name = newName.trim();
    if (!name) return;
    try {
      setBusy(true);
      await postJSON("/api/videos/playlists", { name });
      setNewName("");
      await load();
    } catch (err) {
      alert("Create playlist failed: " + (err?.message || err));
    } finally { setBusy(false); }
  }

  async function deletePlaylist(id) {
    if (!id) return;
    if (!confirm("Delete this playlist and all its videos?")) return;

    setBusy(true);
    try {
      // primary
      await delJSON(`/api/videos/${encodeURIComponent(id)}`);
    } catch {
      // compatibility path
      await delJSON(`/api/videos/playlists/${encodeURIComponent(id)}`);
    } finally {
      setBusy(false);
    }
    if (sel === id) setSel("");
    await load();
  }

  async function uploadVideo(e) {
    e?.preventDefault?.();
    const key = selected?._id || selected?.id || selected?.name || sel;
    if (!key) return alert("Select a playlist first");
    if (!file && !url) return alert("Choose a file or paste a direct video URL");

    const fd = new FormData();
    fd.append("playlist", key);
    fd.append("title", title || "Untitled");
    if (file) fd.append("file", file); else fd.append("url", url);

    try {
      setBusy(true);
      await upload("/api/videos/items", fd);
      setTitle(""); setFile(null); setUrl("");
      await load();
    } catch (err) {
      alert("Upload failed: " + (err?.message || err));
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
          className="bg-black text-white px-3 rounded disabled:opacity-60"
          onClick={addPlaylist}
          disabled={busy || !newName.trim()}
        >
          Add Playlist
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Playlists */}
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

        {/* Upload to selected */}
        <form onSubmit={uploadVideo} className="space-y-2">
          <input
            className="border p-2 rounded w-full"
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={busy}
          />
          <input
            className="border p-2 rounded w-full"
            placeholder="Video URL (optional, direct .mp4)"
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

      {/* Items in selected */}
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
              <li key={it._id || it.id} className="border rounded p-2">
                <div className="font-medium">{it.title}</div>
                <div className="text-xs text-gray-500 break-all">{absUrl(it.url)}</div>
              </li>
            ))}
            {(selected.items?.length ?? 0) === 0 && <li className="text-gray-400">No videos yet</li>}
          </ul>
        </div>
      )}

      {error && <div className="text-sm whitespace-pre-wrap text-red-600">{error}</div>}
    </div>
  );
}
