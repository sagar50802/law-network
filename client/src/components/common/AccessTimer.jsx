import { useEffect, useState } from "react";
import { clearPending } from "../../utils/pending";

export default function AccessTimer({ timeLeftMs, feature, featureId, email }) {
  const [left, setLeft] = useState(timeLeftMs);

  useEffect(() => {
    if (!left) return;
    const iv = setInterval(() => {
      setLeft((t) => {
        if (t <= 1000) {
          clearInterval(iv);
          // clear localStorage when expired
          if (feature && featureId && email) {
            clearPending(feature, featureId, email);
          }
          return 0;
        }
        return t - 1000;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [left, feature, featureId, email]);

  if (left <= 0) {
    return (
      <div className="text-sm text-red-500">
        ❌ Subscription expired – Please subscribe again.
      </div>
    );
  }

  const hours = Math.floor(left / (1000 * 60 * 60));
  const minutes = Math.floor((left % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((left % (1000 * 60)) / 1000);

  return (
    <div className="text-sm text-gray-700">
      ⏳ Access valid for {hours}h {minutes}m {seconds}s
    </div>
  );
}
