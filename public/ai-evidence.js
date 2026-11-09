import {historicalAiSummary} from "./ai-evidence-model.mjs";
const metrics = document.getElementById("metrics"), cases = document.getElementById("cases");
const node = (tag, text) => {const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element;};
function table(headers, rows) {
  const wrap = node("div"); wrap.className = "table-scroll"; wrap.tabIndex = 0;
  const result = node("table"), head = node("thead"), body = node("tbody"), title = node("tr");
  headers.forEach(text => {const cell = node("th",text); cell.scope = "col"; title.append(cell);}); head.append(title);
  rows.forEach(row => {const tr = node("tr"); row.forEach(text => tr.append(node("td",String(text)))); body.append(tr);}); result.append(head,body); wrap.append(result); return wrap;
}
async function recordText(name) {
  const response = await fetch(`/benchmarks/noodle-core-2026-11-06/${name}`, {cache:"no-store"});
  if (!response.ok) throw new Error("Unavailable");
  return new TextDecoder("utf-8", {fatal:true, ignoreBOM:true}).decode(await response.arrayBuffer());
}
try {
  const [first,whole] = await Promise.all([recordText("first-live.json"),recordText("author-first-four-whole-review.json")]);
  const summary = await historicalAiSummary(first,whole);
  const labels = {raw:"Original model",published:"Published result",source:"Separate source finding",effective:"Source finding / published fallback"};
  metrics.replaceChildren(table(["Layer","Reference status matches","Evaluated","Unavailable"],Object.entries(summary.metrics).map(([key,value])=>[labels[key],value.matches,value.evaluated,value.unavailable])));
  for (const item of summary.cases) {
    const section = node("section"); section.className = "case";
    section.append(node("h2",item.id),table(["Criterion","Reference","Original model","Published","Source finding"],item.rows.map(row=>[row.criterionId,row.reference,row.raw,row.published,row.source??"Unavailable"])));
    section.append(node("p",`Whole-answer review — raw: ${item.rawWholeAnswer}; application: ${item.applicationWholeAnswer}.`));
    for (const note of item.notes) {const paragraph=node("p",note);paragraph.className="caveat";section.append(paragraph);}
    cases.append(section);
  }
} catch {
  metrics.textContent = "Historical scores are hidden because the saved records could not be loaded or verified. Open the original record links below to inspect the evidence.";
  cases.replaceChildren();
}
