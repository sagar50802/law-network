import { useMemo, useRef, useState, useEffect } from "react";
import { apiJSON, apiUrl } from "../utils/api";
import { highlightGrammarHTML } from "../utils/plagiarism";

/* ---------- tiny helpers ---------- */
const ringStyle = (pct, color) => ({ background: `conic-gradient(${color} ${pct * 3.6}deg, #e5e7eb 0)` });
const wordsCount = (t) => (t.match(/\b[\w']+\b/g) || []).length;
const splitSentences = (t) => t.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((x) => x.trim().length);

function highlightAIHTML(text, ai) {
  if (!ai?.sentences?.length) return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const sents = splitSentences(text);
  let out = "";
  for (let i = 0; i < sents.length; i++) {
    const s = sents[i];
    const flag = ai.sentences.find((x) => x.i === i);
    if (flag?.isAI) {
      out += `<mark class="bg-purple-100 text-purple-900 rounded px-0.5" title="AI-like (score ${flag.score})">${s
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</mark> `;
    } else {
      out += s.replace(/</g, "&lt;").replace(/>/g, "&gt;") + " ";
    }
  }
  return out.trim();
}

export default function Plagiarism() {
  const [text, setText] = useState("");
  const [scanQuery, setScanQuery] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [typing, setTyping] = useState(false);
  const [activeTool, setActiveTool] = useState("plagiarism"); // plagiarism | grammar | ai | summary | rewrite
  const [result, setResult] = useState(null); // server response
  const [extraSources, setExtraSources] = useState([]); // [{name, text}]
  const fileRef = useRef(null);

  const words = useMemo(() => wordsCount(text), [text]);
  useEffect(() => {
    if (activeTool !== "rewrite") setTyping(false);
  }, [activeTool]);

  const onChoose = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const arr = [];
    for (const f of files) {
      const t = await f.text();
      arr.push({ name: f.name, text: t });
    }
    setExtraSources((p) => [...p, ...arr]);
    e.target.value = "";
  };

  async function analyze(force = false) {
    if (!force && result) return result;
    if (words < 10) {
      alert("Paste at least 10 words.");
      return null;
    }

    setAnalyzing(true);
    setResult(null);
    try {
      const payload = {
        text,
        query: scanQuery || text.split(/\s+/).slice(0, 12).join(" "),
        useWeb: true,
        limit: 8,
        extraSources,
      };

      // ✅ goes through Vite proxy in dev (because API base is empty),
      // or hits absolute origin in prod (if VITE_API_BASE is set).
      const body = await apiJSON("/api/plagiarism/analyze", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!body?.ok) throw new Error(body?.error || "Analyze failed");
      setResult(body);
      return body;
    } catch (e) {
      alert(e.message || "Analyze failed");
      return null;
    } finally {
      setAnalyzing(false);
    }
  }

  /* ---------- toolbar actions ---------- */
  const runPlagiarism = async () => {
    setActiveTool("plagiarism");
    await analyze(true);
  };
  const runGrammar = async () => {
    setActiveTool("grammar");
    await analyze(!result);
  };
  const runAI = async () => {
    setActiveTool("ai");
    await analyze(!result);
  };
  const runSummary = async () => {
    setActiveTool("summary");
    await analyze(!result);
  };
  const runRewrite = async () => {
    setActiveTool("rewrite");
    const j = await analyze(!result);
    if (!j?.rewrite) return;
    setTyping(true);
    const newText = j.rewrite;
    let i = 0;
    const step = Math.max(1, Math.floor(newText.length / 200));
    const timer = setInterval(() => {
      i += step;
      setText(newText.slice(0, i));
      if (i >= newText.length) {
        clearInterval(timer);
        setTyping(false);
      }
    }, 20);
  };

  /* ---------- exports ---------- */
  const downloadHTML = () => {
    if (!result?.report) return;
    const { report } = result;
    const html = `<!doctype html><meta charset="utf-8"><title>Plagiarism Report</title>
<style>
body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f8fafc;color:#0b1220;margin:24px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-bottom:16px}
mark{border-radius:4px;padding:0 2px}
small{color:#6b7280}
</style>
<h1>Plagiarism Report</h1>
<div class="card"><b>Unique:</b> ${report.pctUnique}% • <b>Exact:</b> ${report.pctExact}% • <b>Partial:</b> ${report.pctPartial}%<br/><small>Total words: ${report.totalWords}</small></div>
<div class="card"><h3>Sources</h3><ul>${
      (report.perSource || [])
        .map(
          (s) =>
            `<li><b>[${s.idx}] ${s.name}</b> — ${s.pct}% ${
              s.url ? `<a href="${s.url}">open</a>` : ""
            }<br/><small>${s.snippet || ""}</small></li>`
        )
        .join("")
    }</ul></div>
<div class="card" style="line-height:1.9">${report.html}</div>`;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plagiarism-report.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  async function downloadPDF() {
    if (!result?.report) return;
    // Binary endpoint — use fetch directly with apiUrl.
    const r = await fetch(apiUrl("/api/plagiarism/pdf"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report: result.report, text }),
    });
    if (!r.ok) return alert("PDF export failed");
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plagiarism-report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  const grammarHTML = result?.grammar ? highlightGrammarHTML(text, result.grammar) : null;
  const aiHTML = result?.ai ? highlightAIHTML(text, result.ai) : null;

  return (
    <main className="min-h-screen bg-[#f8fafc]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={runPlagiarism}
            className={`px-3 py-1.5 rounded-xl ${
              activeTool === "plagiarism" ? "bg-emerald-600 text-white" : "bg-white border hover:bg-gray-50"
            }`}
          >
            Plagiarism Checker
          </button>
          <button
            onClick={runRewrite}
            className={`px-3 py-1.5 rounded-xl ${
              activeTool === "rewrite" ? "bg-blue-600 text-white" : "bg-white border hover:bg-gray-50"
            }`}
          >
            Make it Unique
          </button>
          <button
            onClick={runGrammar}
            className={`px-3 py-1.5 rounded-xl ${
              activeTool === "grammar" ? "bg-indigo-600 text-white" : "bg-white border hover:bg-gray-50"
            }`}
          >
            Check Grammar
          </button>
          <button
            onClick={runAI}
            className={`px-3 py-1.5 rounded-xl ${
              activeTool === "ai" ? "bg-purple-600 text-white" : "bg-white border hover:bg-gray-50"
            }`}
          >
            Detector AI
          </button>
          <button
            onClick={runSummary}
            className={`px-3 py-1.5 rounded-xl ${
              activeTool === "summary" ? "bg-amber-600 text-white" : "bg-white border hover:bg-gray-50"
            }`}
          >
            Summarize Text
          </button>
        </div>

        <div className="grid lg:grid-cols-[1.2fr_0.9fr] gap-6">
          {/* Left: input */}
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-2xl font-bold">Plagiarism Checker</h1>
              <div className="text-sm text-gray-500">
                Words: {words}
                {analyzing && <span className="ml-2 text-indigo-600">• analyzing</span>}
                {typing && <span className="ml-2 text-blue-600">• rewriting</span>}
              </div>
            </div>

            <textarea
              className="border rounded-2xl p-4 min-h-[320px] w-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Paste your text here…"
              value={text}
              readOnly={typing}
              onChange={(e) => setText(e.target.value)}
            />

            <div className="mt-4 flex flex-wrap gap-3 items-center">
              <button onClick={() => fileRef.current?.click()} className="border rounded-xl px-4 py-2 bg-white hover:bg-gray-50">
                Add sources (files)
              </button>
              <input ref={fileRef} type="file" accept=".txt,.md,.csv" multiple className="hidden" onChange={onChoose} />
              {extraSources.length > 0 && <div className="text-xs text-gray-600">• {extraSources.length} file source(s) added</div>}

              <div className="flex items-center gap-2 ml-auto">
                <input
                  value={scanQuery}
                  onChange={(e) => setScanQuery(e.target.value)}
                  className="border rounded-lg px-2 py-1"
                  placeholder="Web scan query (optional)"
                />
                {!analyzing ? (
                  <button onClick={() => analyze(true)} className="rounded-xl px-3 py-2 bg-indigo-600 text-white hover:bg-indigo-700">
                    Analyze
                  </button>
                ) : (
                  <button disabled className="rounded-xl px-3 py-2 bg-indigo-300 text-white">
                    Analyzing…
                  </button>
                )}
              </div>

              <button
                onClick={downloadPDF}
                disabled={!result?.report}
                className={`rounded-xl px-4 py-2 ${
                  result?.report ? "bg-yellow-600 text-white hover:bg-yellow-700" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                Download PDF
              </button>
              <button
                onClick={downloadHTML}
                disabled={!result?.report}
                className={`rounded-xl px-4 py-2 ${
                  result?.report ? "bg-yellow-500 text-white hover:bg-yellow-600" : "bg-gray-200 text-gray-500 cursor-not-allowed"
                }`}
              >
                Download HTML
              </button>
            </div>
          </div>

          {/* Right: charts + sources */}
          <div className="rounded-3xl border bg-white p-6 shadow-sm">
            <div className="grid grid-cols-3 gap-3">
              <Gauge title="Unique" color="#10b981" value={result?.chart?.unique || 0} />
              <Gauge title="Exact" color="#ef4444" value={result?.chart?.exact || 0} />
              <Gauge title="Partial" color="#f59e0b" value={result?.chart?.partial || 0} />
            </div>

            <Bars label="Unique" color="bg-emerald-500" value={result?.chart?.unique || 0} className="mt-5" />
            <Bars label="Exact" color="bg-rose-500" value={result?.chart?.exact || 0} />
            <Bars label="Partial" color="bg-amber-500" value={result?.chart?.partial || 0} />

            <div className="mt-6">
              <div className="font-semibold mb-2">Detected Sources</div>
              <div className="space-y-2">
                {result?.report?.perSource?.length ? (
                  result.report.perSource.map((s) => (
                    <div key={`${s.id}-${s.idx}`} className="border rounded-xl p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium truncate">
                          <span className="mr-2 text-xs inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-800 text-white">
                            {s.idx}
                          </span>
                          {s.name}
                        </div>
                        <div className="text-sm text-rose-600 font-semibold">{s.pct}%</div>
                      </div>
                      {s.snippet && (
                        <div className="mt-1 text-xs text-gray-600">
                          {s.snippet}
                          {s.url && (
                            <a className="ml-2 text-blue-600 underline" href={s.url} target="_blank" rel="noreferrer">
                              Open
                            </a>
                          )}
                        </div>
                      )}
                      <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-1.5 bg-rose-500" style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-gray-500">No sources yet. Click <b>Analyze</b> to scan web & compute report.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Lower panels */}
        <div className="mt-6 grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-white p-5 leading-7 text-[15px]">
            {activeTool === "plagiarism" && (
              <>
                <div className="font-semibold mb-2">Plagiarism Highlights</div>
                {result?.report ? (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: result.report.html }} />
                    <div className="text-xs text-gray-500 mt-3 space-x-3">
                      <span>
                        <mark className="bg-rose-100 text-rose-800 px-1 rounded">red</mark> = exact 3-gram
                      </span>
                      <span>
                        <mark className="bg-amber-100 text-amber-800 px-1 rounded">amber</mark> = partial 2-gram
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500">Click Analyze to see matches…</div>
                )}
              </>
            )}

            {activeTool === "grammar" && (
              <>
                <div className="font-semibold mb-2">Grammar & Style</div>
                {result?.grammar ? (
                  <div dangerouslySetInnerHTML={{ __html: grammarHTML }} />
                ) : (
                  <div className="text-gray-500">Click Check Grammar to analyze…</div>
                )}
              </>
            )}

            {activeTool === "ai" && (
              <>
                <div className="font-semibold mb-2">AI Detector</div>
                {result?.ai ? (
                  <>
                    <div className="text-sm text-gray-600 mb-2">
                      Overall AI-likeness score: <b>{(result.ai.overall * 100).toFixed(1)}%</b>
                    </div>
                    <div dangerouslySetInnerHTML={{ __html: aiHTML }} />
                    <div className="text-xs text-gray-500 mt-2">Purple = likely AI-written (heuristic).</div>
                  </>
                ) : (
                  <div className="text-gray-500">Click Detector AI to analyze…</div>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border bg-white p-5 leading-7 text-[15px]">
            {activeTool === "summary" ? (
              <>
                <div className="font-semibold mb-2">Summary</div>
                {result?.summary ? (
                  <div className="whitespace-pre-wrap">{result.summary}</div>
                ) : (
                  <div className="text-gray-500">Click Summarize Text to generate…</div>
                )}
              </>
            ) : (
              <>
                <div className="font-semibold mb-2">Smart Rewrite (local)</div>
                {result?.rewrite ? (
                  <div className="whitespace-pre-wrap">{result.rewrite}</div>
                ) : (
                  <div className="text-gray-500">Click Make it Unique for a live rewrite.</div>
                )}
                {result?.meta ? (
                  <div className="mt-2 text-xs text-gray-500">
                    Words: {result.meta.words} • Hints used: {result.meta.hintCount} • Web scan: {result.meta.usedWeb ? "Yes" : "No"}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ---------- UI primitives ---------- */
function Gauge({ title, value, color }) {
  const v = Math.max(0, Math.min(100, +value || 0));
  return (
    <div className="rounded-xl border p-3 text-center">
      <div className="mx-auto w-16 h-16 rounded-full grid place-items-center" style={ringStyle(v, color)}>
        <div className="w-12 h-12 bg-white rounded-full grid place-items-center text-sm font-semibold">{v.toFixed(1)}%</div>
      </div>
      <div className="mt-2 text-sm font-semibold" style={{ color }}>
        {title}
      </div>
    </div>
  );
}
function Bars({ label, value, color, className = "" }) {
  const v = Math.max(0, Math.min(100, +value || 0));
  return (
    <div className={className}>
      <div className="flex justify-between text-xs text-gray-600">
        <span>{label}</span>
        <span>{v.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-2 ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
