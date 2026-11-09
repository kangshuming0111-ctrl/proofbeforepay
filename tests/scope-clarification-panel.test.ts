import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import type {ProofAssessmentItem, ProofBusinessCheckStep, ProofCriterion, ProofEvidence, ProofQuote} from "../lib/contracts.ts";
import type {ScopeContext, ScopeTargetCandidate} from "../lib/scope-clarifications.ts";
import {ASSESSMENT_EVIDENCE_NEED_REASONS} from "../lib/assessment-evidence-needs.ts";

const criterion: ProofCriterion = {id: "coverage-1", title: "Contact fields", source: "Contact source labels must include Name and Email."};
const item = (status: ProofAssessmentItem["status"], reason?: NonNullable<ProofAssessmentItem["evidenceNeed"]>["reason"]): ProofAssessmentItem => ({criterionId: criterion.id, status, explanation: "Preserved report wording", citations: [], ruleEvidenceIds: [], ...(reason ? {evidenceNeed: {schema: "source-evidence-need-v1", reason, targetFiles: []}} : {})});
const evidence = (finding: ProofEvidence["finding"], criterionId = criterion.id): ProofEvidence => ({id: "source-1", criterionId, file: "contact.html", excerpt: "<label>Name</label>", finding, explanation: "Checked source only"});

const components = (async () => {
  const source = await readFile(new URL("../app/components/ScopeClarificationPanel.tsx", import.meta.url), "utf8");
  let js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText.replace('import "../scope-clarification.css";', "");
  for (const name of ["react", "react/jsx-runtime"]) js = js.replaceAll(JSON.stringify(name), JSON.stringify(import.meta.resolve(name)));
  js = js.replaceAll('"@/lib/assessment-evidence-needs"', JSON.stringify(new URL("../lib/assessment-evidence-needs.ts", import.meta.url).href));
  js = js.replaceAll('"@/lib/assessment-requirement-completeness"', JSON.stringify(new URL("../lib/assessment-requirement-completeness.ts", import.meta.url).href));
  js = js.replaceAll('"./noodle-hours-guidance"', JSON.stringify(new URL("../app/components/noodle-hours-guidance.ts", import.meta.url).href));
  js = js.replaceAll('"./noodle-evidence-guidance"', JSON.stringify(new URL("../app/components/noodle-evidence-guidance.ts", import.meta.url).href));
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
})();
async function summary(input: Record<string, unknown> = {}, language: "zh" | "en" = "en") {
  const {RequirementNextStep} = await components;
  return renderToStaticMarkup(createElement(RequirementNextStep, {criterion, language, ...input}));
}

test("an unrun AI check and absent rule evidence are not rendered as unknown verdicts or a pass", async () => {
  const html = await summary();
  assert.match(html, /No rule result for this requirement/u);
  assert.match(html, /AI has not run/u);
  assert.doesNotMatch(html, /Unknown:|Mismatch:|Buyer confirmed this requirement/u);
  assert.doesNotMatch(html, /<button|<input|<form\b/u);
});

test("a real rule mismatch stays visible alongside AI support and human confirmation", async () => {
  const html = await summary({item: item("supported"), evidence: [evidence("fail")], humanConfirmed: true});
  assert.match(html, /Mismatch: rule check found a difference/u);
  assert.match(html, /Saved AI suggestion: support, still needs review/u);
  assert.match(html, /Buyer confirmed this requirement manually/u);
  assert.match(html, /Seller supplies a revision; buyer reviews/u);
  assert.match(html, /rather than reusing the old result/u);
});

test("source support is separated from unresolved storage and names seller evidence plus buyer review", async () => {
  const html = await summary({item: item("insufficient_evidence", "record_readback"), evidence: [evidence("pass")]});
  assert.match(html, /Rule evidence supports the checked facts/u);
  assert.match(html, /Unknown: insufficient saved AI evidence/u);
  assert.match(html, /Seller provides evidence; buyer reviews/u);
  assert.match(html, /fresh read that still finds its matching record/u);
  assert.match(html, /Page source or a success message does not prove storage/u);
  assert.doesNotMatch(html, /send.*email|confirmation email/u);
});

