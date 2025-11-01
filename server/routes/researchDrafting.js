// server/routes/researchDrafting.js
import express from "express";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import ResearchDrafting from "../models/ResearchDrafting.js";
import ResearchDraftingConfig from "../models/ResearchDraftingConfig.js";

const router = express.Router();
const json = express.json();

/* ---------------------------- tiny helpers ---------------------------- */
function s(v){ return (v==null?"":String(v)).trim(); }
function truthy(v){ return ["1","true","yes","on"].includes(s(v).toLowerCase()); }
function clamp(n,min,max){ const x = Number(n||0); return Math.max(min, Math.min(max, isFinite(x)?x:0)); }
const WORDS = (x)=> s(x).split(/\s+/).filter(Boolean).length;

/* ----------------------- default config bootstrap --------------------- */
async function ensureConfig(){
  let c = await ResearchDraftingConfig.findOne({ key: "rd:config" });
  if(!c){
    c = await ResearchDraftingConfig.create({
      key: "rd:config",
      upiId: "lawnetwork@upi",
      defaultAmount: 299,
      waNumber: "919999999999"
    });
  }
  return c;
}

/* ---------------------- basic CRUD for viewer flow -------------------- */
// Create or update intake (id optional)
router.post("/", json, async (req,res)=>{
  try{
    const { id } = req.query;
    const payload = req.body || {};
    const cfg = await ensureConfig();

    const doc = id
      ? await ResearchDrafting.findByIdAndUpdate(id, {
          $set: {
            email: s(payload.email),
            phone: s(payload.phone),
            name: s(payload.name),
            gender: s(payload.gender),
            place: s(payload.place),
            nationality: s(payload.nationality),
            country: s(payload.country),
            instituteType: s(payload.instituteType||"college"),
            instituteName: s(payload.instituteName),
            qualifications: Array.isArray(payload.qualifications) ? payload.qualifications : [],
            subject: s(payload.subject),
            title: s(payload.title),
            nature: s(payload.nature||"auto"),
            abstract: s(payload.abstract),
            totalPages: clamp(payload.totalPages, 1, 999),
            "payment.amount": clamp(payload.payment?.amount ?? cfg.defaultAmount, 1, 99999),
            "payment.upiId": s(payload.payment?.upiId || cfg.upiId),
            "payment.waNumber": s(payload.payment?.waNumber || cfg.waNumber),
          }
        }, { new:true })
      : await ResearchDrafting.create({
          email: s(payload.email),
          phone: s(payload.phone),
          name: s(payload.name),
          gender: s(payload.gender),
          place: s(payload.place),
          nationality: s(payload.nationality),
          country: s(payload.country),
          instituteType: s(payload.instituteType||"college"),
          instituteName: s(payload.instituteName),
          qualifications: Array.isArray(payload.qualifications) ? payload.qualifications : [],
          subject: s(payload.subject),
          title: s(payload.title),
          nature: s(payload.nature||"auto"),
          abstract: s(payload.abstract),
          totalPages: clamp(payload.totalPages, 1, 999),
          payment: {
            amount: clamp(payload.payment?.amount ?? cfg.defaultAmount, 1, 99999),
            upiId: s(payload.payment?.upiId || cfg.upiId),
            waNumber: s(payload.payment?.waNumber || cfg.waNumber)
          }
        });

    res.json({ ok:true, draft: doc });
  }catch(e){
    res.status(500).json({ ok:false, error: e.message });
  }
});

 // Get one (viewer)
