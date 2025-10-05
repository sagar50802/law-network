import { createWorker } from "tesseract.js";

/**
 * Run OCR once; caller decides when (e.g., on first attach or re-ocr).
 * Keep language configurable later; default to English + Hindi common packs.
 */
export async function runOCR(buffer, lang = "eng+hin") {
  const worker = await createWorker(lang);
  try {
    const { data } = await worker.recognize(buffer);
    return (data?.text || "").trim();
  } finally {
    await worker.terminate();
  }
}