test("scope ambiguity asks both parties to agree a target without implying delivery failed", async () => {
  for (const language of ["zh", "en"] as const) {
    const html = await summary({item: item("insufficient_evidence", "page_scope")}, language);
    assert.match(html, language === "zh" ? /买卖双方/u : /Buyer and seller/u);
    assert.match(html, language === "zh" ? /双方明确确认后/u : /both parties explicitly confirm/u);
    assert.match(html, language === "zh" ? /证据不足不等于没有做到/u : /Insufficient evidence does not mean the work failed/u);
  }
});

test("AI change suggestions do not become proven mismatch or automatic repair instructions", async () => {
  const html = await summary({item: item("changes_suggested")});
  assert.match(html, /Saved AI suggestion: changes, review needed/u);
  assert.match(html, /An AI suggestion alone does not establish a mismatch/u);
  assert.doesNotMatch(html, /Mismatch: rule/u);
});

test("unrelated criterion evidence, AI item and unknown reason cannot assign a false next actor", async () => {
  const wrongItem = {...item("changes_suggested"), criterionId: "another-requirement"};
  const html = await summary({item: wrongItem, evidence: [evidence("fail", "another-requirement")]});
  assert.match(html, /AI has not run/u);
  assert.match(html, /No rule result/u);
  assert.doesNotMatch(html, /Seller supplies a revision/u);
  const invalid = item("insufficient_evidence");
  invalid.evidenceNeed = {schema: "source-evidence-need-v1", reason: "guessed_from_model_prose", targetFiles: []} as unknown as ProofAssessmentItem["evidenceNeed"];
  const fallback = await summary({item: invalid});
  assert.match(fallback, /Buyer and seller/u);
  assert.match(fallback, /No conclusion is established/u);
});

test("manual interpretation remains buyer review and source results never imply visibility or acceptance", async () => {
  const html = await summary({item: item("insufficient_evidence", "manual_interpretation"), evidence: [evidence("needs_human")]});
  assert.match(html, /Rule evidence needs human review/u);
  assert.match(html, /An unestablished wording difference alone is not a repair demand/u);
  assert.match(html, /Source support does not prove visibility, execution or accepted delivery/u);
});

test("the human check records no accepted-delivery or payment claim", async () => {
  const html = await summary({item: item("supported"), evidence: [evidence("pass")], humanConfirmed: true}, "zh");
  assert.match(html, /本项人工核对已记录/u);
  assert.match(html, /验收和付款状态，请查看流程中的独立记录/u);
  assert.doesNotMatch(html, /<button|<input|<form\b/u);
});

function withSourceFinding(status: ProofAssessmentItem["status"], bound = true, basis = "declared_html_labels"): ProofAssessmentItem {
  return {...item("insufficient_evidence", "model_unresolved"), modelJudgment: {status: "insufficient_evidence", explanation: "Original model could not conclude", citations: []}, sourceFinding: {version: "source-finding-v1", status, basis, explanation: "Finite source evidence only", citations: [], files: ["contact.html"], ...(bound ? {scopeBinding: {proposalId: "p1", proposalDigest: "pd1", file: "contact.html", kind: "page"}} : {})}} as ProofAssessmentItem;
}

test("established source mismatch is visible and actionable even when the original AI was unknown", async () => {
  const html = await summary({item: withSourceFinding("changes_suggested")});
  assert.match(html, /Established mismatch: source differs/u);
  assert.match(html, /Unknown: insufficient original AI evidence/u);
  assert.match(html, /Seller supplies a revision; buyer reviews/u);
  assert.match(html, /Scope agreement does not mean the correction is complete/u);
});

test("source support survives original model uncertainty, while unagreed label scope asks both parties first", async () => {
  const html = await summary({item: withSourceFinding("supported", false, "locked_business_values")});
  assert.match(html, /Established: source meets the checked conditions/u);
  assert.match(html, /The checked source conditions have support/u);
  assert.doesNotMatch(html, /No conclusion is established/u);
  const unbound = await summary({item: withSourceFinding("changes_suggested", false)});
  assert.match(unbound, /Established mismatch: source differs/u);
  assert.match(unbound, /Buyer and seller/u);
  assert.match(unbound, /Do not request repairs on a guessed page/u);
  assert.doesNotMatch(unbound, /Seller supplies a revision/u);
});

