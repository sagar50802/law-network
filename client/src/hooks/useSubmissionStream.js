// src/hooks/useSubmissionStream.js
import { useEffect } from "react";

/**
 * Live-joins /api/submissions/stream for this email.
 * On "grant": persists expiry to localStorage and dispatches accessUpdated/accessGranted.
 * On "revoke": clears localStorage and dispatches accessUpdated/accessRevoked.
 */
export default function useSubmissionStream(email) {
  useEffect(() => {
    if (!email) return;

    const url = `/api/submissions/stream?email=${encodeURIComponent(email)}`;
    const es = new EventSource(url, { withCredentials: true });

    const persistGrant = (detail) => {
      try {
        const key = `${detail.feature}:${detail.featureId}:${detail.email}`;
        const access = JSON.parse(localStorage.getItem("access") || "{}");
        access[key] = { expiry: detail.expiry };
        localStorage.setItem("access", JSON.stringify(access));
        window.dispatchEvent(new CustomEvent("accessUpdated", { detail: { ...detail, storageSync: true } }));
      } catch {}
    };

    const clearGrant = (detail) => {
      try {
        const key = `${detail.feature}:${detail.featureId}:${detail.email}`;
        const access = JSON.parse(localStorage.getItem("access") || "{}");
        if (access[key]) {
          delete access[key];
          localStorage.setItem("access", JSON.stringify(access));
          window.dispatchEvent(new CustomEvent("accessUpdated", { detail: { ...detail, storageSync: true } }));
        }
      } catch {}
    };

    const onGrant = (payload) => {
      let detail = {};
      try { detail = JSON.parse(payload || "{}"); } catch {}
      window.dispatchEvent(new CustomEvent("accessUpdated", { detail }));
      window.dispatchEvent(new CustomEvent("accessGranted", { detail }));
      if (detail.expiry && detail.expiry > Date.now()) persistGrant(detail);
    };

    const onRevoke = (payload) => {
      let detail = {};
      try { detail = JSON.parse(payload || "{}"); } catch {}
      window.dispatchEvent(new CustomEvent("accessUpdated", { detail }));
      window.dispatchEvent(new CustomEvent("accessRevoked", { detail }));
      clearGrant(detail);
    };

    es.addEventListener("grant", (e) => onGrant(e.data));
    es.addEventListener("revoke", (e) => onRevoke(e.data));
    es.addEventListener("ping", () => {});

    es.onerror = () => {
      // let the browser auto-reconnect
    };

    return () => es.close();
  }, [email]);
}
