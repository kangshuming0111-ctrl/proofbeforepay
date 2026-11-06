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
import {hasTechnicalChecksState,initialTechnicalChecksDisclosure,integrationRequestHistoryPresent,readTechnicalApplicationHistory,technicalChecksDisclosure,technicalChecksFocusMatches,type TechnicalApplicationHistory} from "../app/components/technical-checks-state.ts";

const root=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const delivery=():ProofDelivery=>({id:"current-delivery",variant:"upload",label:"Synthetic delivery",submittedAt:"2026-11-06T00:00:00.000Z",evidence:[],files:{"index.html":"<p>Synthetic source</p>"}});
const catalog=(family?:"source-visibility"|"deployment-source"|"time-policy"):NonNullable<ProofDelivery["supplementalCatalog"]>=>({version:1,deliveryId:"current-delivery",deliveryDigest:"a".repeat(64),catalogDigest:"b".repeat(64),context:{artifactManifest:null},rows:family?[{ref:{family,id:"synthetic-report",version:1,payloadSha256:"c".repeat(64),deliveryId:"current-delivery",deliveryDigest:"a".repeat(64)},planKey:"d".repeat(64),status:"complete",findings:[],summary:"Synthetic navigation metadata",scope:"Presence is not a verified report verdict."}]:[]});

test("ordinary delivery and source-visibility-only evidence do not opt a buyer into backend tools",()=>{
  assert.equal(hasTechnicalChecksState(delivery()),false);
  for(const value of[catalog(),catalog("source-visibility")]){
    value.context.followupHeads=[{id:"synthetic-followup",version:1,payloadSha256:"e".repeat(64),status:"open"}];
    assert.equal(hasTechnicalChecksState({...delivery(),supplementalCatalog:value}),false);
  }
  // The model/enquiry panels remain independent; their presence does not turn
  // into an inferred booking plan or force this separate tool group open.
  assert.equal(hasTechnicalChecksState({...delivery(),modelReport:{} as ProofDelivery["modelReport"]}),false);
});
test("each retained booking setting, report and pending lease remains discoverable before a new read",()=>{
  // Navigation tests intentionally test presence, not whether these typed
  // records pass domain validation. This component cannot grant a verdict.
  for(const key of["journeyPlan","journeyRun","journeyReport","journeyPlanSuggestions","journeyPlanAdoption","journeyExplanation","journeyEvidenceReservation","transferCompetitionRun"]){
    const value={...delivery(),[key]:{syntheticPresenceOnly:true}} as ProofDelivery;
    assert.equal(hasTechnicalChecksState(value),true,key);
  }
  assert.equal(hasTechnicalChecksState({...delivery(),journeyHistory:[]}),false);
  assert.equal(hasTechnicalChecksState({...delivery(),journeyHistory:[{}] as ProofDelivery["journeyHistory"]}),true);
  for(const family of["deployment-source","time-policy"]as const)assert.equal(hasTechnicalChecksState({...delivery(),supplementalCatalog:catalog(family)}),true,family);
  const withManifest=catalog();withManifest.context.artifactManifest={id:"synthetic-manifest",manifestDigest:"f".repeat(64)};
  assert.equal(hasTechnicalChecksState({...delivery(),supplementalCatalog:withManifest}),true);
  assert.equal(hasTechnicalChecksState(delivery(),true),true);
});
test("collapsing after activation keeps children mounted; an arriving record does not undo an explicit collapse",()=>{
  let state=initialTechnicalChecksDisclosure(false);assert.deepEqual(state,{activated:false,open:false});
  state=technicalChecksDisclosure(state,{type:"toggle",open:true});assert.deepEqual(state,{activated:true,open:true});
  state=technicalChecksDisclosure(state,{type:"toggle",open:false});assert.deepEqual(state,{activated:true,open:false});
  state=technicalChecksDisclosure(state,{type:"needed"});assert.deepEqual(state,{activated:true,open:false});
  state=technicalChecksDisclosure(state,{type:"open"});assert.deepEqual(state,{activated:true,open:true});
  assert.deepEqual(technicalChecksDisclosure(initialTechnicalChecksDisclosure(false),{type:"needed"}),{activated:true,open:true});
  assert.deepEqual(initialTechnicalChecksDisclosure(false),{activated:false,open:false},"a separately keyed new delivery starts cold");
});
test("shortcut requests name the exact current delivery and a new valid intent",()=>{
  for(const kind of["journey","transfer"]as const)assert.equal(technicalChecksFocusMatches({kind,id:1,deliveryId:"current-delivery"},"current-delivery"),true);
  for(const request of[undefined,{kind:"journey" as const,id:1,deliveryId:"previous-delivery"},{kind:"journey" as const,id:0,deliveryId:"current-delivery"},{kind:"transfer" as const,id:NaN,deliveryId:"current-delivery"}])assert.equal(technicalChecksFocusMatches(request,"current-delivery"),false);
});
test("integration request history cannot be silently treated as empty when a read is malformed",()=>{
  assert.equal(integrationRequestHistoryPresent({requests:[]}),false);
  assert.equal(integrationRequestHistoryPresent({requests:[{status:"requested"}]}),true);
  for(const value of[null,[],{}, {requests:null},{requests:{length:0}}])assert.throws(()=>integrationRequestHistoryPresent(value));
});
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test("the up-front history probe issues one read and never retries or writes",async()=>{
  let calls=0;const values:TechnicalApplicationHistory[]=[];
  readTechnicalApplicationHistory(async()=>{calls++;return {requests:[{status:"requested"}]};},()=>true,value=>values.push(value));
  await flush();assert.equal(calls,1);assert.deepEqual(values,[{state:"known",hasRecords:true}]);
  values.length=0;
  readTechnicalApplicationHistory(async()=>{calls++;throw Error("Synthetic failure");},()=>true,value=>values.push(value));
  await flush();assert.equal(calls,2);assert.deepEqual(values,[{state:"unknown"}]);
  values.length=0;
  readTechnicalApplicationHistory(async()=>({}),()=>true,value=>values.push(value));await flush();assert.deepEqual(values,[{state:"unknown"}]);
});
test("old role/delivery responses and disposed probes cannot reveal tools or replace current status",async()=>{
  for(const reason of["identity changed","disposed"]){
    let resolve!:(value:unknown)=>void,isCurrent=true;const values:TechnicalApplicationHistory[]=[];
    const dispose=readTechnicalApplicationHistory(()=>new Promise(done=>{resolve=done;}),()=>isCurrent,value=>values.push(value));
    if(reason==="identity changed")isCurrent=false;else dispose();
    resolve({requests:[{status:"requested"}]});await flush();assert.deepEqual(values,[],reason);
  }
});