test("positive source copy does not assume an original AI status or ask to repeat a recorded human check", async () => {
  for (const status of ["supported", "changes_suggested", "insufficient_evidence"] as const) for (const humanConfirmed of [false, true]) {
    const value = withSourceFinding("supported", false, "locked_business_values");
    value.modelJudgment!.status = status;
    const html = await summary({item: value, humanConfirmed});
    assert.match(html, /Established: source meets the checked conditions/u);
    assert.doesNotMatch(html, /original AI’s uncertainty does not erase/u);
    assert.match(html, status === "supported" ? /Original AI suggestion: support/u : status === "changes_suggested" ? /Original AI suggestion: changes/u : /Unknown: insufficient original AI evidence/u);
    if (humanConfirmed) {
      assert.match(html, /The human check for this requirement is recorded/u);
      assert.match(html, /separate records for delivery acceptance and payment status/u);
      assert.doesNotMatch(html, /The buyer reviews the complete requirement|Accepting the delivery still needs/u);
    } else {
      assert.match(html, /The buyer reviews the complete requirement/u);
      assert.doesNotMatch(html, /The human check for this requirement is recorded/u);
    }
  }
});

type Element = {type?: unknown; key?: unknown; props?: Record<string, unknown>};
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object" || !("props" in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props?.children)];
}
function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join("");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return value && typeof value === "object" && "props" in value ? text((value as Element).props?.children) : "";
}
const quote = {id: "synthetic-noodle-project", proof: {criteria: [criterion], delivery: {id: "delivery-v2"}}} as unknown as ProofQuote;
const candidates: ScopeTargetCandidate[] = [{target: {kind: "page", file: "contact.html"}, label: "contact.html"}, {target: {kind: "form", file: "contact.html", formId: "enquiry"}, label: "contact.html #enquiry"}, {target: {kind: "page", file: "menu.html"}, label: "menu.html"}];
function context(status: "none" | "pending" | "confirmed" | "unavailable", roles: ("buyer" | "seller")[] = [], extra: Record<string, unknown> = {}): ScopeContext {
  const latest = status === "none" ? undefined : {id: "proposal-1", digest: "proposal-digest", criterionId: criterion.id, criterionSource: criterion.source, basis: {deliveryId: "delivery-v2", deliveryDigest: "delivery-digest"}, target: candidates[0].target, proposedByRole: "buyer", proposedAt: "2026-11-06T12:00:00Z", basisNote: "Propose this scope only", confirmationMode: "authenticated-participants", confirmations: roles.map(role => ({role, at: "2026-11-06T12:01:00Z", basisNote: "Explicitly confirm target scope only"})), ...extra};
  return {states: [{criterionId: criterion.id, status, ...(latest ? {latest} : {})}], bindings: [], contextDigest: "scope-context", stamp: {proposalCount: latest ? 1 : 0, confirmationCounts: [roles.length]}} as ScopeContext;
}
async function view(overrides: Record<string, unknown> = {}) {
  const {ScopeClarificationView} = await components;
  const calls: unknown[] = [];
  const props = {quote, criterion, role: "buyer", language: "en", scopeContext: context("none"), candidates, draft: {file: "contact.html", formId: ""}, working: false, notice: "", id: "scope-unit", onPropose: async () => true, onConfirm: async () => true, onRecheck: (id: string) => calls.push(["recheck", id]), onChooseFile: (file: string) => calls.push(["file", file]), onChooseForm: (formId: string) => calls.push(["form", formId]), onSaveProposal: (target: unknown) => calls.push(["propose", target]), onSaveConfirmation: () => calls.push(["confirm"]), ...overrides};
  const tree = ScopeClarificationView(props);
  return {tree, calls, props, html: renderToStaticMarkup(createElement(ScopeClarificationView, props))};
}

