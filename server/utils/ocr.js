import { createWorker } from "tesseract.js";
import sanitizeHtml from "sanitize-html";
import fs from "fs";

let worker;
async function getWorker() {
  if (!worker) worker = await createWorker();
  return worker;
}

export async function ocrFileToText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  const w = await getWorker();
  const { data } = await w.recognize(filePath);
  const text = (data?.text || "").trim();
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
}
