// client/src/components/common/QROverlay.jsx
import { useEffect, useState } from "react";
import { API_BASE } from "../../utils/api";
import { savePending, loadPending } from "../../utils/pending";
import useApprovalWatcher from "../../hooks/useApprovalWatcher";
import PendingBadge from "../common/PendingBadge";
import UnlockWait from "../common/UnlockWait";
import AccessTimer from "../common/AccessTimer";
import { saveAccess } from "../../utils/access";   // ✅

export default function QROverlay({ open, onClose, title, feature, featureId }) {
  const [cfg, setCfg] = useState({ url: "", currency: "₹", plans: {} });
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", file: null });
  const [pending, setPending] = useState(null);
  const [unlocking, setUnlocking] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // fetch QR config
  async function fetchConfig() {
    try {
      const r = await fetch(`${API_BASE}/api/qr/current?ts=${Date.now()}`).then(res => res.json());
      if (r?.success) setCfg(r);
    } catch (err) {
      console.error("Failed to fetch QR config:", err);
    }
  }
  useEffect(() => { if (open) fetchConfig(); }, [open]);

  // restore pending
  useEffect(() => {
    if (form.email) {
      const saved = loadPending(feature, featureId, form.email);
      if (saved) setPending(saved);
    }
  }, [form.email, feature, featureId]);

  // watcher → if admin approves
  const { status, approved, expiry, message } = useApprovalWatcher(
    pending,
    { feature, featureId, email: form.email }
  );

  // close overlay immediately on any 'accessGranted' broadcast
  useEffect(() => {
    const onGranted = () => onClose?.();
    window.addEventListener("accessGranted", onGranted);
    return () => window.removeEventListener("accessGranted", onGranted);
  }, [onClose]);

  // ✅ When approved: show 15s unlock wait → persist access → close → silent refresh → one-time page reload
  useEffect(() => {
    if (status === "approved" && approved) {
      setUnlocking(true);
      const t = setTimeout(() => {
        // save access first
        saveAccess(feature, featureId, form.email, expiry, message);

        // hide unlocking + close overlay
        setUnlocking(false);
        if (typeof onClose === "function") onClose();

        // optional silent refresh signals (won't hurt even with reload)
        window.dispatchEvent(new Event("focus"));
        window.dispatchEvent(new CustomEvent("softRefresh", { detail: { feature, featureId } }));

        // 🔁 one-time auto reload of current page
        // (no loop: we only call this after a confirmed approval event)
        setTimeout(() => window.location.reload(), 150);
      }, 15000); // ← 15 seconds
      return () => clearTimeout(t);
    }
  }, [status, approved, expiry, message, feature, featureId, form.email, onClose]);

  // submit form (unchanged)
  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedPlan) return alert("Select a plan");
    if (!form.file) return alert("Upload screenshot");
    if (!form.email) return alert("Enter your email");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", form.name);
      fd.append("phone", form.phone);
      fd.append("email", form.email);
      fd.append("planKey", selectedPlan);
      fd.append("planLabel", cfg.plans[selectedPlan]?.label);
      fd.append("planPrice", cfg.plans[selectedPlan]?.price);
      fd.append("screenshot", form.file);
      fd.append("type", feature);
      fd.append("id", featureId);

      const r = await fetch(`${API_BASE}/api/submissions`, { method: "POST", body: fd }).then(res => res.json());
      if (r?.success) {
        const record = {
          id: r.id,
          shortId: r.id.slice(-6),
          expiry: r.expiry,
          planKey: selectedPlan,
          name: form.name,
          email: form.email,
        };
        setPending(record);
        savePending(feature, featureId, form.email, record);
        localStorage.setItem("userEmail", form.email);
      } else {
        alert("Failed to submit request");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 bg-white shadow-2xl w-full max-w-md z-50 overflow-y-auto">
      <div className="p-5 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-red-600 font-bold text-lg"
        >
          ✕
        </button>

        {/* Title */}
        <h3 className="font-semibold text-lg mb-3 animate-pulse text-pink-500">
          {feature} – {title}
        </h3>

        {/* QR Image */}
        {cfg.url ? (
          <div className="mb-4">
            <img
              src={`${API_BASE}${cfg.url}?t=${Date.now()}`}
              alt="QR code"
              className="w-full h-56 object-contain border rounded-xl bg-gray-50"
            />
            <p className="text-xs text-center text-gray-600 mt-1">
              Scan this QR to pay
            </p>
          </div>
        ) : (
          <div className="w-full h-56 flex items-center justify-center border rounded-xl text-gray-400">
            No QR uploaded yet
          </div>
        )}

        {/* Plans */}
        <div className="flex gap-2 mb-4">
          {["weekly", "monthly", "yearly"].map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPlan(p)}
              className={`px-3 py-1 rounded-full border text-sm ${
                selectedPlan === p
                  ? "bg-yellow-300 animate-pulse"
                  : "bg-gray-100 hover:bg-gray-200"
              }`}
            >
              {cfg.plans[p]?.label} – {cfg.currency}{cfg.plans[p]?.price}
            </button>
          ))}
        </div>

        {/* Pending OR Form */}
        {pending ? (
          unlocking ? (
            <>
              <UnlockWait onDone={() => setUnlocking(false)} />
              {/* 🎉 Friendly congrats line during the 15s handover */}
              <div className="mt-3 text-center text-green-600 font-extrabold text-base">
                🎉 Congratulations! Access granted. Finalizing in 15&nbsp;seconds…
              </div>
            </>
          ) : status === "approved" && approved ? (
            <div className="p-4 bg-green-50 rounded-xl border animate-pulse">
              <h4 className="font-semibold mb-2 text-green-700">Access Granted ✅</h4>
              {message ? (
                <p className="text-sm mb-2 whitespace-pre-line">{message}</p>
              ) : (
                <p className="text-sm mb-2">
                  Hi {pending.name}, your subscription has been approved.
                </p>
              )}
              {expiry && (
                <div className="animate-blink">
                  <AccessTimer timeLeftMs={expiry - Date.now()} />
                </div>
              )}
            </div>
          ) : (
            <PendingBadge
              shortId={pending.shortId}
              deadline={pending.expiry ? new Date(pending.expiry).toLocaleString() : "Waiting for approval"}
            />
          )
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3">
            <input
              placeholder="Your Name"
              className="border rounded p-2"
              value={form.name}
              onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            />
            <input
              placeholder="Phone"
              className="border rounded p-2"
              value={form.phone}
              onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))}
            />
            <input
              placeholder="Gmail"
              className="border rounded p-2"
              value={form.email}
              onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))}
            />

            {/* Screenshot block with BIG green animated down-arrow cue */}
            <div className="border rounded-xl p-3 text-sm bg-pink-50 relative">
              <label className="flex items-center justify-between text-pink-600 font-semibold mb-2">
                <span>Upload Payment Screenshot</span>
                <span
                  className="flex items-center gap-3 text-green-600 animate-bounce select-none
                             drop-shadow-[0_0_8px_rgba(34,197,94,0.45)]"
                  aria-label="Tap here to upload screenshot"
                >
                  <svg
                    className="w-8 h-8 md:w-9 md:h-9"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 4v12" />
                    <path d="M8 12l4 4 4-4" />
                  </svg>
                  <span className="text-green-700 font-extrabold text-base md:text-lg uppercase tracking-wide">
                    Browse HERE TO UPLOAD PAYMENT SCREENSHOT
                  </span>
                </span>
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setForm((s) => ({ ...s, file: e.target.files?.[0] || null }))
                }
              />
            </div>

            {selectedPlan && (
              <div className="text-sm p-2 border rounded bg-yellow-50">
                Selected Plan:{" "}
                <b>
                  {cfg.plans[selectedPlan]?.label} – {cfg.currency}
                  {cfg.plans[selectedPlan]?.price}
                </b>
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