test("file/form candidates produce no automatic authority or mutation, and proposal/confirmation are distinct", async () => {
  const first = await view();
  assert.deepEqual(first.calls, []);
  assert.match(first.html, /Unsaved selection: contact.html/u);
  assert.doesNotMatch(first.html, /<input|<textarea|type="submit"|SHA-256|CSS selector/u);
  const button = nodes(first.tree).find(node => node.type === "button" && text(node).startsWith("Propose this scope"))!;
  assert.equal(button.props!.disabled, false);
  (button.props!.onClick as () => void)();
  assert.deepEqual(first.calls, [["propose", candidates[0].target]]);
  const selected = await view({draft: {file: "contact.html", formId: "enquiry"}});
  const formButton = nodes(selected.tree).find(node => node.type === "button" && text(node).startsWith("Propose this scope"))!;
  (formButton.props!.onClick as () => void)();
  assert.deepEqual(selected.calls, [["propose", candidates[1].target]]);
});

test("one saved confirmation remains pending and only the current other actor has a confirm action", async () => {
  for (const role of ["buyer", "seller"] as const) {
    const result = await view({role, scopeContext: context("pending", ["buyer"])});
    assert.match(result.html, /Individual confirmations pending/u);
    const confirm = nodes(result.tree).find(node => node.type === "button" && (text(node).includes("agree to this scope") || text(node).includes("await the other party")))!;
    assert.equal(confirm.props!.disabled, role === "buyer");
    assert.doesNotMatch(result.html, /Return to this requirement and recheck/u);
    assert.deepEqual(result.calls, []);
    if (role === "seller") {(confirm.props!.onClick as () => void)(); assert.deepEqual(result.calls, [["confirm"]]);}
  }
});

test("a confirmed saved proposal and an unsaved changed choice are visibly separate; new proposal needs both confirmations", async () => {
  const result = await view({scopeContext: context("confirmed", ["buyer", "seller"]), draft: {file: "menu.html", formId: ""}});
  assert.match(result.html, /Current saved proposal/u);
  assert.match(result.html, /contact.html.*whole page/u);
  assert.match(result.html, /Unsaved selection: menu.html/u);
  assert.match(result.html, /both parties must confirm that proposal separately/u);
  const recheck = nodes(result.tree).find(node => node.type === "button" && text(node) === "Return to this requirement and recheck")!;
  assert.deepEqual(result.calls, []);
  (recheck.props!.onClick as () => void)();
  assert.deepEqual(result.calls, [["recheck", criterion.id]]);
});

test("only server-confirmed state exposes recheck, and carried scope does not pass replacement evidence", async () => {
  const noAuthority = await view({scopeContext: context("pending", ["buyer", "seller"])});
  assert.doesNotMatch(noAuthority.html, /Return to this requirement and recheck/u);
  const carried = await view({scopeContext: context("confirmed", ["buyer", "seller"], {basis: {deliveryId: "delivery-v1", deliveryDigest: "old-digest"}})});
  assert.match(carried.html, /Earlier evidence does not pass this version/u);
  assert.match(carried.html, /does not run AI, accept work or pay/u);
});

test("unavailable, unread, mismatched and empty candidates fail closed with concrete recovery", async () => {
  for (const scopeContext of [undefined, context("confirmed", ["buyer", "seller"], {criterionSource: "Another source"})]) {
    const result = await view({scopeContext, onReload: () => {}});
    assert.match(result.html, /Reload scope records/u);
    assert.doesNotMatch(result.html, /Return to this requirement and recheck|<select/u);
    assert.deepEqual(result.calls, []);
  }
  const empty = await view({candidates: [], draft: {file: "", formId: ""}});
  assert.match(empty.html, /seller should submit website files/u);
  assert.ok(nodes(empty.tree).filter(node => node.type === "button").every(node => node.props!.disabled));
});

test("a valid but unavailable old proposal permits an explicit fresh proposal for the same current target", async () => {
  const result = await view({scopeContext: context("unavailable", ["buyer"], {basis: {deliveryId: "delivery-v1", deliveryDigest: "old-digest"}})});
  assert.match(result.html, /Previous proposal record · unavailable for this version/u);
  assert.match(result.html, /propose scope again for each party to confirm/u);
  assert.doesNotMatch(result.html, /Return to this requirement and recheck|Buyer: agree to this scope/u);
  const propose = nodes(result.tree).find(node => node.type === "button" && text(node).startsWith("Propose this scope"))!;
  assert.equal(propose.props!.disabled, false);
  (propose.props!.onClick as () => void)();
  assert.deepEqual(result.calls, [["propose", candidates[0].target]]);
});

