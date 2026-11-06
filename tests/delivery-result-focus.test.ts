import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import type {ProofDelivery} from "../lib/contracts.ts";
import {deliveryOverview} from "../lib/delivery-overview.ts";
import {deliveryResultEnquiry,deliveryResultFocus,deliveryResultInspection,deliveryResultRecords,deliveryResultStatus,type DeliveryResultInput,type DeliveryResultTarget} from "../lib/delivery-result-focus.ts";

function input():DeliveryResultInput{
  const delivery:ProofDelivery={id:"current",sequence:2,variant:"upload",label:"Synthetic",submittedAt:"2026-11-06T00:00:00.000Z",evidence:[{id:"e",criterionId:"page",finding:"pass",file:"index.html",excerpt:"Synthetic",explanation:"Rule supports the saved page"}],assessment:{id:"a",deliveryId:"current",mode:"live",model:"synthetic-no-provider-call",method:"source-ai-v1",assessedAt:"2026-11-06T00:00:00.000Z",items:[{criterionId:"page",status:"supported",explanation:"Synthetic",citations:[],ruleEvidenceIds:[]}],risks:[],limitations:[],coverage:{includedFiles:[],omittedFiles:[],truncatedFiles:[]}}};
  return {delivery,overview:deliveryOverview({delivery,criteria:[{id:"page",title:"Agreed page",source:"Deliver the agreed page."}],review:{deliveryId:"current",reviewedAt:"2026-11-06T00:00:00.000Z",mode:"demo",summary:"Synthetic"},manualChecks:[]}),model:{state:"none",acceptance:"not_accepted"},layout:{state:"current",measured:2,total:2,overflow:0,unavailable:0},language:"en"};
}
function business():NonNullable<DeliveryResultInput["business"]>{return{reportId:"b",groups:[],checkCount:1,observations:2,issues:2,unavailable:0,matching:0};}
function model(outcome:"compatible"|"violated"|"inconclusive"="violated"):DeliveryResultInput["model"]{return {state:"ready",acceptance:"not_accepted",diagnosis:{schema:"model-diagnosis-v1",reportId:"m",deliveryId:"current",deliveryDigest:"a".repeat(64),journeyPlanDigest:"b".repeat(64),modelSpecDigest:"c".repeat(64),outcome,reason:"Synthetic",summary:{zh:"并发观察有差异",en:"Concurrent observations differ"},findings:[{id:"f",severity:outcome==="inconclusive"?"unknown":"issue",title:{zh:"账目差异",en:"Ledger difference"},expected:{zh:"约定",en:"Agreed"},actual:{zh:"实际",en:"Actual"},impact:{zh:"影响",en:"Impact"},retest:{zh:"复测",en:"Retest"},operationIds:[]}],alternatives:[],retest:[],coverage:{observations:24,plannedObservations:24,syntheticWrites:0}}};}

test("one deterministic result keeps rule failure above AI and model suggestions without changing evidence",()=>{
  const value=input();value.overview.rows[0].rule="fail";value.overview.ruleFailures=1;value.overview.rows[0].ai!.status="changes_suggested";value.model=model();value.business=business();const before=structuredClone(value);
  const focus=deliveryResultFocus(value);assert.equal(focus.reason,"rule_failure");assert.equal(focus.target,"criterion");assert.equal(focus.criterionId,"page");assert.equal(focus.key,"Agreed page");assert.deepEqual(value,before);
});

