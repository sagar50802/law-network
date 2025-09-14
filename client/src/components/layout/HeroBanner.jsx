import { useEffect, useRef, useState } from 'react';
import { API_BASE, fetchJSON, authHeaders } from '../utils/api';
import IfOwnerOnly from '../common/IfOwnerOnly';

export default function HeroBanner() {
  const [items, setItems] = useState([]);
  const [i, setI] = useState(0);
  const intervalRef = useRef(null);

  const load = async () => {
    const r = await fetchJSON(`${API_BASE}/api/banners`);
    setItems(r.banners || []);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(()=> setI(n => (n+1) % Math.max(items.length || 1, 1)), 4000);
    return () => clearInterval(intervalRef.current);
  }, [items.length]);

  const upload = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    await fetch(`${API_BASE}/api/banners`, { method:'POST', headers: authHeaders(), body: fd });
    await load();
  };
  const del = async (id) => {
    await fetch(`${API_BASE}/api/banners/${id}`, { method:'DELETE', headers: authHeaders() });
    await load();
  };

  const curr = items[i] || null;

  return (
    <section className="relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="relative rounded-2xl overflow-hidden bg-gray-100 aspect-[16/6]">
          {curr ? (
            curr.type.startsWith('video') ? (
              <video src={`${API_BASE}${curr.url}`} className="w-full h-full object-cover" autoPlay muted loop playsInline />
            ) : (
              <img src={`${API_BASE}${curr.url}`} className="w-full h-full object-cover" alt="banner" />
            )
          ) : (
            <div className="w-full h-full grid place-items-center text-gray-400">No banners yet</div>
          )}

          {/* arrows */}
          <button onClick={()=>setI(i=> (i-1+items.length)%Math.max(items.length,1))}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/70 rounded-full px-3 py-1">‹</button>
          <button onClick={()=>setI(i=> (i+1)%Math.max(items.length,1))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/70 rounded-full px-3 py-1">›</button>

          {/* dots */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-2">
            {items.map((_, idx)=>(
              <span key={idx} className={`w-2 h-2 rounded-full ${idx===i?'bg-white':'bg-white/50'}`} />
            ))}
          </div>
        </div>

        <IfOwnerOnly className="mt-3 flex gap-3 items-center">
          <label className="text-sm bg-black text-white px-3 py-1 rounded cursor-pointer">
            Upload Banner
            <input type="file" className="hidden" accept="image/*,video/mp4" onChange={upload} />
          </label>
          <div className="text-sm text-gray-500">Click a dot to preview; use arrows to change.</div>
          {items.length>0 && (
            <button className="ml-auto text-sm px-3 py-1 rounded border"
                    onClick={()=>del(items[i].id)}>Delete Current</button>
          )}
        </IfOwnerOnly>
      </div>
    </section>
  );
}
