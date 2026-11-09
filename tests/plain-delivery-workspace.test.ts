import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { ProofAssessment, ProofQuote } from "../lib/contracts.ts";
import { plainDeliverySummary } from "../lib/plain-delivery-summary.ts";

async function compile(name: string, replacements: Record<string,string> = {}) {
  const source = await readFile(new URL(`../app/components/${name}.tsx`, import.meta.url), "utf8");
  let output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText.replace(/import ["'][^"']+\.css["'];/gu, "");
  for (const name of ["react", "react/jsx-runtime", "lucide-react"]) output = output.replaceAll(JSON.stringify(name), JSON.stringify(import.meta.resolve(name)));
  output = output.replaceAll('"@/lib/delivery-overview"', JSON.stringify(new URL("../lib/delivery-overview.ts", import.meta.url).href));
  for (const [from, to] of Object.entries(replacements)) output = output.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}
const component = (async () => (await import(await compile("PlainDeliveryWorkspace", {"./DeliveryWebsiteLink": await compile("DeliveryWebsiteLink")}))).PlainDeliveryWorkspace)();
const criteria = [{id:"home", title:"Home", source:"Deliver home"}];
const report: ProofAssessment = {id:"r", deliveryId:"v", method:"source-ai-v1", mode:"live", model:"synthetic", assessedAt:"2026-11-09", items:[{criterionId:"home",status:"supported",explanation:"Synthetic",citations:[],ruleEvidenceIds:[]}], risks:[{title:"Synthetic",explanation:"Unknown",suggestion:"Check",citations:[]}],limitations:[],coverage:{includedFiles:[],omittedFiles:[],truncatedFiles:[]}};
const summary = (assessment?: ProofAssessment) => plainDeliverySummary({delivery:{id:"v",label:"Synthetic",variant:"upload",submittedAt:"2026-11-09",assessment,evidence:[{id:"e",criterionId:"home",finding:"fail",file:"index.html",excerpt:"",explanation:"Missing"}]},criteria,review:{deliveryId:"v",reviewedAt:"2026-11-09",mode:"demo",summary:"Rules"},manualChecks:[],accepted:false});
const quote = {title:"Synthetic shop",summary:"Deliver home",proof:{criteria}} as ProofQuote;
async function render(value: ReturnType<typeof summary>, language: "zh"|"en" = "en") {
  const calls: string[] = [];
  const html = renderToStaticMarkup(createElement(await component,{quote,role:"buyer",language,summary:value,handoffStatus:"Submitted",accepted:false,busy:false,onDetails:()=>calls.push("details"),onAgreement:()=>calls.push("agreement"),onRefresh:()=>calls.push("refresh")}));
  assert.deepEqual(calls,[]); return html;
}
test("rendered overview exposes rule/AI contradiction and extra risks together", async () => {
  const html = await render(summary(report));
  assert.match(html,/Rules: mismatch/u); assert.match(html,/AI: evidence found/u);
  assert.match(html,/1 additional AI risk indications/u); assert.match(html,/recording a position does not resolve/u);
});
test("rendered bilingual no-model and missing-snapshot states never imply approval", async () => {
  assert.match(await render(summary()),/No AI report for this version/u);
  assert.match(await render(summary(),"zh"),/规则：需要修改/u);
  assert.match(await render({kind:"unavailable"}),/Acceptance evidence is unavailable/u);
});
test("source publication cannot be mislabeled as an AI finding", async () => {
  const marked = structuredClone(report); marked.items[0].publicationBasis = {schema:"source-publication-v3",reason:"locked_price_mismatch"};
  const html = await render(summary(marked)); assert.match(html,/Source check: evidence found/u); assert.doesNotMatch(html,/AI: evidence found/u);
});

test("source publication and a conflicting original model judgment remain separate", async () => {
  const marked = structuredClone(report);
  marked.items[0].publicationBasis = {schema:"source-publication-v3",reason:"locked_price_match"};
  marked.items[0].modelJudgment = {status:"insufficient_evidence",explanation:"Original could not verify",citations:[]};
  const html = await render(summary(marked));
  assert.match(html,/Source check: evidence found/u);
  assert.match(html,/Original AI: cannot determine/u);
  assert.match(html,/Rules: mismatch/u);
  assert.match(html,/1 differ from the original AI judgment/u);
  assert.match(html,/Published results: changes 0 · unknown 0/u);
});

test("recognized withheld indications stay separate from published risks and malformed entries stay hidden", async () => {
  const withheld = structuredClone(report);
  withheld.withheldRisks = {version:4,reason:"optional_source_leads_unverified",adjustedCriteria:[],entries:[{originalRiskIndex:0,risk:withheld.risks[0]}]};
  withheld.risks = [];
  const html = await render(summary(withheld));
  assert.match(html,/1 unverified AI indications are withheld from the risk list/u);
  assert.doesNotMatch(html,/additional AI risk indications to verify/u);
  withheld.withheldRisks.entries[0].originalRiskIndex = 2;
  assert.doesNotMatch(await render(summary(withheld)),/withheld from the risk list/u);
});

test("an original judgment stays reachable when a historical published result has no source-publication marker", async () => {
  const historical = structuredClone(report);
  historical.items[0].status = "insufficient_evidence";
  historical.items[0].modelJudgment = {status:"supported",explanation:"Original model found evidence",citations:[]};
  const html = await render(summary(historical));
  assert.match(html,/1 differ from the original AI judgment/u);
  assert.match(html,/Published result: cannot determine/u);
  assert.match(html,/Original AI: evidence found/u);
  assert.doesNotMatch(html,/>AI: cannot determine/u);
});
