// UnlockWait.jsx
import { useEffect, useState } from "react";

export default function UnlockWait({ onDone }) {
  const [sec, setSec] = useState(20);

  useEffect(() => {
    if (sec <= 0) {
      onDone?.();
      return;
    }
    const id = setTimeout(() => setSec((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [sec]);

  return (
    <div className="p-4 bg-yellow-50 border rounded-xl text-center">
      <h4 className="font-semibold text-lg text-yellow-700">🔓 Unlocking…</h4>
      <p className="text-sm">Access will unlock in {sec}s</p>
    </div>
  );
}
