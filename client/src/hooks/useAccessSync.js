import { useEffect } from "react";
import { loadAccess } from "../utils/access";

// Hook: sync access changes across components/tabs instantly
export default function useAccessSync(onChange) {
  useEffect(() => {
    function handleChange(e) {
      // detail is present for our custom events
      if (e.detail) {
        onChange?.(e.detail);
      } else if (e.key === "access") {
        // storage event: reload whole access state if needed
        onChange?.({ storageSync: true });
      }
    }

    window.addEventListener("accessUpdated", handleChange);
    window.addEventListener("accessGranted", handleChange);
    window.addEventListener("accessRevoked", handleChange);
    window.addEventListener("storage", handleChange);

    return () => {
      window.removeEventListener("accessUpdated", handleChange);
      window.removeEventListener("accessGranted", handleChange);
      window.removeEventListener("accessRevoked", handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, [onChange]);
}
