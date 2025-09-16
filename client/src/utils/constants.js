"use strict";

// Preview durations (in seconds)
export const PREVIEW_SECONDS_ARTICLE = 10;
export const PREVIEW_SECONDS_PODCAST = 10;
export const PREVIEW_SECONDS_VIDEO = 10;
export const PREVIEW_SECONDS_PDF = 5;
export const FAST_UNLOCK_SECONDS = 20;

// Access key helpers
export const buildAccessKey = (type, id) => `LN_ACCESS::${type}::${id}`;
export const buildOverlayKey = (type, id) => `LN_OVERLAY::${type}::${id}`;

// Subscription plans (used in admin dashboard + QR unlock overlay)
export const PLAN_OPTIONS = [
  { key: 'weekly', label: 'Weekly', color: 'emerald', minutes: 10080 },
  { key: 'monthly', label: 'Monthly', color: 'indigo', minutes: 43200 },
  { key: 'yearly', label: 'Yearly', color: 'amber', minutes: 525600 }
];

// ✅ Backend base URL (used in api.js)
export const BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";
export const API_BASE = `${BASE_URL}/api`;

// ✅ Alias to avoid mismatch
export { API_BASE as apiurl };
