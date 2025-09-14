// client/src/hooks/useNoCopy.js
import { useEffect } from "react";

/**
 * Disable selection/copy/context menu inside a container while locked.
 * @param {React.RefObject<HTMLElement>} ref - element to lock
 * @param {boolean} enabled - when true, block interactions
 */
export default function useNoCopy(ref, enabled = false) {
  useEffect(() => {
    const el = ref && "current" in ref ? ref.current : null;
    if (!el) return;

    const block = (e) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
    };

    const events = [
      "contextmenu",
      "copy",
      "cut",
      "paste",
      "dragstart",
      "selectionstart",
    ];

    if (enabled) {
      // reflect state via class
      el.classList.add("nocopy");
      // attach listeners
      events.forEach((type) => el.addEventListener(type, block, { capture: true }));
    } else {
      el.classList.remove("nocopy");
    }

    return () => {
      // cleanup all listeners and class
      events.forEach((type) => el.removeEventListener(type, block, { capture: true }));
      el.classList.remove("nocopy");
    };
  }, [ref, enabled]);
}
