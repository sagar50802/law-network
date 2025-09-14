// client/src/pages/AdminLogin.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const OWNER_KEY = import.meta.env.VITE_OWNER_KEY || "LAWNOWNER2025";

export default function AdminLogin() {
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    if (pwd === OWNER_KEY) {
      localStorage.setItem("ownerKey", OWNER_KEY);
      // optional: also enable the console helper state
      if (typeof window !== "undefined") {
        console.log("%cAdmin mode enabled", "color: green; font-weight: bold;");
      }
      navigate("/admin/dashboard", { replace: true });
    } else {
      setErr("Wrong password");
    }
  };

  return (
    <main className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-semibold mb-4">Admin Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="password"
          className="w-full border rounded p-2"
          placeholder="Enter admin password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
        />
        {err && <div className="text-red-600 text-sm">{err}</div>}
        <button className="bg-black text-white px-4 py-2 rounded">Login</button>
      </form>
      <p className="text-xs text-gray-500 mt-3">
        Tip: you can also enter <code>enterAdmin('{OWNER_KEY}')</code> in the browser console.
      </p>
    </main>
  );
}
