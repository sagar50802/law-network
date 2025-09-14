// client/src/utils/isOwner.js
const OWNER_KEY = import.meta.env.VITE_OWNER_KEY || 'LAWNOWNER2025';
export default function isOwner() {
  return localStorage.getItem('ownerKey') === OWNER_KEY;
}
