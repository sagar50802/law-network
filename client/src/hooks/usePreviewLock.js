import { useEffect, useRef, useState } from 'react';
import isOwner from '../utils/isOwner';

export default function usePreviewLock({ type, id, previewSeconds = 10 }) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [count, setCount] = useState(previewSeconds);
  const timerRef = useRef(null);

  const unlocked = isOwner() ? true : localStorage.getItem(`unlock:${type}:${id}`) === 'true';

  useEffect(() => {
    if (unlocked) return;
    setCount(previewSeconds);
    timerRef.current = setInterval(() => {
      setCount((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          setShowOverlay(true);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [id, previewSeconds, unlocked]);

  return {
    unlocked,
    showOverlay,
    setShowOverlay,
    countLeft: count,
    grantTemp: (ms = 20000) => { // fast unlock 20s (visual)
      const key = `unlock:${type}:${id}`;
      localStorage.setItem(key, 'true');
      setTimeout(() => localStorage.removeItem(key), ms);
    }
  };
}
