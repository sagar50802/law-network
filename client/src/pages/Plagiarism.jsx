import { useEffect, useRef, useState } from "react";
import { getJSON } from "../utils/api";
import { highlightGrammarHTML, highlightAIHTML } from "../common/highlight";

export default function Plagiarism() {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef();

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const body = await getJSON("/api/plagiarism/check", { text });
      setResult(body);
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const grammarHTML = result?.grammar
    ? highlightGrammarHTML(text, result.grammar)
    : null;

  const aiHTML = result?.ai
    ? highlightAIHTML(text, result.ai)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">Plagiarism / AI / Grammar Check</h1>

      <textarea
        ref={textareaRef}
        rows={10}
        className="w-full border border-gray-300 rounded-md p-3 shadow-sm"
        placeholder="Paste or write text here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <button
        onClick={submit}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 transition"
      >
        {loading ? "Analyzing..." : "Check Text"}
      </button>

      {result && (
        <div className="space-y-8">
          {/* Grammar Result */}
          {grammarHTML && (
            <div>
              <h2 className="text-xl font-semibold text-red-600 mb-2">
                Grammar Mistakes
              </h2>
              <div
                className="prose prose-sm bg-red-50 p-3 border border-red-300 rounded"
                dangerouslySetInnerHTML={{ __html: grammarHTML }}
              />
            </div>
          )}

          {/* AI Detection */}
          {aiHTML && (
            <div>
              <h2 className="text-xl font-semibold text-blue-600 mb-2">
                AI-Generated Detection
              </h2>
              <div
                className="prose prose-sm bg-blue-50 p-3 border border-blue-300 rounded"
                dangerouslySetInnerHTML={{ __html: aiHTML }}
              />
            </div>
          )}

          {/* Score Gauge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Gauge title="Plagiarism Score" value={result.score} color="red" />
            <Gauge title="AI Score" value={result.aiScore} color="blue" />
          </div>
        </div>
      )}
    </div>
  );
}

/* UI Components */
function Gauge({ title, value, color }) {
  const v = Math.max(0, Math.min(100, +value || 0));
  const colorMap = {
    red: {
      text: "text-red-600",
      bar: "bg-red-500",
    },
    blue: {
      text: "text-blue-600",
      bar: "bg-blue-500",
    },
    green: {
      text: "text-green-600",
      bar: "bg-green-500",
    },
  };

  const colors = colorMap[color] || colorMap.red;

  return (
    <div className="rounded-xl border p-4 shadow text-center">
      <div className={`${colors.text} font-bold text-2xl`}>{v}%</div>
      <div className="text-sm text-gray-700 mt-1">{title}</div>
      <div className="relative w-full h-2 bg-gray-200 rounded-full mt-2">
        <div
          className={`absolute top-0 left-0 h-2 rounded-full ${colors.bar}`}
          style={{ width: `${v}%` }}
        />
      </div>
    </div>
  );
}
