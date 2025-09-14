// pending.js
export function getPendingKey(feature, featureId, email) {
  return `pending-${feature}-${featureId}-${email}`;
}

export function savePending(feature, featureId, email, record) {
  if (!feature || !featureId || !email) return;
  localStorage.setItem(getPendingKey(feature, featureId, email), JSON.stringify(record));
}

export function loadPending(feature, featureId, email) {
  try {
    const raw = localStorage.getItem(getPendingKey(feature, featureId, email));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearPending(feature, featureId, email) {
  const key = `pending-${feature}-${featureId}-${email}`;
  localStorage.removeItem(key);
}
