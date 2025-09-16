export function highlightGrammarHTML(text, grammar) {
  if (!grammar?.length) return text;
  let highlighted = text;
  grammar.forEach((item) => {
    const { error, suggestion } = item;
    const reg = new RegExp(error, "gi");
    highlighted = highlighted.replace(
      reg,
      `<mark class="bg-indigo-100 text-indigo-800 rounded px-1" title="Suggestion: ${suggestion}">${error}</mark>`
    );
  });
  return highlighted;
}

export function highlightAIHTML(text, aiResult) {
  if (!aiResult?.sentences?.length) return text;
  const sents = text.split(/(?<=[.!?])\s+/);
  return sents
    .map((s, i) => {
      const flag = aiResult.sentences.find((x) => x.i === i);
      if (flag?.isAI) {
        return `<mark class="bg-purple-100 text-purple-800 px-1 rounded" title="AI score: ${flag.score}">${s}</mark>`;
      }
      return s;
    })
    .join(" ");
}
