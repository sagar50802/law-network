// server/utils/ocr.js
// Lightweight, on-demand OCR using tesseract.js (open-source). If not installed, it fails safe.
export async function extractOCRFromBuffer(buf, { lang = "eng" } = {}) {
  try {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(lang);
    const { data: { text } } = await worker.recognize(buf);
    await worker.terminate();
    return String(text || "").trim();
  } catch (e) {
    console.warn("OCR unavailable, returning empty text:", e?.message || e);
    return "";
  }
}