test("contradictory confirmation status or duplicate criterion contexts require reload, without granting recheck", async () => {
  const duplicate = context("confirmed", ["buyer", "seller"]);
  duplicate.states.push({...duplicate.states[0], status: "none", latest: undefined});
  for (const scopeContext of [context("confirmed", ["buyer"]), duplicate]) {
    const result = await view({scopeContext, onReload: () => {}});
    assert.match(result.html, /Reload scope records/u);
    assert.doesNotMatch(result.html, /Return to this requirement and recheck|<select/u);
  }
});

test("read-only and busy states do not permit changing or confirming scope; owner rehearsal is labelled", async () => {
  for (const language of ["zh", "en"] as const) for (const overrides of [{readOnly: true}, {working: true}]) {
    const result = await view({...overrides, language, scopeContext: context("pending", [], {confirmationMode: "owner-roleplay"})});
    assert.ok(nodes(result.tree).filter(node => node.type === "button").every(node => node.props!.disabled));
    assert.match(result.html, language === "zh" ? /不是两个独立参与者/u : /not confirmations by two independent participants/u);
    assert.deepEqual(result.calls, []);
  }
});

test("local editor identity resets across project, delivery, source, role and proposal instead of retaining async selection state", async () => {
  const {ScopeClarificationPanel} = await components;
  const {props} = await view();
  const key = (overrides: Record<string, unknown>) => ScopeClarificationPanel({...props, ...overrides}).key;
  const baseline = key({});
  for (const override of [{role: "seller"}, {quote: {...quote, id: "other-project"}}, {quote: {...quote, proof: {...quote.proof, delivery: {...quote.proof.delivery, id: "delivery-v3"}}}}, {criterion: {...criterion, source: "Another locked source"}}, {scopeContext: context("pending")}]) assert.notEqual(key(override), baseline);
});

const compoundPrice={...criterion,source:"菜单的牛肉面和Beef noodles标价必须为AUD18且营业时间必须为上午11点到晚上8点。"};
const completenessPolicy={schema:"requirement-completeness-v1",version:"bounded-original-zh-v1"}as const;
const businessSteps:ProofBusinessCheckStep[]=["牛肉面","Beef noodles"].map((label,index)=>({stepId:`step-${index}`,checkId:`price-${index}`,criterionId:compoundPrice.id,file:"menu.html",viewportWidth:375,source:{start:0,end:compoundPrice.source.length,excerpt:compoundPrice.source},expected:{kind:"item_price",label,currency:"AUD",amountMinor:1800}}));

test("incomplete whole-original guidance is keyed to the policy and pure check, not the raw AI or saved evidence-needed reason",async()=>{
 for(const reason of[undefined,"model_unresolved","no_citations","requirement_clarification"]as const)for(const status of["supported","changes_suggested","insufficient_evidence"]as const)for(const language of["zh","en"]as const){
  const value=withSourceFinding("supported",false,"locked_business_values");value.modelJudgment!.status=status;value.evidenceNeed=reason?{schema:"source-evidence-need-v1",reason,targetFiles:[]}:undefined;
  const before=structuredClone(value),html=await summary({criterion:compoundPrice,item:value,businessSteps,requirementCompletenessPolicy:completenessPolicy},language);
  assert.match(html,language==="zh"?/已核业务值有支持，整条要求仍待核对/u:/Checked business values have support; the whole requirement still needs review/u);
  assert.match(html,language==="zh"?/买卖双方/u:/Buyer and seller/u);assert.match(html,language==="zh"?/对照完整原文/u:/review the full wording/u);
  assert.doesNotMatch(html,language==="zh"?/已证实：源码符合已检查条件|卖家补证，买家核对/u:/Established: source meets the checked conditions|Seller provides evidence; buyer reviews/u);assert.deepEqual(value,before);
 }
});

