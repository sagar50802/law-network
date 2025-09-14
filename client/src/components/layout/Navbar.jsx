import { useEffect, useState } from "react";
import isOwner from "../../utils/isOwner";
import { getJSON } from "../../utils/api";

export default function Navbar() {
  const [articleCount, setArticleCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getJSON("/api/articles")
      .then((r) => setArticleCount((r.articles || r.data || []).length))
      .catch(() => {});
  }, []);

  return (
    <nav className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="/" className="font-black text-xl">Law Network</a>

        {/* Desktop */}
        <div className="hidden md:flex gap-6 items-center">
          <a href="/articles" className="hover:text-blue-600">Articles ({articleCount})</a>
          <a href="/podcasts" className="hover:text-blue-600">Podcasts</a>
          <a href="/videos" className="hover:text-blue-600">Video Gallery</a>
          <a href="/notebook" className="hover:text-blue-600">PDF Notebook</a>
          <a href="/plagiarism" className="hover:text-blue-600">Plagiarism</a>
          {/* ✅ NEW: Scholar Space */}
          <a href="/scholar" className="hover:text-blue-600">Scholar Space</a>

          {isOwner() && (
            <>
              <span className="text-gray-300">|</span>
              <a href="/admin/dashboard" className="text-blue-600 underline">Admin</a>
              <button
                className="ml-2 text-xs border px-2 py-1 rounded"
                onClick={() => { localStorage.removeItem("ownerKey"); location.reload(); }}
              >
                Logout
              </button>
            </>
          )}
        </div>

        {/* Mobile burger */}
        <div className="md:hidden">
          <button onClick={() => setOpen(v => !v)} aria-label="Menu">☰</button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden px-4 pb-3 flex flex-col gap-2">
          <a href="/articles">Articles</a>
          <a href="/podcasts">Podcasts</a>
          <a href="/videos">Video Gallery</a>
          <a href="/notebook">PDF Notebook</a>
          <a href="/plagiarism">Plagiarism</a>
          {/* ✅ fixed path (no space) */}
          <a href="/scholar">Scholar Space</a>
          {isOwner() && <a href="/admin/dashboard" className="underline">Admin</a>}
        </div>
      )}

      {isOwner() && (
        <div className="text-center text-xs py-1 bg-amber-50 border-t">Admin Mode Enabled</div>
      )}
    </nav>
  );
}
