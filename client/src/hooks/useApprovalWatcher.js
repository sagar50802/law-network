import { useEffect, useState } from "react";
import { API_BASE } from "../utils/api";

export default function useApprovalWatcher(pending, { feature, featureId, email }) {
  const [status, setStatus] = useState("idle"); // idle | pending | approved | expired | notfound
  const [approved, setApproved] = useState(null);
  const [expiry, setExpiry] = useState(null);
  const [message, setMessage] = useState(null); // ✅ new

  useEffect(() => {
    if (!pending || !email) return;

    let stop = false;

    async function check() {
      try {
        const url = `${API_BASE}/api/submissions/my?email=${encodeURIComponent(
          email
        )}&type=${encodeURIComponent(feature)}&id=${encodeURIComponent(featureId)}`;

        const r = await fetch(url).then((res) => res.json());

        if (!r?.success || stop) return;

        if (!r.found) {
          setStatus("notfound");
          setApproved(false);
          return;
        }

        const item = r.item;

        if (item.approved) {
          setStatus("approved");
          setApproved(true);
          setExpiry(item.expiry || null);
          setMessage(item.message || null); // ✅ capture congratulation message
        } else {
          setStatus("pending");
          setApproved(false);
          setMessage(null);
        }
      } catch (err) {
        console.error("Approval watcher failed:", err);
      }
    }

    // check immediately
    check();
    // poll every 10s
    const id = setInterval(check, 10000);

    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [pending, feature, featureId, email]);

  return { status, approved, expiry, message }; // ✅ include message
}
