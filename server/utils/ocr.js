// server/utils/ocr.js
// Lightweight OCR utility for Exam Prep. ESM compatible, Node 18+.
// Exports: extractOCRFromBuffer, extractOCRFromUrl, normalizeOcrText

let _tesseract = null;
let _recognizeFn = null; // cached best recognizer

function clean(text = "") {
  return String(text)
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadTesseract() {
  if (_tesseract) return _tesseract;
  try {
    _tesseract = await import("tesseract.js"); // dynamic import
  } catch (e) {
    console.warn("[ocr] tesseract.js not installed or failed to load:", e?.message || e);
    _tesseract = null;
  }
  return _tesseract;
}

/**
 * Pick the fastest available recognizer:
 * 1) Tesseract.recognize (v2/v3 style)
 * 2) createWorker fallback (slower, but works if recognize isn’t exposed)
 */
async function getRecognizer() {
  if (_recognizeFn) return _recognizeFn;

  const T = await loadTesseract();
  if (!T) {
    _recognizeFn = async () => "";
    return _recognizeFn;
  }

  // shape A: module has recognize directly
  const direct = T.recognize || T.default?.recognize;
  if (typeof direct === "function") {
    _recognizeFn = async (buffer, lang) => {
      try {
        const { data } = await direct(buffer, lang, { logger: () => {} });
        return clean(data?.text || "");
      } catch (e) {
        console.warn("[ocr] direct recognize failed:", e?.message || e);
        return "";
      }
    };
    return _recognizeFn;
  }

  // shape B: use createWorker
  const createWorker =
    T.createWorker ||
    T.default?.createWorker;

  if (typeof createWorker === "function") {
    _recognizeFn = async (buffer, lang) => {
      let worker;
      try {
        worker = await createWorker(lang || "eng", 1, { logger: () => {} });
        const { data } = await worker.recognize(buffer);
        return clean(data?.text || "");
      } catch (e) {
        console.warn("[ocr] worker recognize failed:", e?.message || e);
        return "";
      } finally {
        try { await worker?.terminate?.(); } catch {}
      }
    };
    return _recognizeFn;
  }

  // nothing usable
  _recognizeFn = async () => "";
  return _recognizeFn;
}

/**
 * Extract OCR text from a Buffer (PDF/Image). Returns a cleaned string.
 * Set PREP_OCR_DISABLED=1 to skip OCR on the server.
 */
export async function extractOCRFromBuffer(buffer, lang = "eng") {
  try {
    if (!buffer || !buffer.length) return "";
    if (String(process.env.PREP_OCR_DISABLED || "") === "1") return "";
    const recognize = await getRecognizer();
    return await recognize(buffer, lang);
  } catch (e) {
    console.warn("[ocr] extractOCRFromBuffer error:", e?.message || e);
    return "";
  }
}

/** Fetch a file by URL and OCR it. */
export async function extractOCRFromUrl(url, lang = "eng") {
  try {
    if (!url) return "";
    const res = await fetch(url);
    if (!res.ok) return "";
    const ab = await res.arrayBuffer();
    return extractOCRFromBuffer(Buffer.from(ab), lang);
  } catch (e) {
    console.warn("[ocr] extractOCRFromUrl error:", e?.message || e);
    return "";
  }
}

/** Optional helper to re-clean any stored OCR text. */
export function normalizeOcrText(text) {
  return clean(text);
}