router.get("/:id", async (req, res) => {
  try {
    const doc = await ResearchDrafting.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });

    // ---- added blur logic ----
    function blurText(text) {
      if (!text) return "";
      return "🔒 Content locked until payment.";
    }

    const locked = doc.status !== "paid" && doc.status !== "approved";

    if (locked && doc.gen) {
      for (const k in doc.gen) {
        if (doc.gen[k]?.text) {
          doc.gen[k].text = blurText(doc.gen[k].text);
        }
      }
    }
    // ---- end added blur logic ----

    res.json({ ok: true, draft: doc, locked });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------------------- “generator” endpoints (local) ------------------ */
function buildAbstract(title, subject, nature, baseAbstract){
  if (WORDS(baseAbstract) >= 200) {
    let parts = baseAbstract.split(/\s+/);
    if (parts.length > 460) parts = parts.slice(0, 460);
    return parts.join(" ");
  }
  const t = s(title)||"";
  const sub = s(subject)||"Research";
  const nat = (s(nature)||"auto").toLowerCase();
  const lens = 320 + Math.floor(Math.random()*80);
  const seed = [
    `${sub} has evolved as a critical field that bridges foundational theory and real-world applications.`,
    `This study, tentatively titled “${t || ("A Study on "+sub)}”, examines the contours, debates, and practical implications associated with the topic.`,
    nat === "empirical"
      ? `Adopting an empirical orientation, the work foregrounds data patterns, measured observations, and field insights rather than exclusive reliance on doctrinal exposition.`
      : `Adopting a doctrinal orientation, the work foregrounds authoritative texts, precedents, and scholarly interpretations while engaging with competing viewpoints.`,
    `The review traverses established literature and maps outstanding gaps.`,
    `The methodology aligns with the research aim, ensuring coherence between objectives, instruments, and analysis.`,
    `Expected contributions include clarifying conceptual ambiguities, synthesizing dispersed arguments, and outlining pathways for future inquiry.`,
    `Overall, the project aspires to provide a balanced, structured, and tractable account while remaining receptive to the nuances that animate ${sub.toLowerCase()}.`
  ].join(" ");
  let out = seed;
  while (WORDS(out) < lens) out += " " + seed;
  return out.split(/\s+/).slice(0, 450).join(" ");
}

function buildReview(title, subject){
  const pts = [
    `Classical foundations: early perspectives that framed ${subject} in normative terms;`,
    `Doctrinal consolidation: key authorities, instruments, and turning-point judgments;`,
    `Empirical insights: datasets and surveys repositioning debates with measured indicators;`,
    `Comparative angles: cross-jurisdictional practices that inform local policy choices;`,
    `Contemporary critiques: recent scholarship that reopens settled premises or methods;`,
    `Gaps & future scope: converging strands and unanswered puzzles worth systematic study.`
  ];
  const para = `The review of literature around “${s(title)||subject}” clusters into recurring strands. ` +
    pts.join(" ") + ` Together, these strands chart the intellectual terrain and justify the present inquiry.`;
  return para;
}

function autoNature(nature, userNature){
  if (userNature && ["empirical","doctrinal"].includes(userNature)) return userNature;
  return (s(nature)==="empirical") ? "empirical":"doctrinal";
}

function buildMethodology(nature, subject, base){
  const nat = autoNature(nature);
  if (nat==="empirical"){
    return (base && base.length>60 ? base+" " : "") +
`This study proceeds empirically. Instruments include structured questionnaires and targeted interviews with relevant stakeholders.
Sampling adopts a purposive frame that balances feasibility and analytic value. Data is tabulated and interpreted using descriptive
statistics to surface patterns, anomalies, and correlations. Ethical safeguards—consent, privacy, and minimal risk—are observed.`;
  }
  return (base && base.length>60 ? base+" " : "") +
`This study proceeds doctrinally. Sources include statutes, case law, authoritative commentaries, and policy reports. The method is
expository-analytical: extracting governing principles, tracing doctrinal development, and evaluating interpretive alternatives.
Comparative references are used where they sharpen reasoning or expose latent assumptions.`;
}

function buildAims(title, subject){
  return [
    `To articulate a clear conceptual map of “${s(title)||subject}”.`,
    `To evaluate competing positions and identify the most defensible view.`,
    `To correlate doctrinal arguments with empirical realities (where relevant).`,
    `To suggest tractable recommendations for future work and practice.`
  ].join("\n");
}

function buildChapters(subject){
  return [
    `Chapter 1 — Introduction and Background`,
    `Chapter 2 — Theoretical Framework & Definitions`,
    `Chapter 3 — Review of Literature`,
    `Chapter 4 — Research Methodology`,
    `Chapter 5 — Analysis & Discussion`,
    `Chapter 6 — Findings, Limitations, and Future Scope`,
    `Chapter 7 — Conclusion & References`
  ].join("\n");
}

function buildConclusion(subject){
  return `In conclusion, the inquiry consolidates the principal threads of ${subject}, reconciles areas of tension, and draws defensible
inferences anchored in the chosen method. While bounded by scope and data access, the project outlines specific, implementable
directions that can refine both scholarship and practice.`;
}

function assembleAll(d){
  const b = [];
  const H = (t)=> `\n\n${t.toUpperCase()}\n`;
  if (d.title) b.push(H("Title")+d.title);
  if (d.abstract?.text) b.push(H("Abstract")+d.abstract.text);
  if (d.review?.text) b.push(H("Review of Literature")+d.review.text);
  if (d.methodology?.text) b.push(H("Research Methodology")+d.methodology.text);
  if (d.aims?.text) b.push(H("Aim of Research")+"\n"+d.aims.text);
  if (d.chapterization?.text) b.push(H("Chapterization")+"\n"+d.chapterization.text);
  if (d.conclusion?.text) b.push(H("Conclusion")+d.conclusion.text);
  return b.join("\n");
}

// POST /api/research-drafting/generate
router.post("/generate", json, async (req,res)=>{
  try{
    const { id, step } = req.query;
    const doc = await ResearchDrafting.findById(id);
    if(!doc) return res.status(404).json({ ok:false, error:"Not found" });

    const subject = doc.subject || "Research";
    const userNature = (doc.nature||"auto").toLowerCase();

    switch(s(step)){
      case "abstract":{
        const text = buildAbstract(doc.title, subject, userNature, doc.abstract);
        doc.gen.title = s(doc.title||subject);
        doc.gen.abstract = { text, sources: [] };
        break;
      }
      case "review":{
        const text = buildReview(doc.title, subject);
        doc.gen.review = { text, sources: ["scholarly indices", "open references"] };
        break;
      }
      case "methodology":{
        const text = buildMethodology(userNature, subject, "");
        doc.gen.methodology = { text, sources: [] };
        break;
      }
      case "aims":{
        const text = buildAims(doc.title, subject);
        doc.gen.aims = { text, sources: [] };
        break;
      }
      case "chapterization":{
        const text = buildChapters(subject);
        doc.gen.chapterization = { text, sources: [] };
        break;
      }
      case "conclusion":{
        const text = buildConclusion(subject);
        doc.gen.conclusion = { text, sources: [] };
        break;
      }
      case "assemble":{
        doc.gen.assembled = { text: assembleAll(doc.gen), sources: [] };
        doc.status = "awaiting_payment";
        break;
      }
      default:
        return res.status(400).json({ ok:false, error:"unknown step" });
    }

    await doc.save();
    res.json({ ok:true, draft: doc });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});

/* --------------------------- payment + proof -------------------------- */
// user toggles "I paid"
 // user reports payment/proof steps (explicit, no auto-check on link open)
router.post("/:id/mark-paid", json, async (req, res) => {
  try {
    const doc = await ResearchDrafting.findById(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });

    // basic info (safe to overwrite)
    doc.name = (req.body.name ?? doc.name) || "";
    doc.email = (req.body.email ?? doc.email) || "";
    doc.phone = (req.body.phone ?? doc.phone) || "";

    if (!doc.payment) doc.payment = {};

    // ⬇️ these are EXPLICIT signals coming from frontend
    if (req.body.upiConfirmed === true) {
      doc.payment.upiConfirmed = true;
      doc.payment.upiConfirmedAt = new Date();
    }

    if (req.body.whatsappConfirmed === true) {
      doc.payment.whatsappConfirmed = true;
      doc.payment.whatsappConfirmedAt = new Date();
    }

    // old button "I Paid — Mark"
    if (req.body.userMarkedPaid === true) {
      doc.payment.userMarkedPaid = true;
      doc.payment.markedAt = new Date();
    }

    // 🔓 unlock rule: only if BOTH mini-steps are confirmed
    const upiOK = !!doc.payment.upiConfirmed;
    const waOK = !!doc.payment.whatsappConfirmed;

    if (upiOK && waOK) {
      doc.payment.userMarkedPaid = true;   // so admin panel shows "Yes"
      doc.status = "paid";                 // so frontend unblurs
    }

    await doc.save();

    const locked = !(doc.status === "paid" || doc.status === "approved");

    res.json({ ok: true, draft: doc, locked });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ------------------------------- admin -------------------------------- */

// list all submissions
router.get("/", isAdmin, async (req,res)=>{
  try{
    const list = await ResearchDrafting.find().sort({ createdAt: -1 });
    res.json({ ok:true, data: list });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});

// approve / revoke
router.post("/:id/admin/approve", isAdmin, json, async (req,res)=>{
  try{
    const { days=30 } = req.body||{};
    const doc = await ResearchDrafting.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:"Not found" });
    const until = new Date(Date.now() + Number(days)*24*60*60*1000);
    doc.status = "approved";
    doc.admin.approved = true;
    doc.admin.revoked = false;
    doc.admin.approvedUntil = until;
    await doc.save();
    res.json({ ok:true, draft: doc });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});

router.post("/:id/admin/revoke", isAdmin, json, async (req,res)=>{
  try{
    const doc = await ResearchDrafting.findById(req.params.id);
    if(!doc) return res.status(404).json({ ok:false, error:"Not found" });
    doc.status = "rejected";
    doc.admin.revoked = true;
    await doc.save();
    res.json({ ok:true, draft: doc });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});

// ✅ AUTO APPROVE ALL MARKED-PAID
router.post("/admin/auto-approve", isAdmin, async (req, res) => {
  try {
    const docs = await ResearchDrafting.find({
      "payment.userMarkedPaid": true,
      status: { $nin: ["approved", "rejected"] }
    });

    const now = new Date();
    const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const doc of docs) {
      doc.status = "approved";
      doc.admin.approved = true;
      doc.admin.revoked = false;
      doc.admin.approvedUntil = until;
      await doc.save();
    }

    res.json({ ok: true, count: docs.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// set config (UPI, amount, WA)
router.post("/admin/config", isAdmin, json, async (req,res)=>{
  try{
    const c = await ensureConfig();
    if (req.body.upiId != null) c.upiId = s(req.body.upiId);
    if (req.body.defaultAmount != null) c.defaultAmount = clamp(req.body.defaultAmount, 1, 99999);
    if (req.body.waNumber != null) c.waNumber = s(req.body.waNumber).replace(/[^\d]/g,"");
    await c.save();
    res.json({ ok:true, config: c });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});

router.get("/admin/config", isAdmin, async (req,res)=>{
  try{
    const c = await ensureConfig();
    res.json({ ok:true, config: c });
  }catch(e){
    res.status(500).json({ ok:false, error:e.message });
  }
});

/* --------------------------- delete endpoints --------------------------- */

// 🗑️ Delete single draft
router.delete("/:id/admin/delete", isAdmin, async (req, res) => {
  try {
    const doc = await ResearchDrafting.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, deleted: doc._id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// 🧹 Batch delete all rejected or draft entries
router.delete("/admin/batch-delete", isAdmin, async (req, res) => {
  try {
    const { status = [] } = req.body || {};
    const query = status.length ? { status: { $in: status } } : {};
    const result = await ResearchDrafting.deleteMany(query);
    res.json({ ok: true, deletedCount: result.deletedCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