test("marked source publications change attribution but not counts, inspection identity or rule priority",()=>{
 for(const schema of["source-publication-v1","source-publication-v2"]as const){
 const value=input(),item=value.delivery.assessment!.items[0];item.status="changes_suggested";item.publicationBasis={schema,reason:"locked_price_mismatch"};
 value.overview=deliveryOverview({delivery:value.delivery,criteria:value.overview.rows.map(row=>row.criterion),review:{deliveryId:"current",reviewedAt:"2026-11-06T00:00:00Z",mode:"demo",summary:"Synthetic"},manualChecks:[]});
 const before=structuredClone(value);assert.equal(deliveryResultFocus(value).reason,"ai_change");assert.equal(deliveryResultFocus(value).criterionId,"page");assert.match(deliveryResultFocus(value).title,/System source checks published/u);
 assert.match(deliveryResultStatus(value).find(row=>row.id==="ai")!.text,/Published findings \(including source checks\): 1 needing changes, 0 insufficient/u);assert.deepEqual(value,before);
 delete item.publicationBasis;assert.match(deliveryResultFocus(value).title,/AI suggests changes/u);assert.match(deliveryResultStatus(value).find(row=>row.id==="ai")!.text,/^AI: 1 change suggestions/u);assert.equal(value.overview.aiChanges,1);
 item.publicationBasis={schema,reason:"locked_price_mismatch"};value.overview.rows[0].rule="fail";value.overview.ruleFailures=1;assert.equal(deliveryResultFocus(value).reason,"rule_failure");
 }
});

