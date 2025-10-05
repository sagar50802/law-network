// server/utils/ocr.js
// Lightweight OCR helpers for the Exam Prep feature.
// Safe: dynamic-imports tesseract.js only when called, never at startup.

let _tesseractMod = null;
async function loadTesseract() {
  if (_tesseractMod) return _tesseractMod;
  try {
    const mod = await import("tesseract.js"); // ESM dynamic import
    // Some builds expose functions on the module object, some on default:
    _tesseractMod = mod?.default && Object.keys(mod).length === 1 ? mod.default : mod;
  } catch (e) {
    console.warn("[ocr] tesseract.js not available:", e?.message || e);
    _tesseractMod = null;
  }
  return _tesseractMod;
}

function clean(text = "") {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Core OCR. Prefer Tesseract.recognize; fall back to createWorker if needed.
 * Returns cleaned text or "" on failure. Never throws due to tesseract.
 */
export async function runOCR(buffer, lang = "eng") {
  try {
    if (!buffer || !buffer.length) return "";
    if (String(process.env.PREP_OCR_DISABLED || "") === "1") return "";

    const T = await loadTesseract();
    if (!T) return "";

    // Preferred simple API:
    if (typeof T.recognize === "function") {
      const { data } = await T.recognize(buffer, lang, { logger: () => {} });
      return clean(data?.text || "");
    }

    // Fallback worker API:
    if (typeof T.createWorker === "function") {
      const worker = await T.createWorker(lang);
      try {
        const { data } = await worker.recognize(buffer);
        return clean(data?.text || "");
      } finally {
        try { await worker.terminate(); } catch {}
      }
    }

    return "";
  } catch (e) {
    console.warn("[ocr] runOCR failed:", e?.message || e);
    return "";
  }
}

/** Alias kept for older code */
export async function extractOCRFromBuffer(buffer, lang = "eng") {
  return runOCR(buffer, lang);
}

/** Convenience: fetch a file by URL and OCR it. */
export async function extractOCRFromUrl(url, lang = "eng") {
  try {
    if (!url) return "";
    const res = await fetch(url);
    if (!res.ok) return "";
    const ab = await res.arrayBuffer();
    return runOCR(Buffer.from(ab), lang);
  } catch (e) {
    console.warn("[ocr] extractOCRFromUrl failed:", e?.message || e);
    return "";
  }
}

/** Optional text normalizer export */
export function normalizeOcrText(text) {
  return clean(text);
}

// Optional default export (harmless if someone does `import ocr from ...`)
export default {
  runOCR,
  extractOCRFromBuffer,
  extractOCRFromUrl,
  normalizeOcrText,
};