test("real bilingual wrapper renders no heavy children while cold, and exposes the generic stage tool before booking mapping",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"pbp-technical-disclosure-"));
  try{
    const url=(file:string)=>pathToFileURL(path.join(root,file)).href;
    const reactUrl=pathToFileURL(require.resolve("react")).href;
    await writeFile(path.join(dir,"journey-stub.mjs"),`import {createElement} from ${JSON.stringify(reactUrl)};export const seen=[];export function ProjectJourneyPanel(props){seen.push({id:props.quote.id,role:props.role,enabled:props.enabled});return createElement('details',{id:'project-journey'},createElement('summary',null,'Synthetic booking subtree'));}`);
    const compile=(source:string)=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const imports=(output:string)=>["react","react/jsx-runtime"].reduce((value,name)=>value.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href)),output);
    let stage=imports(compile(await readFile(path.join(root,"app/components/DeliveryStageEvidence.tsx"),"utf8")));
    stage=stage.replaceAll('"@/lib/delivery-stage-evidence"',JSON.stringify(url("lib/delivery-stage-evidence.ts")));
    await writeFile(path.join(dir,"stage.mjs"),stage);
    let output=imports(compile(await readFile(path.join(root,"app/components/TechnicalChecksPanel.tsx"),"utf8")));
    output=output.replace('import "../project-journey.css";','').replaceAll('"./ProjectJourneyPanel"','"./journey-stub.mjs"').replaceAll('"./DeliveryStageEvidence"','"./stage.mjs"').replaceAll('"./technical-checks-state"',JSON.stringify(url("app/components/technical-checks-state.ts")));
    await writeFile(path.join(dir,"panel.mjs"),output);
    const {TechnicalChecksPanel}=await import(pathToFileURL(path.join(dir,"panel.mjs")).href),stub=await import(pathToFileURL(path.join(dir,"journey-stub.mjs")).href);
    const props={quote:{id:"synthetic-project",proof:{delivery:delivery()}},role:"buyer",enabled:true,request:async()=>{throw Error("SSR must not run client effects");},onApply(){},onBusy(){},onDecision(){}};
    for(const language of["en","zh"]){
      const cold=renderToStaticMarkup(createElement(TechnicalChecksPanel,{...props,language}));
      assert.doesNotMatch(cold,/Synthetic booking subtree|type="file"/u);assert.ok(cold.includes(language==="en"?"ordinary website-file delivery":"普通网页文件交付可跳过"));
    }
    assert.equal(stub.seen.length,0);
    const existing={...props,quote:{...props.quote,proof:{delivery:{...delivery(),journeyPlan:{syntheticPresenceOnly:true}}}},language:"en"};
    const active=renderToStaticMarkup(createElement(TechnicalChecksPanel,existing));
    assert.equal(stub.seen.length,1);assert.match(active,/type="file"/u);assert.ok(active.indexOf("Check submission, storage, readback and test inbox separately")<active.indexOf("Synthetic booking subtree"));
    assert.deepEqual(stub.seen[0],{id:"synthetic-project",role:"buyer",enabled:true});
    // Seed only a valid disclosure state reached by the tested reducer. The
    // actual component must keep its children while the details are collapsed.
    const seeded=output.replace("useReducer(technicalChecksDisclosure, needed, initialTechnicalChecksDisclosure)","useReducer(technicalChecksDisclosure, needed, () => ({activated:true,open:false}))");assert.notEqual(seeded,output);
    await writeFile(path.join(dir,"closed-panel.mjs"),seeded);const {TechnicalChecksPanel:ClosedPanel}=await import(pathToFileURL(path.join(dir,"closed-panel.mjs")).href);
    const closed=renderToStaticMarkup(createElement(ClosedPanel,{...props,language:"en"}));
    assert.match(closed,/Synthetic booking subtree/u);assert.match(closed,/type="file"/u);assert.doesNotMatch(closed,/<details[^>]*id="technical-checks"[^>]*\bopen/u);
  }finally{await rm(dir,{recursive:true,force:true});}
});
