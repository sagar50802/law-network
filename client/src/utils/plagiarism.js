// client/src/utils/plagiarism.js
// Build inline HTML highlights for grammar issues returned by /api/plagiarism/analyze
// Handles token-index issues (spelling/repetition/style) + char-range issues (long sentence)

function esc(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Token/highlight colors:
// - spelling: red
// - repetition: amber
// - style/passive: indigo
// - sentence too long (range): yellow overlay
export function highlightGrammarHTML(text, issues) {
  const raw = String(text || "");
  if (!raw) return "";

  // 1) Token-level issues (index references tokens from split(/\b/))
  const tokens = raw.split(/\b/);
  const byIndex = new Map();
  for (const it of issues || []) {
    if (it && typeof it.index === "number") {
      const arr = byIndex.get(it.index) || [];
      arr.push(it);
      byIndex.set(it.index, arr);
    }
  }

  let tokenLayer = "";
  for (let i = 0; i < tokens.length; i++) {
    const s = tokens[i];
    if (!/\w/.test(s)) {
      tokenLayer += esc(s);
      continue;
    }
    const safe = esc(s);
    const list = byIndex.get(i) || [];

    if (!list.length) {
      tokenLayer += safe;
      continue;
    }

    const primary = list[0]?.type;
    const cls =
      primary === "spelling"
        ? "bg-rose-100 text-rose-900"
        : primary === "repetition"
        ? "bg-amber-100 text-amber-900"
        : "bg-indigo-100 text-indigo-900"; // style/passive/other

    const tip = list
      .map((x) => {
        if (x.type === "spelling") {
          const sug = (x.suggestions || []).slice(0, 3).join(", ") || "no suggestion";
          return `Spelling: "${s}" → ${sug}`;
        }
        if (x.type === "repetition") return "Repeated word";
        if (x.type === "style") return x.message || "Possible passive voice";
        if (x.type) return x.type;
        return "issue";
      })
      .join(" | ");

    tokenLayer += `<mark class="${cls} rounded px-0.5" title="${esc(tip)}">${safe}</mark>`;
  }

  // 2) Range-level issues (long sentences) — highlight by charStart/charEnd over the raw text.
  const ranges = (issues || []).filter(
    (x) =>
      x &&
      x.type === "length" &&
      Number.isFinite(x.charStart) &&
      Number.isFinite(x.charEnd) &&
      x.charEnd > x.charStart
  );
  if (!ranges.length) return tokenLayer;

  // Build a second pass over raw text, overlaying long sentence spans in yellow.
  let out = "";
  let pos = 0;
  const ordered = ranges.sort((a, b) => a.charStart - b.charStart);
  for (const r of ordered) {
    const a = Math.max(0, Math.min(raw.length, r.charStart));
    const b = Math.max(a, Math.min(raw.length, r.charEnd));
    if (a > pos) out += esc(raw.slice(pos, a));
    const seg = raw.slice(a, b);
    out += `<mark class="bg-yellow-100 text-yellow-900 rounded px-0.5" title="${esc(
      `Long sentence (${r.words || "many"} words)`
    )}">${esc(seg)}</mark>`;
    pos = b;
  }
  if (pos < raw.length) out += esc(raw.slice(pos));

  return out;
}
