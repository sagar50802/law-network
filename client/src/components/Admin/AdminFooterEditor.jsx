// src/components/Admin/AdminFooterEditor.jsx
import React, { useEffect, useState } from "react";
import api from "../../utils/api";
import IfOwnerOnly from "../common/IfOwnerOnly";

function AdminFooterEditor() {
  const [footer, setFooter] = useState({ text: "", links: [] });
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/footer");
        if (res.data.ok && res.data.data[0]) {
          setFooter(res.data.data[0]);
        }
      } catch (err) {
        console.error("Failed to load footer:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleTextChange = (e) => {
    setFooter({ ...footer, text: e.target.value });
  };

  const handleLinkChange = (i, field, value) => {
    const newLinks = [...footer.links];
    newLinks[i][field] = value;
    setFooter({ ...footer, links: newLinks });
  };

  const addLink = () => {
    setFooter({ ...footer, links: [...(footer.links || []), { label: "", url: "" }] });
  };

  const removeLink = (i) => {
    setFooter({ ...footer, links: footer.links.filter((_, idx) => idx !== i) });
  };

  const save = async () => {
    try {
      const res = await api.put("/footer", footer, {
        headers: { "x-owner-key": process.env.REACT_APP_OWNER_KEY || "" },
      });
      if (res.data.ok) {
        setMsg("✅ Footer saved successfully");
      } else {
        setMsg("❌ Failed to save footer");
      }
    } catch (err) {
      console.error("Save error:", err);
      setMsg("❌ Error saving footer");
    }
  };

  if (loading) return <div className="p-4">Loading footer editor...</div>;

  return (
    <IfOwnerOnly>
      <div className="p-6 bg-gray-100 border rounded-md">
        <h2 className="text-xl font-bold mb-4">Footer Editor</h2>

        {msg && <div className="mb-4 text-blue-600">{msg}</div>}

        {/* Text field */}
        <div className="mb-4">
          <label className="block mb-1 font-semibold">Footer Text:</label>
          <input
            type="text"
            value={footer.text || ""}
            onChange={handleTextChange}
            className="w-full border p-2 rounded"
          />
        </div>

        {/* Links editor */}
        <div className="mb-4">
          <h3 className="font-semibold mb-2">Links</h3>
          {(footer.links || []).map((link, i) => (
            <div key={i} className="flex items-center gap-2 mb-2">
              <input
                type="text"
                placeholder="Label"
                value={link.label}
                onChange={(e) => handleLinkChange(i, "label", e.target.value)}
                className="border p-2 flex-1 rounded"
              />
              <input
                type="text"
                placeholder="URL"
                value={link.url}
                onChange={(e) => handleLinkChange(i, "url", e.target.value)}
                className="border p-2 flex-1 rounded"
              />
              <button
                onClick={() => removeLink(i)}
                className="bg-red-500 text-white px-3 py-1 rounded"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={addLink}
            className="bg-blue-500 text-white px-3 py-1 rounded"
          >
            ➕ Add Link
          </button>
        </div>

        {/* Save button */}
        <button
          onClick={save}
          className="bg-green-600 text-white px-4 py-2 rounded"
        >
          Save Footer
        </button>
      </div>
    </IfOwnerOnly>
  );
}

export default AdminFooterEditor;