test("incomplete guidance does not erase a recorded human check or supersede a real rule/source mismatch",async()=>{
 const positive=withSourceFinding("supported",false,"locked_business_values"),input={criterion:compoundPrice,item:positive,businessSteps,requirementCompletenessPolicy:completenessPolicy};
 const recorded=await summary({...input,humanConfirmed:true});assert.match(recorded,/The human check for this requirement is recorded|Buyer confirmed this requirement manually/u);assert.match(recorded,/whole requirement still needs review/u);
 const rule=await summary({...input,evidence:[evidence("fail")]});assert.match(rule,/Mismatch: rule check found a difference|Seller supplies a revision; buyer reviews/u);assert.doesNotMatch(rule,/Both parties should review the full wording/u);
 const negative=withSourceFinding("changes_suggested",false,"locked_business_values"),source=await summary({...input,item:negative});assert.match(source,/Established mismatch: source differs|Seller supplies a revision; buyer reviews/u);assert.doesNotMatch(source,/whole requirement still needs review/u);
});

test("whole-original presentation leaves unmarked legacy and complete price-only source facts under their original guidance",async()=>{
 const value=withSourceFinding("supported",false,"locked_business_values");
 for(const policy of[undefined,{schema:"requirement-completeness-v1",version:"future-v2"}]){const html=await summary({criterion:compoundPrice,item:value,businessSteps,requirementCompletenessPolicy:policy});assert.match(html,/Established: source meets the checked conditions/u);assert.doesNotMatch(html,/whole requirement still needs review/u);}
 const complete={...compoundPrice,source:"菜单的牛肉面和Beef noodles标价必须为AUD18。"},html=await summary({criterion:complete,item:value,businessSteps,requirementCompletenessPolicy:completenessPolicy});assert.match(html,/Established: source meets the checked conditions/u);assert.doesNotMatch(html,/whole requirement still needs review/u);
});

test("incomplete untyped whole requirements without source facts always ask both parties to check every condition, not guess a page or form",async()=>{
 const original={...criterion,source:"The page content must show the restaurant name and opening hours."};
 for(const reason of[undefined,...ASSESSMENT_EVIDENCE_NEED_REASONS])for(const raw of["supported","changes_suggested","insufficient_evidence"]as const)for(const language of["zh","en"]as const){
  const value={...item("insufficient_evidence",reason),modelJudgment:{status:raw,explanation:"Original raw wording retained.",citations:[]}},before=structuredClone(value);
  const html=await summary({criterion:original,item:value,businessSteps:[],requirementCompletenessPolicy:completenessPolicy},language);
  assert.match(html,language==="zh"?/整条要求仍待核对/u:/The whole requirement still needs review/u);assert.match(html,language==="zh"?/买卖双方/u:/Buyer and seller/u);assert.match(html,language==="zh"?/逐项明确检查方法与材料/u:/Agree how each condition will be checked/u);
  assert.doesNotMatch(html,/已核业务值有支持|已核源码子条件有支持|已证实：源码符合|Checked business values have support|Checked source subconditions have support|Established: source meets|whether it concerns one form|先确认本项对应哪个页面/u);assert.deepEqual(value,before);
 }
});

test("untyped incomplete guidance retains human and raw records, while actual negative evidence and old-policy guidance keep their existing priority",async()=>{
 const original={...criterion,source:"The page content must show the restaurant name and opening hours."},value=item("insufficient_evidence","requirement_clarification"),input={criterion:original,item:value,businessSteps:[],requirementCompletenessPolicy:completenessPolicy};
 const human=await summary({...input,humanConfirmed:true});assert.match(human,/The human check for this requirement is recorded/u);assert.match(human,/Agree how each condition will be checked/u);
 const failed=await summary({...input,evidence:[evidence("fail")]});assert.match(failed,/Seller supplies a revision; buyer reviews/u);assert.doesNotMatch(failed,/Agree how each condition will be checked/u);
 const negative=await summary({...input,item:withSourceFinding("changes_suggested")});assert.match(negative,/Seller supplies a revision; buyer reviews/u);assert.doesNotMatch(negative,/Agree how each condition will be checked/u);
 const legacy=await summary({...input,requirementCompletenessPolicy:undefined});assert.match(legacy,/whether it concerns one form/u);assert.doesNotMatch(legacy,/The whole requirement still needs review/u);
});
