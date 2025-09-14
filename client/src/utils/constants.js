"use strict";

export const PREVIEW_SECONDS_ARTICLE = 10;
export const PREVIEW_SECONDS_PODCAST = 10;
export const PREVIEW_SECONDS_VIDEO = 10;
export const PREVIEW_SECONDS_PDF = 5;
export const FAST_UNLOCK_SECONDS = 20;

export const buildAccessKey = (type, id) => `LN_ACCESS::${type}::${id}`;
export const buildOverlayKey = (type, id) => `LN_OVERLAY::${type}::${id}`;

export const PLAN_OPTIONS = [
  { key: 'weekly', label: 'Weekly', color: 'emerald', minutes: 10080 },
  { key: 'monthly', label: 'Monthly', color: 'indigo', minutes: 43200 },
  { key: 'yearly', label: 'Yearly', color: 'amber', minutes: 525600 }
];
// at bottom of your constants file
export const API_BASE = 'http://localhost:5000/api';

 