test("an unknown future publication schema is not presented as system source authority",()=>{
 const value=input(),item=value.delivery.assessment!.items[0];item.status="changes_suggested";item.publicationBasis={schema:"source-publication-future",reason:"locked_price_mismatch"}as never;
 value.overview=deliveryOverview({delivery:value.delivery,criteria:value.overview.rows.map(row=>row.criterion),review:{deliveryId:"current",reviewedAt:"2026-11-06T00:00:00Z",mode:"demo",summary:"Synthetic"},manualChecks:[]});const before=structuredClone(value);
 assert.match(deliveryResultFocus(value).title,/AI suggests changes/u);assert.match(deliveryResultStatus(value).find(row=>row.id==="ai")!.text,/^AI: 1 change suggestions/u);assert.deepEqual(value,before);
});
test("every independent attention layer resolves a matching key and inspect target",()=>{
  const cases:[string,string,(v:DeliveryResultInput)=>void][]=[
    ["rules_missing","criterion",v=>{v.overview.reviewCurrent=false;}],
    ["model_checking","model",v=>{v.model={state:"checking",acceptance:"not_accepted"};}],
    ["model_invalid","model",v=>{v.model={state:"invalid",acceptance:"not_accepted"};}],
    ["model_attention","model",v=>{v.model=model();}],
    ["business_invalid","business",v=>{v.delivery.businessChecks={} as ProofDelivery["businessChecks"];}],
    ["journey_unknown","journey",v=>{v.delivery.journeyPlan={} as ProofDelivery["journeyPlan"];}],
    ["runtime_unknown","runtime",v=>{v.delivery.runtimeReport={deliveryId:"old"} as ProofDelivery["runtimeReport"];}],
    ["journey_difference","journey",v=>{v.journey={summary:{issues:1,unavailable:2}};}],
    ["runtime_difference","runtime",v=>{v.runtime={issues:1,unavailable:2};}],
    ["business_difference","business",v=>{v.business=business();}],
    ["layout_overflow","layout",v=>{v.layout={state:"current",measured:2,total:2,overflow:1,unavailable:0,firstIssue:{file:"index.html",width:375,kind:"overflow",overflowPx:70}};}],
    ["ai_change","criterion",v=>{v.overview.rows[0].ai!.status="changes_suggested";}],
    ["human_pending","criterion",v=>{v.overview.rows[0].humanPending=true;}],
    ["rule_unknown","criterion",v=>{v.overview.rows[0].rule="unreviewed";}],
    ["journey_unavailable","journey",v=>{v.journey={summary:{issues:0,unavailable:1}};}],
    ["runtime_unavailable","runtime",v=>{v.runtime={issues:0,unavailable:1};}],
    ["business_unavailable","business",v=>{v.business={...business(),issues:0,unavailable:2};}],
    ["layout_unknown","layout",v=>{v.layout={state:"stale"};}],
    ["ai_insufficient","criterion",v=>{v.overview.rows[0].ai!.status="insufficient_evidence";v.overview.rows[0].humanConfirmed=true;}],
    ["saved","criterion",()=>{}],
  ];
  for(const language of["en","zh"]as const)for(const[reason,target,change]of cases){const value=input();value.language=language;change(value);const focus=deliveryResultFocus(value);assert.equal(focus.reason,reason);assert.equal(focus.target,target);assert.ok(focus.title.length>0&&focus.key.length>0);}
});
test("retained expired records stay unfinished, foreign records never become running or current results",()=>{
  const value=input();
  for(const key of["transferCompetitionRun","modelRun","journeyRun","runtimeRun"]as const)value.delivery[key]={id:key,deliveryId:"current",expiresAt:"2000-01-01T00:00:00.000Z"} as never;
  assert.deepEqual(deliveryResultRecords(value.delivery).unfinished,["transfer","model","journey","runtime"]);
  assert.equal(deliveryResultFocus(value).reason,"unfinished");assert.equal(deliveryResultFocus(value).target,"transfer");
  const statuses=deliveryResultStatus(value);assert.ok(statuses.some(row=>row.id==="transfer"&&row.text.includes("unfinished record")));assert.ok(statuses.some(row=>row.id==="runtime"&&row.text.includes("unfinished record")));assert.ok(!statuses.some(row=>/running|active worker/iu.test(row.text)));
  for(const key of["transferCompetitionRun","modelRun","journeyRun","runtimeRun"]as const)value.delivery[key]!.deliveryId="old";
  assert.deepEqual(deliveryResultRecords(value.delivery).unfinished,[]);assert.equal(deliveryResultFocus(value).reason,"foreign_record");assert.equal(deliveryResultStatus(value).filter(row=>row.id.endsWith("-foreign")).length,4);
});
test("each unfinished kind has its own matching bilingual key and target, including enquiries",()=>{
  const cases=[["transferCompetitionRun","transfer","Concurrent-rescheduling check","同时改期检查"],["modelRun","model","Concurrent-actions check","同时操作检查"],["journeyRun","journey","Booking-flow check","预约流程检查"],["runtimeRun","runtime","Booking-backend check","预约后台检查"],["enquiryRun","enquiry","Enquiry-backend check","咨询后台检查"]]as const;
  for(const[key,target,en,zh]of cases)for(const language of["en","zh"]as const){const value=input(),run={deliveryId:"current",expiresAt:"2000-01-01T00:00:00.000Z"};value.language=language;value.delivery[key]=run as never;const result=deliveryResultFocus(value);assert.equal(result.reason,"unfinished");assert.equal(result.target,target);assert.ok(result.key.includes(language==="en"?en:zh));assert.match(result.title,language==="en"?/unfinished/:/尚未完成/);assert.ok(deliveryResultStatus(value).some(row=>row.id===key.replace(/Run$/u,"").replace("transferCompetition","transfer")&&row.attention)||key==="modelRun");run.deliveryId="old";assert.equal(deliveryResultFocus(value).reason,"foreign_record");}
});
test("long key excerpts are explicitly bounded without rewriting the complete stored source",()=>{
  const value=input();value.business=business();value.business.groups=[{widths:[375],previousComparable:false,row:{current:{outcome:"mismatch"},step:{source:{excerpt:"😀".repeat(400)}}}}]as never;const before=structuredClone(value),result=deliveryResultFocus(value);assert.match(result.key,/excerpt; full text in evidence/);assert.ok(Array.from(result.key).length<230);assert.deepEqual(value,before);
});
test("the shared inspect dispatcher invokes only the selected current target on an explicit click",()=>{
  const calls:string[]=[],targets:DeliveryResultTarget[]=["criterion","model","business","journey","runtime","enquiry","transfer","layout","details"];
  const callbacks={criterion:(id:string)=>calls.push(`criterion:${id}`),...Object.fromEntries(targets.filter(value=>value!=="criterion").map(target=>[target,()=>calls.push(target)]))};
  for(const target of targets){const focus={reason:"synthetic",title:"Synthetic",key:"Synthetic",target,criterionId:"current-criterion"},before=calls.length,inspect=deliveryResultInspection(focus,callbacks);assert.equal(calls.length,before);assert.ok(inspect);inspect();assert.equal(calls.at(-1),target==="criterion"?"criterion:current-criterion":target);assert.equal(calls.length,before+1);if(target!=="criterion")assert.equal(deliveryResultInspection(focus,{criterion:callbacks.criterion}),undefined);}
  assert.equal(deliveryResultInspection({reason:"none",title:"",key:"",target:"criterion"},{criterion:callbacks.criterion}),undefined);
});
test("AI insufficiency is visible before human confirmation and separate layer units are never merged",()=>{
  const value=input();value.overview.aiInsufficient=3;value.overview.aiChanges=2;value.overview.humanRemaining=1;value.overview.humanConfirmed=0;value.business={...business(),unavailable:4};value.layout={state:"current",measured:1,total:3,overflow:1,unavailable:2};
  const statuses=deliveryResultStatus(value);assert.match(statuses.find(row=>row.id==="ai")!.text,/2 change suggestions, 3 insufficient-evidence/);assert.match(statuses.find(row=>row.id==="business")!.text,/2 mismatches, 4 uncertain \(2 width observations\)/);assert.match(statuses.find(row=>row.id==="layout")!.text,/1 overflow, 2 unavailable/);assert.match(statuses.find(row=>row.id==="human")!.text,/0\/0 confirmed/);assert.ok(!statuses.some(row=>/total issues|coverage percentage/iu.test(row.text)));
});
test("fresh unfinished records label earlier report counts as earlier instead of claiming new results",()=>{
  const value=input();value.delivery.runtimeRun={id:"r",deliveryId:"current",deliveryDigest:"a".repeat(64),targetId:"t",startedAt:"2026-11-06T00:00:00.000Z",expiresAt:"2026-11-06T00:00:01.000Z"};value.runtime={issues:2,unavailable:3};value.delivery.journeyRun={deliveryId:"current"} as ProofDelivery["journeyRun"];value.journey={summary:{issues:4,unavailable:5}};
  const statuses=deliveryResultStatus(value);assert.match(statuses.find(row=>row.id==="runtime")!.text,/unfinished record; previous report: 2 mismatched steps, 3 uncertain/);assert.match(statuses.find(row=>row.id==="journey")!.text,/unfinished record; previous report: 4 mismatches, 5 uncertain/);
});
test("supplemental findings retain independent mismatch and unknown counts, while stale catalogs expose no success",()=>{
  const value=input();value.delivery.supplementalCatalog={version:1,deliveryId:"current",deliveryDigest:"a".repeat(64),catalogDigest:"b".repeat(64),context:{artifactManifest:null},rows:[{ref:{family:"time-policy",id:"f",version:1,payloadSha256:"c".repeat(64),deliveryId:"current",deliveryDigest:"a".repeat(64)},planKey:"d".repeat(64),status:"complete",findings:[{outcome:"mismatch"},{outcome:"unknown"}] as never,summary:"Synthetic",scope:"Synthetic"}]};
  assert.match(deliveryResultStatus(value).find(row=>row.id==="time-policy")!.text,/1 mismatched findings, 1 unknown/);assert.equal(deliveryResultFocus(value).reason,"supplemental_attention");assert.equal(deliveryResultFocus(value).target,"details");
  value.delivery.supplementalCatalog.deliveryId="old";const rows=deliveryResultStatus(value);assert.ok(!rows.some(row=>row.id==="time-policy"));assert.match(rows.find(row=>row.id==="supplemental")!.text,/binding needs review/);
});
test("a completed real local enquiry report keeps failed and unknown steps visible after its run record clears",async()=>{
  const {enquiryFixture}=await import("./enquiry-fixture.ts"),fixture=await enquiryFixture("lost");
  try{
    const {quote,report}=await fixture.execute(),value=input();value.delivery=quote.proof.delivery!;value.overview=deliveryOverview({delivery:value.delivery,criteria:quote.proof.criteria,review:quote.proof.review,manualChecks:[]});const before=structuredClone(value.delivery);
    value.enquiry=deliveryResultEnquiry(value.delivery,quote.id);assert.equal(value.delivery.enquiryRun,undefined);assert.deepEqual(value.enquiry!.summary,{supported:0,mismatch:7,unknown:5});assert.equal(deliveryResultFocus(value).reason,"enquiry_difference");assert.equal(deliveryResultFocus(value).target,"enquiry");assert.match(deliveryResultStatus(value).find(row=>row.id==="enquiry")!.text,/7 mismatched steps, 5 unknown/);assert.deepEqual(value.delivery,before);
    assert.equal(deliveryResultEnquiry(value.delivery,"other-project"),undefined);
    for(const modify of[(d:ProofDelivery)=>{d.enquiryReport!.deliveryId="other";},(d:ProofDelivery)=>{d.enquiryReport!.deliveryDigest="f".repeat(64);},(d:ProofDelivery)=>{delete d.enquiryReport;},(d:ProofDelivery)=>{delete d.enquiryPlan;}]){const changed=structuredClone(value.delivery);modify(changed);const view={...value,delivery:changed,enquiry:deliveryResultEnquiry(changed,quote.id)};assert.equal(view.enquiry,undefined);assert.equal(deliveryResultFocus(view).reason,"enquiry_unknown");assert.ok(deliveryResultStatus(view).find(row=>row.id==="enquiry")!.attention);}
    assert.deepEqual(report,value.delivery.enquiryReport);
  }finally{fixture.sqlite.close();}
});

