import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { ProofAssessment, ProofQuote } from "../lib/contracts.ts";
import { confirmCoverage, summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { buyerRequirementSections } from "../lib/requirement-display.ts";
import { plainDeliverySummary } from "../lib/plain-delivery-summary.ts";
import { overviewFeedbackDraft } from "../lib/delivery-overview.ts";

async function compile(name: string, replacements: Record<string,string> = {}) {
  const source = await readFile(new URL(`../app/components/${name}.tsx`, import.meta.url), "utf8");
  let output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX}}).outputText.replace(/import ["'][^"']+\.css["'];/gu, "");
  for (const name of ["react", "react/jsx-runtime", "lucide-react"]) output = output.replaceAll(JSON.stringify(name), JSON.stringify(import.meta.resolve(name)));
  output = output.replaceAll('"@/lib/delivery-overview"', JSON.stringify(new URL("../lib/delivery-overview.ts", import.meta.url).href));
  output = output.replaceAll('"@/lib/requirement-display"', JSON.stringify(new URL("../lib/requirement-display.ts", import.meta.url).href));
  for (const [from, to] of Object.entries(replacements)) output = output.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`;
}
const component = (async () => (await import(await compile("PlainDeliveryWorkspace", {"./DeliveryWebsiteLink": await compile("DeliveryWebsiteLink"), "./BuyerRequirementText": await compile("BuyerRequirementText")}))).PlainDeliveryWorkspace)();
// Keep the real component and its handlers. Only initialize the unrelated mobile-tab hook
// without a DOM so tests can deliberately click the returned buttons.
const interactiveComponent = (async () => (await import(await compile("PlainDeliveryWorkspace", {
  "./DeliveryWebsiteLink": await compile("DeliveryWebsiteLink"), "./BuyerRequirementText": await compile("BuyerRequirementText"),
  [import.meta.resolve("react")]: `data:text/javascript,${encodeURIComponent("export const useState = value => [value, () => {}];")}`,
}))).PlainDeliveryWorkspace)();
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
  assert.match(html,/Does not match the agreement/u); assert.match(html,/AI: evidence found/u);
  assert.match(html,/1 additional AI risk indications/u); assert.match(html,/recording a view does not resolve/u);
});
test("rendered bilingual no-model and missing-snapshot states never imply approval", async () => {
  assert.match(await render(summary()),/no AI report yet/u);
  assert.match(await render(summary(),"zh"),/和约定不符/u);
  assert.match(await render({kind:"unavailable"}),/This acceptance record couldn’t be opened/u);
});
test("source publication cannot be mislabeled as an AI finding", async () => {
  const marked = structuredClone(report); marked.items[0].publicationBasis = {schema:"source-publication-v3",reason:"locked_price_mismatch"};
  const html = await render(summary(marked)); assert.match(html,/Files: evidence found/u); assert.doesNotMatch(html,/AI: evidence found/u);
});

test("source publication and a conflicting original model judgment remain separate", async () => {
  const marked = structuredClone(report);
  marked.items[0].publicationBasis = {schema:"source-publication-v3",reason:"locked_price_match"};
  marked.items[0].modelJudgment = {status:"insufficient_evidence",explanation:"Original could not verify",citations:[]};
  const html = await render(summary(marked));
  assert.match(html,/Files: evidence found/u);
  assert.match(html,/<summary>What AI first said<\/summary><span>cannot determine/u);
  assert.match(html,/Does not match the agreement/u);
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
  assert.match(html,/Reviewed: cannot determine/u);
  assert.match(html,/<summary>What AI first said<\/summary><span>evidence found/u);
  assert.doesNotMatch(html,/>AI: cannot determine/u);
});

test("saved buyer choices distinguish agreed work from deferred original wording", () => {
  const summary = "菜单上请写牛肉面 18 澳元。\n想要一个订座按钮。";
  const units = summaryCoverageUnits(summary, 2);
  const coverage = confirmCoverage(summary, {version:2, sourceText:summary, confirmed:true, decisions:[
    {id:units[0].id, disposition:"include"},
    {id:units[1].id, disposition:"exclude", reason:"第二期再做"},
  ]}, "2026-11-10T00:00:00Z");
  const valid = buyerRequirementSections({summary}, "zh", coverage);
  assert.equal(valid.confirmed, true);
  assert.deepEqual(valid.lines, ["菜单上请写牛肉面 18 澳元。"]);
  assert.equal(valid.excluded[0].text, "想要一个订座按钮。");
  assert.equal(valid.excluded[0].reason, "第二期再做");
  assert.equal(valid.original, summary);
  const mismatched = buyerRequirementSections({summary: summary + "\n希望能显示地址。"}, "zh", coverage);
  assert.equal(mismatched.confirmed, false);
  assert.equal(mismatched.lines.length, 3);
  const altered = structuredClone(coverage); altered.decisions[1].text = "A different text";
  assert.equal(buyerRequirementSections({summary}, "zh", altered).confirmed, false);
});

test("the short overview keeps problems visible and folds routine evidence with brief items first", async () => {
  const ready = summary();
  assert.equal(ready.kind, "ready");
  if (ready.kind !== "ready") return;
  const routine = Array.from({length: 5}, (_, index) => ({
    ...ready.rows[0], rule: "pass" as const,
    criterion: {id:`page-${index + 1}`, title:`Routine page ${index + 1}`, source:`Deliver page ${index + 1}`},
  }));
  ready.rows = [...routine,
    {...routine[0], criterion: {id:"coverage-1", title:"The price I agreed", source:"AUD 18"}},
    {...ready.rows[0], criterion: {id:"missing-hours", title:"Hours are missing", source:"Open 11am to 8pm"}},
  ];
  const [visible, folded] = (await render(ready)).split('<details class="plain-more-checks">');
  assert.match(visible, /Hours are missing/u);
  assert.doesNotMatch(visible, /The price I agreed/u);
  assert.doesNotMatch(visible, /Routine page 5/u);
  assert.match(folded, /The price I agreed/u);
  assert.ok(folded.indexOf("The price I agreed") < folded.indexOf("Routine page 1"));
  assert.match(folded, /See 6 more check results/u);
  assert.match(folded, /Routine page 5/u);
  assert.doesNotMatch(folded, /Hours are missing/u);
});

test("a quiet overview names its recorded results while an original AI disagreement stays visible", async () => {
  const ready = summary(report);
  assert.equal(ready.kind,"ready"); if (ready.kind !== "ready") return;
  ready.rows[0].rule = "pass";
  assert.match(await render(ready), /View 1 recorded check results/u);
  assert.match(await render(ready,"zh"), /查看已记录的 1 项结果/u);
  ready.rows[0].ai!.modelJudgment = {status:"insufficient_evidence",explanation:"Original model could not verify",citations:[]};
  const html = await render(ready);
  assert.match(html, /AI first: cannot determine/u);
  assert.doesNotMatch(html, /class="plain-more-checks"/u);
});

type TestNode = {type?: unknown; props?: {children?: unknown; className?: string; disabled?: boolean; onClick?: () => void; [key: string]: unknown}};
function nodes(tree: unknown): TestNode[] {
  const result: TestNode[] = [];
  function walk(value: unknown) {
    if (Array.isArray(value)) {value.forEach(walk); return;}
    if (value && typeof value === "object" && "props" in value) {const node = value as TestNode; result.push(node); walk(node.props?.children);}
  }
  walk(tree); return result;
}
function actionableFixture() {
  const currentCriteria = [criteria[0], {id:"hours",title:"Opening hours",source:"Show the exact agreed hours: 11am to 8pm."}];
  const delivery = {id:"exact-v2",label:"Second delivery",variant:"upload" as const,submittedAt:"2026-11-10",evidence:[
    {id:"home-evidence",criterionId:"home",finding:"pass" as const,file:"index.html",excerpt:"Home",explanation:"Home is present"},
    {id:"hours-evidence",criterionId:"hours",finding:"fail" as const,file:"index.html",excerpt:"",explanation:"Closing time is missing"},
  ]};
  const currentQuote = {...quote,proof:{...quote.proof,criteria:currentCriteria,delivery,collaboration:{stage:"submitted" as const,submission:{deliveryId:delivery.id,at:"2026-11-10",note:"Review this exact version"},feedback:[]}}};
  const currentSummary = plainDeliverySummary({delivery,criteria:currentCriteria,review:{deliveryId:delivery.id,reviewedAt:"2026-11-10",mode:"demo",summary:"Synthetic file checks"},manualChecks:[],accepted:false});
  const props = {quote:currentQuote,role:"buyer",language:"en",summary:currentSummary,handoffStatus:"Submitted",accepted:false,busy:false,onDetails:()=>{},onAgreement:()=>{},onRefresh:()=>{}};
  return {props,currentQuote,currentSummary};
}

test("a non-first requirement opens and drafts its exact version only after an explicit click", async () => {
  const {props,currentSummary} = actionableFixture();
  assert.equal(currentSummary.kind,"ready"); if (currentSummary.kind !== "ready") return;
  const calls: unknown[] = [], before = structuredClone({quote:props.quote,summary:currentSummary});
  const tree = (await interactiveComponent)({...props,onInspectCriterion:(value:unknown)=>calls.push(value),onPrepareFeedback:(value:unknown)=>calls.push(value)});
  assert.deepEqual(calls,[]);
  const all = nodes(tree), inspect = all.find(node=>node.type==="button" && node.props?.["data-criterion-id"]==="hours" && node.props.className==="text-button");
  const feedback = all.find(node=>node.type==="button" && node.props?.["data-criterion-id"]==="hours" && node.props.className==="text-button plain-criterion-feedback");
  assert.ok(inspect?.props?.onClick); assert.ok(feedback?.props?.onClick);
  inspect.props.onClick(); assert.deepEqual(calls,[{deliveryId:"exact-v2",criterionId:"hours",frozen:false}]);
  feedback.props.onClick(); assert.deepEqual(calls[1],overviewFeedbackDraft(currentSummary.rows.find(row=>row.criterion.id==="hours")!,"exact-v2","en"));
  assert.equal(calls.length,2);
  assert.deepEqual({quote:props.quote,summary:currentSummary},before);
  const html = renderToStaticMarkup(tree);
  assert.match(html,/Show the exact agreed hours: 11am to 8pm\./u);
  assert.match(html,/Closing time is missing/u);
  assert.match(html,/You can edit the draft before sending it to the seller/u);
  assert.equal(all.filter(node=>node.type==="details" && node.props?.className==="plain-criterion-details" && node.props.open).length,0);
});

test("draft feedback is absent for sellers, accepted, busy, frozen, stale and unsubmitted versions", async () => {
  const {props,currentQuote,currentSummary} = actionableFixture();
  assert.equal(currentSummary.kind,"ready"); if (currentSummary.kind !== "ready") return;
  const Component = await interactiveComponent, calls: unknown[] = [];
  const variants = [
    {role:"seller"}, {accepted:true}, {busy:true}, {summary:{...currentSummary,frozen:true}},
    {summary:{...currentSummary,deliveryId:"previous-v1"}},
    {quote:{...currentQuote,proof:{...currentQuote.proof,collaboration:{...currentQuote.proof.collaboration,stage:"changes_requested"}}}},
    {quote:{...currentQuote,proof:{...currentQuote.proof,collaboration:{...currentQuote.proof.collaboration,submission:{...currentQuote.proof.collaboration.submission,deliveryId:"previous-v1"}}}}},
    {quote},
  ];
  for (const variant of variants) {
    const tree = Component({...props,onPrepareFeedback:(value:unknown)=>calls.push(value),...variant});
    assert.equal(nodes(tree).filter(node=>node.props?.className==="text-button plain-criterion-feedback").length,0,JSON.stringify(variant));
  }
  assert.equal(nodes(Component(props)).filter(node=>node.props?.className==="text-button plain-criterion-feedback").length,0);
  assert.deepEqual(calls,[]);
});

test("supported and human-confirmed items start blank feedback without inventing an evidence request", async () => {
  const {props,currentSummary} = actionableFixture(), Component = await interactiveComponent;
  assert.equal(currentSummary.kind,"ready"); if (currentSummary.kind !== "ready") return;
  const home = currentSummary.rows.find(row=>row.criterion.id==="home")!;
  const model = {...report.items[0],criterionId:"home"};
  for (const language of ["en","zh"] as const) for (const row of [
    {...home,ai:model},
    {...home,rule:"needs_human" as const,humanPending:false,humanConfirmed:true,ai:{...model,status:"insufficient_evidence" as const}},
    {...home,ai:{...model,modelJudgment:{status:"insufficient_evidence" as const,explanation:"Original AI abstention",citations:[]}}},
  ]) {
    const calls: unknown[] = [], before = structuredClone(row);
    const tree: unknown = Component({...props,language,summary:{...currentSummary,rows:[row]},onPrepareFeedback:(value:unknown)=>calls.push(value)});
    const feedback = nodes(tree).find(node=>node.props?.className==="text-button plain-criterion-feedback");
    assert.ok(feedback?.props?.onClick); assert.equal(feedback.props.children,language==="en"?"Write feedback for this item":"针对这项写意见");
    assert.deepEqual(calls,[]); feedback.props.onClick();
    assert.deepEqual(calls,[{deliveryId:"exact-v2",criterionId:"home",comment:"",startBlank:true}]);
    assert.deepEqual(row,before);
  }
});

test("unresolved rule, human and AI findings retain their exact grounded feedback draft", async () => {
  const {props,currentSummary} = actionableFixture(), Component = await interactiveComponent;
  assert.equal(currentSummary.kind,"ready"); if (currentSummary.kind !== "ready") return;
  const home = currentSummary.rows.find(row=>row.criterion.id==="home")!, model = {...report.items[0],criterionId:"home"};
  for (const row of [
    {...home,rule:"fail" as const}, {...home,rule:"unreviewed" as const},
    {...home,rule:"needs_human" as const,humanPending:true},
    {...home,ai:{...model,status:"changes_suggested" as const}},
    {...home,ai:{...model,status:"insufficient_evidence" as const}},
    {...home,rule:"needs_human" as const,humanConfirmed:true,ai:{...model,status:"changes_suggested" as const}},
  ]) {
    const calls: unknown[] = [];
    const tree: unknown = Component({...props,summary:{...currentSummary,rows:[row]},onPrepareFeedback:(value:unknown)=>calls.push(value)});
    const feedback = nodes(tree).find(node=>node.props?.className==="text-button plain-criterion-feedback");
    assert.ok(feedback?.props?.onClick); assert.equal(feedback.props.children,"Draft feedback for this item");
    assert.deepEqual(calls,[]); feedback.props.onClick();
    assert.deepEqual(calls,[overviewFeedbackDraft(row,"exact-v2","en")]);
  }
});

test("accepted rows open only frozen evidence and never expose feedback or an AI run entry", async () => {
  const {props,currentSummary} = actionableFixture();
  assert.equal(currentSummary.kind,"ready"); if (currentSummary.kind !== "ready") return;
  const Component = await interactiveComponent, calls: unknown[] = [];
  const acceptedProps = {...props,accepted:true,onInspectCriterion:(value:unknown)=>calls.push(value),onPrepareFeedback:(value:unknown)=>calls.push(value),assessmentAction:{label:"Open AI controls",run:()=>calls.push("AI")}};
  const tree = Component({...acceptedProps,summary:{...currentSummary,frozen:true}}), all = nodes(tree);
  assert.deepEqual(calls,[]);
  const inspect = all.find(node=>node.type==="button" && node.props?.["data-criterion-id"]==="hours");
  assert.ok(inspect?.props?.onClick); inspect.props.onClick();
  assert.deepEqual(calls,[{deliveryId:"exact-v2",criterionId:"hours",frozen:true}]);
  assert.doesNotMatch(renderToStaticMarkup(tree),/Draft feedback for this item|Open AI controls/u);
  for (const summary of [currentSummary,{...currentSummary,frozen:true,deliveryId:"previous-v1"}]) {
    assert.equal(nodes(Component({...acceptedProps,summary})).filter(node=>node.type==="button" && node.props?.["data-criterion-id"]).length,0);
  }
});

test("AI, comparison and report stay folded while navigation replay stays directly visible and respects busy", async () => {
  const {props} = actionableFixture(), Component = await interactiveComponent, calls: string[] = [];
  const record = (value: string) => calls.push(value);
  const actions = {
    assessmentAction:{label:"Open AI controls",run:()=>record("assessment")},comparisonAction:{label:"Compare revisions",run:()=>record("comparison")},
    reportAction:{label:"Open full report",run:()=>record("report")},navigation:{count:2,accepted:false,open:()=>record("replay")},
  };
  const tree = Component({...props,...actions});
  assert.deepEqual(calls,[]);
  const disclosure = nodes(tree).find(node=>node.type==="details" && node.props?.className==="plain-more-check-actions");
  assert.ok(disclosure); assert.equal(disclosure.props?.open,undefined);
  assert.match(renderToStaticMarkup(tree), /<summary>More checks<\/summary>/u);
  const labels = ["Open AI controls","Compare revisions","Open full report"];
  for (const label of labels) {
    const button = nodes(disclosure).find(node=>node.type==="button" && Array.isArray(node.props?.children) && node.props.children[0]===label);
    assert.ok(button?.props?.onClick); button.props.onClick();
  }
  assert.equal(nodes(disclosure).filter(node=>node.props?.className==="text-button plain-card-detail plain-report-link").length,0);
  const replay = nodes(tree).find(node=>node.props?.className==="text-button plain-card-detail plain-report-link");
  assert.ok(replay?.props?.onClick); replay.props.onClick();
  const html = renderToStaticMarkup(tree);
  assert.ok(html.indexOf("Replay 2 links") < html.indexOf('class="plain-more-check-actions"'));
  assert.deepEqual(calls,["assessment","comparison","report","replay"]);
  const busyTree = Component({...props,...actions,busy:true,onInspectCriterion:()=>record("inspect")});
  for (const node of nodes(busyTree).filter(node=>node.type==="button" && (node.props?.["data-criterion-id"] || Array.isArray(node.props?.children) && [...labels,"Replay 2 links"].includes(String(node.props.children[0]))))) {
    assert.equal(node.props?.disabled,true); node.props?.onClick?.();
  }
  assert.deepEqual(calls,["assessment","comparison","report","replay"]);
  for (const language of ["en","zh"] as const) {
    const acceptedTree = Component({...props,language,accepted:true,navigation:{...actions.navigation,accepted:true}}), acceptedHtml = renderToStaticMarkup(acceptedTree);
    assert.match(acceptedHtml,language==="en"?/Acceptance report: replay 2 links/u:/验收报告：重放 2 条导航/u);
    assert.doesNotMatch(acceptedHtml,/class="plain-more-check-actions"/u);
  }
});
