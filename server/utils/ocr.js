// server/utils/ocr.js
// OCR utilities for Exam Prep. Works with tesseract.js. Safe fallbacks included.
//
// Exports:
//  - extractOCRFromBuffer(buffer, lang)
//  - extractOCRFromUrl(url, lang)
//  - normalizeOcrText(text)
//  - runOCR(buffer, lang)            // alias (uses worker/recognize under the hood)
//  - terminateOcrWorker()            // optional cleanup
//
// Set PREP_OCR_DISABLED=1 to skip OCR without breaking the app.

let _tess = null;
let _worker = null;
let _workerLang = null;

async function getTesseract() {
  if (_tess) return _tess;
  try {
    _tess = await import("tesseract.js");
  } catch (e) {
    console.warn("[ocr] tesseract.js not available:", e?.message || e);
    _tess = null;
  }
  return _tess;
}

function clean(text = "") {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Reuse a single worker to avoid high startup cost.
async function ensureWorker(tess, lang) {
  if (!tess?.createWorker) return null;
  if (_worker && _workerLang !== lang) {
    try { await _worker.terminate(); } catch {}
    _worker = null;
    _workerLang = null;
  }
  if (!_worker) {
    _worker = await tess.createWorker(lang);
    _workerLang = lang;
  }
  return _worker;
}

/**
 * Main OCR helper. Accepts Buffer (image/PDF). Returns cleaned text or "".
 */
export async function extractOCRFromBuffer(buffer, lang = "eng+hin") {
  try {
    if (!buffer || !buffer.length) return "";
    if (String(process.env.PREP_OCR_DISABLED || "") === "1") return "";

    const tess = await getTesseract();
    if (!tess) return "";

    // Fast path: Tesseract.recognize is available
    if (typeof tess.recognize === "function") {
      const { data } = await tess.recognize(buffer, lang, { logger: () => {} });
      return clean(data?.text || "");
    }

    // Worker path (createWorker API)
    const worker = await ensureWorker(tess, lang);
    if (!worker) return "";
    const { data } = await worker.recognize(buffer);
    return clean(data?.text || "");
  } catch (e) {
    console.warn("[ocr] extractOCRFromBuffer failed:", e?.message || e);
    return "";
  }
}

/**
 * Convenience: fetch by URL and OCR.
 */
export async function extractOCRFromUrl(url, lang = "eng+hin") {
  try {
    if (!url) return "";
    const res = await fetch(url);
    if (!res.ok) return "";
    const ab = await res.arrayBuffer();
    return extractOCRFromBuffer(Buffer.from(ab), lang);
  } catch (e) {
    console.warn("[ocr] extractOCRFromUrl failed:", e?.message || e);
    return "";
  }
}

/** Minor normalizer for any pre-extracted text. */
export function normalizeOcrText(text) {
  return clean(text);
}

/**
 * Alias kept for compatibility with your previous code.
 * Uses the same internal implementation.
 */
export async function runOCR(buffer, lang = "eng+hin") {
  return extractOCRFromBuffer(buffer, lang);
}

/** Optional: terminate the shared worker (e.g., during shutdown/tests). */
export async function terminateOcrWorker() {
  try { if (_worker) await _worker.terminate(); } catch {}
  _worker = null;
  _workerLang = null;
}