test("actual overview keeps one outer inspect button, all original diagnostics mounted, and frozen acceptance visible",async()=>{
  const root=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url),dir=await mkdtemp(path.join(tmpdir(),"pbp-result-ui-"));
  const url=(file:string)=>pathToFileURL(path.join(root,file)).href;
  try{
    const react=pathToFileURL(require.resolve("react")).href;
    await writeFile(path.join(dir,"children.mjs"),`import {createElement} from ${JSON.stringify(react)};export const seen=[];let model={state:'none',acceptance:'not_accepted'};export function setModel(value){model=value;}export function useModelDiagnosis(){return model;}function child(name,props){seen.push({name,props});return createElement('section',{'data-original-child':name},createElement('button',{type:'button',onClick:props.onInspect},name+' original inspect'));}export function ModelSpotlight(props){return child('model',props);}export function ModelDiagnosticComparison(props){return child('comparison',props);}export function BusinessSpotlight(props){return child('business',props);}export function RuntimeCoverageSummary(props){return child('coverage',props);}`);
    let output=ts.transpileModule(await readFile(path.join(root,"app/components/DeliveryOverview.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "../delivery-overview.css";','');
    for(const name of["react","react/jsx-runtime","lucide-react"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
    output=output.replace(/"@\/lib\/([^"\n]+)"/gu,(_,name:string)=>JSON.stringify(url(`lib/${name}.ts`)));
    for(const name of["BusinessSpotlight","RuntimeCoverageSummary","useModelDiagnosis","ModelSpotlight","ModelDiagnosticComparison"])output=output.replaceAll(JSON.stringify(`./${name}`),JSON.stringify("./children.mjs"));
    await writeFile(path.join(dir,"overview.mjs"),output);
    const {DeliveryOverview}=await import(pathToFileURL(path.join(dir,"overview.mjs")).href),children=await import(pathToFileURL(path.join(dir,"children.mjs")).href);
    const value=input();value.delivery.evidence[0].finding="fail";
    const inspect=()=>{},props={delivery:value.delivery,criteria:value.overview.rows.map(row=>row.criterion),review:{deliveryId:"current",mode:"demo",summary:"Synthetic",reviewedAt:"2026-11-06T00:00:00.000Z"},manualChecks:[],role:"buyer",onInspect:inspect,onOpenModel:inspect,onOpenLayout:inspect,onViewHistory:inspect};
    for(const language of["en","zh"]as const){
      const html=renderToStaticMarkup(createElement(DeliveryOverview,{...props,language})),start=html.indexOf('<details class="delivery-result-reports">');assert.ok(start>0);const outer=html.slice(0,start);
      assert.equal((outer.match(/<button\b/gu)??[]).length,1);assert.match(outer,/data-result-reason="rule_failure"/);assert.equal(outer.match(/<h3>(.*?)<\/h3>/u)![1],language==="en"?"Some delivery requirements are unmet":"有交付要求尚未符合");assert.ok(html.includes('data-original-child="model"'));assert.ok(html.includes('data-original-child="comparison"'));assert.ok(html.includes('delivery-overview-rows'));assert.ok(html.includes(language==="en"?"Version history":"版本对照"));assert.doesNotMatch(html,/<details[^>]*class="delivery-result-reports"[^>]*\bopen/u);assert.equal(children.seen.at(-2).props.onInspect,inspect);
      for(const acceptance of["accepted_report","supplemental","unavailable"]){children.setModel({...model(),acceptance});const accepted=renderToStaticMarkup(createElement(DeliveryOverview,{...props,language,stage:"accepted"})),visible=accepted.slice(0,accepted.indexOf('<details class="delivery-result-reports">'));assert.ok(visible.includes(language==="en"?"The buyer accepted this delivery":"买家已接受当前交付"));assert.ok(visible.includes(language==="en"?"originally frozen version":"当时冻结的版本"));assert.ok(visible.includes(acceptance==="accepted_report"?(language==="en"?"snapshot references":"快照引用"):acceptance==="supplemental"?(language==="en"?"report is supplemental":"属于补充检查"):(language==="en"?"could not be verified":"暂无法确认")));}
      const busy=renderToStaticMarkup(createElement(DeliveryOverview,{...props,language,busy:true}));assert.match(busy.slice(0,busy.indexOf('<details class="delivery-result-reports">')),/<button[^>]*disabled=""/u);children.setModel({state:"none",acceptance:"not_accepted"});
    }
    // Missing layer callbacks never make the suggested inspection an inert button.
    value.delivery.evidence[0].finding="pass";const noCallback=renderToStaticMarkup(createElement(DeliveryOverview,{...props,onOpenLayout:undefined,language:"en"}));assert.equal((noCallback.slice(0,noCallback.indexOf('<details class="delivery-result-reports">')).match(/<button\b/gu)??[]).length,0);
    // Exercise the actual mixed-report component, preserving the unmarked row's origin.
    for(const schema of["source-publication-v1","source-publication-v2"]as const)for(const language of["zh","en"]as const){
      const mixed=structuredClone(value.delivery),marked=mixed.assessment!.items[0];marked.status="changes_suggested";marked.publicationBasis={schema,reason:"locked_price_mismatch"};
      const other={id:"other",title:"Other requirement",source:"Check another original requirement."};mixed.assessment!.items.push({criterionId:"other",status:"insufficient_evidence",explanation:"Original unknown remains unknown.",citations:[],ruleEvidenceIds:[]});mixed.evidence.push({id:"other-e",criterionId:"other",finding:"pass",file:"index.html",excerpt:"Other source",explanation:"Rule evidence only"});
      const html=renderToStaticMarkup(createElement(DeliveryOverview,{...props,delivery:mixed,criteria:[...props.criteria,other],language}));
      assert.match(html,language==="zh"?/发布结论（含源码核验）：1 项需修改，1 项证据不足/u:/Published findings \(including source checks\): 1 needing changes, 1 insufficient/u);
      assert.match(html,language==="zh"?/系统源码核验发布：不符/u:/System source-check publication: mismatch/u);
      assert.match(html,language==="zh"?/AI 证据不足/u:/AI: insufficient evidence/u);
      delete marked.publicationBasis;const legacy=renderToStaticMarkup(createElement(DeliveryOverview,{...props,delivery:mixed,criteria:[...props.criteria,other],language}));
      assert.match(legacy,language==="zh"?/AI 建议修改/u:/AI change suggestions/u);assert.doesNotMatch(legacy,/Published findings \(including source checks\)|发布结论（含源码核验）/u);
      const previous=structuredClone(mixed);previous.id="earlier";previous.sequence=1;previous.submittedAt="2026-11-05T00:00:00.000Z";previous.assessment!.deliveryId=previous.id;previous.assessment!.items[0].publicationBasis={schema,reason:"locked_price_mismatch"};const before=structuredClone(previous);
      const historical=renderToStaticMarkup(createElement(DeliveryOverview,{...props,delivery:mixed,criteria:[...props.criteria,other],language,previousVersion:{delivery:previous,review:{...props.review,deliveryId:previous.id},feedback:[],archivedAt:"2026-11-05T00:01:00.000Z"}}));
      assert.match(historical,language==="zh"?/发布结论需修改/u:/Published findings needing changes/u);assert.deepEqual(previous,before);
    }
  }finally{await rm(dir,{recursive:true,force:true});}
});
