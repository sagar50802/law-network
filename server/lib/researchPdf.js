// server/lib/researchPdf.js
import PDFDocument from "pdfkit";

export async function generatePreviewPDF(stream, doc) {
  const pdf = new PDFDocument({ size: "A4", margin: 48 });
  pdf.pipe(stream);

  pdf.fontSize(18).text("Research Proposal — Preview", { align: "center" });
  pdf.moveDown();
  pdf.fontSize(14).text(`Title: ${doc.title || "—"}`);
  pdf.text(`User: ${doc.userEmail || "—"}`);
  pdf.moveDown();
  pdf.fontSize(12).text("Summary:");
  pdf.moveDown(0.5);
  pdf.fontSize(11).text(`Method: ${doc.fields?.method || "—"}`);
  pdf.text(`Timeline: ${(doc.fields?.start || "—")} → ${(doc.fields?.end || "—")}`);

  // watermark
  pdf.fontSize(60).fillOpacity(0.08).text("PREVIEW", 80, 350, { angle: 30 });
  pdf.fillOpacity(1);

  pdf.end();
}

export async function generateFullPDF(stream, doc) {
  const pdf = new PDFDocument({ size: "A4", margin: 48 });
  pdf.pipe(stream);

  // Cover band
  pdf.rect(0, 0, 595, 140).fill("#4f46e5");
  pdf.fillColor("white").fontSize(20).text("Research Proposal", 48, 36);
  pdf.fontSize(12).text(`${doc.userEmail || "User"}`);
  pdf.fillColor("black");

  pdf.moveDown(3);
  pdf.fontSize(16).text(`Title: ${doc.title || "—"}`);
  pdf.moveDown();
  pdf.fontSize(12).text("Literature:");
  pdf.fontSize(11).text(doc.fields?.lit || "—");
  pdf.moveDown();
  pdf.fontSize(12).text("Method:");
  pdf.fontSize(11).text(doc.fields?.method || "—");
  pdf.moveDown();
  pdf.fontSize(12).text("Timeline:");
  pdf.fontSize(11).text(`${doc.fields?.start || "—"} → ${doc.fields?.end || "—"}`);

  pdf.addPage();
  pdf.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
  pdf.text(`Status: ${doc.status}`);

  pdf.end();
}
