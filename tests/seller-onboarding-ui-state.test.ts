import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import path from "node:path";
import {tmpdir} from "node:os";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {buildSellerOnboardingFiles,checkSellerOnboarding,defaultSellerOnboardingConfig,ONBOARDING_SELECTOR_FIELDS} from "../lib/seller-onboarding.ts";
import {discoverSellerControls,type SellerControlDiscovery} from "../lib/seller-control-discovery.ts";
import {confirmedOnboardingCount,createSellerOnboardingState,decodeSellerOnboardingHtml,onboardingFieldValue,sellerOnboardingReducer,withOnboardingField,type SellerOnboardingState} from "../app/components/seller-onboarding-state.ts";
const root=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
const discovered=(sha256="a".repeat(64)):SellerControlDiscovery=>({schema:"pbp-seller-control-discovery-v1",source:{sha256,bytes:99},validDocument:true,fields:[{key:"create.partySize",state:"ambiguous",candidates:[{id:"party",selector:"#attendees",tagName:"input",label:"Number of guests",formLabel:"Make a reservation",source:{line:7,column:1,startOffset:24,endOffset:50},reasons:["label_match","form_context"]},{id:"alternate",selector:"#other-guests",tagName:"input",label:"Guest count",formLabel:"Another form",source:{line:9,column:1,startOffset:52,endOffset:99},reasons:["label_match"]}]},{key:"create.requestOperation",state:"missing",candidates:[],reason:"no_matching_control"}],limits:{networkRequests:0,scriptsExecuted:false,runtimeVerified:false,backendVerified:false,maxCandidatesPerField:8}});
function loaded(generation=1,sha256?:string){const state=sellerOnboardingReducer(createSellerOnboardingState(),{type:"file-start",generation});return sellerOnboardingReducer(state,{type:"file-ready",generation,filename:"same.html",html:"<input id=attendees>",discovery:discovered(sha256)});}
function confirm(state:SellerOnboardingState,id="party"){state=sellerOnboardingReducer(state,{type:"select",key:"create.partySize",candidateId:id});return sellerOnboardingReducer(state,{type:"confirm",key:"create.partySize",candidateId:id});}
function report(state:SellerOnboardingState){return sellerOnboardingReducer(state,{type:"report",generation:state.generation,revision:state.revision,report:checkSellerOnboarding(defaultSellerOnboardingConfig())});}
test("own HTML never silently adopts example selectors; an ambiguous suggestion needs selection and explicit confirmation",()=>{
 let state=loaded();assert.equal(onboardingFieldValue(state.config,"create.partySize"),"");assert.equal(confirmedOnboardingCount(state),0);
 state=sellerOnboardingReducer(state,{type:"confirm",key:"create.partySize",candidateId:"party"});assert.equal(confirmedOnboardingCount(state),0);
 state=sellerOnboardingReducer(state,{type:"select",key:"create.partySize",candidateId:"party"});assert.equal(onboardingFieldValue(state.config,"create.partySize"),"");
 state=sellerOnboardingReducer(state,{type:"confirm",key:"create.partySize",candidateId:"party"});assert.equal(onboardingFieldValue(state.config,"create.partySize"),"#attendees");assert.equal(confirmedOnboardingCount(state),1);
 state=sellerOnboardingReducer(state,{type:"confirm",key:"create.requestOperation",candidateId:"invented"});assert.equal(onboardingFieldValue(state.config,"create.requestOperation"),"");assert.equal(confirmedOnboardingCount(state),1);
});
test("choosing another candidate immediately revokes the old mapping, confirmation and report",()=>{
 let state=report(confirm(loaded()));assert.ok(state.report);
 state=sellerOnboardingReducer(state,{type:"select",key:"create.partySize",candidateId:"alternate"});assert.equal(state.report,undefined);assert.equal(confirmedOnboardingCount(state),0);assert.equal(onboardingFieldValue(state.config,"create.partySize"),"");
 state=sellerOnboardingReducer(state,{type:"confirm",key:"create.partySize",candidateId:"party"});assert.equal(confirmedOnboardingCount(state),0);
 state=sellerOnboardingReducer(state,{type:"confirm",key:"create.partySize",candidateId:"alternate"});assert.equal(onboardingFieldValue(state.config,"create.partySize"),"#other-guests");
});
test("a reselected file of the same name clears old conclusions before reading and ignores late old reads",()=>{
 let state=report(confirm(loaded()));state=sellerOnboardingReducer(state,{type:"file-start",generation:2});
 assert.equal(state.reading,true);assert.equal(state.report,undefined);assert.equal(state.discovery,undefined);assert.equal(state.html,undefined);assert.deepEqual(state.confirmed,{});assert.equal(onboardingFieldValue(state.config,"create.partySize"),"");
 const waiting=state;state=sellerOnboardingReducer(state,{type:"file-ready",generation:1,filename:"same.html",html:"old",discovery:discovered()});assert.equal(state,waiting);
 state=sellerOnboardingReducer(state,{type:"file-ready",generation:2,filename:"same.html",html:"changed",discovery:discovered("b".repeat(64))});assert.equal(state.filename,"same.html");assert.equal(state.html,"changed");assert.equal(confirmedOnboardingCount(state),0);
 const now=state;assert.equal(sellerOnboardingReducer(state,{type:"file-error",generation:1,message:"old error"}),now);
});
test("manual and metadata edits invalidate reports, while selector edits revoke that candidate confirmation",()=>{
 let state=report(confirm(loaded()));state=sellerOnboardingReducer(state,{type:"config",config:{...state.config,frontendRevision:"revision-2"}});assert.equal(state.report,undefined);assert.equal(confirmedOnboardingCount(state),1);
 state=report(state);state=sellerOnboardingReducer(state,{type:"config",config:withOnboardingField(state.config,"create.partySize","#manual")});assert.equal(state.report,undefined);assert.equal(confirmedOnboardingCount(state),0);assert.equal(state.selected["create.partySize"],undefined);
 state=sellerOnboardingReducer(state,{type:"example"});assert.equal(state.report,undefined);assert.equal(confirmedOnboardingCount(state),0);assert.equal(checkSellerOnboarding(state.config).configurationValid,true);
});
test("stale report cannot re-enable downloads after a file or configuration revision change",()=>{
 const original=confirm(loaded()),oldReport=checkSellerOnboarding(defaultSellerOnboardingConfig());
 let state=sellerOnboardingReducer(original,{type:"config",config:{...original.config,frontendRevision:"new"}});
 state=sellerOnboardingReducer(state,{type:"report",generation:original.generation,revision:original.revision,report:oldReport});assert.equal(state.report,undefined);
 state=sellerOnboardingReducer(state,{type:"file-start",generation:2});state=sellerOnboardingReducer(state,{type:"report",generation:original.generation,revision:original.revision,report:oldReport});assert.equal(state.report,undefined);
});
test("invalid documents cannot confirm even a malformed producer's partial candidate set",()=>{
 let state=loaded();state={...state,discovery:{...state.discovery!,validDocument:false,documentIssue:"html_depth_limit"}};assert.equal(confirmedOnboardingCount(confirm(state)),0);
});
test("local HTML decoding is fatal UTF-8, preserves Chinese labels and rejects NUL",()=>{
 const array=(bytes:Uint8Array)=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
 assert.equal(decodeSellerOnboardingHtml(array(new TextEncoder().encode("<label>人数</label>"))),"<label>人数</label>");
 assert.throws(()=>decodeSellerOnboardingHtml(array(new Uint8Array([0xc3,0x28]))));assert.throws(()=>decodeSellerOnboardingHtml(array(new Uint8Array([60,0,62]))));
});
test("rendered bilingual guide starts with local input, keeps advanced mapping collapsed and labels exports as preparation",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-onboarding-ui-"));
 try{
  const source=await readFile(path.join(root,"app/components/SellerDomAdapterGuide.tsx"),"utf8");
  let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  const file=(p:string)=>pathToFileURL(path.join(root,p)).href;
  output=output.replace('import "./seller-onboarding.css";','').replaceAll('"react"',JSON.stringify(pathToFileURL(require.resolve("react")).href)).replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href)).replaceAll('"@/lib/seller-onboarding"',JSON.stringify(file("lib/seller-onboarding.ts"))).replaceAll('"@/lib/seller-onboarding-kit"',JSON.stringify(file("lib/seller-onboarding-kit.ts"))).replaceAll('"@/lib/seller-control-discovery"',JSON.stringify(file("lib/seller-control-discovery.ts"))).replaceAll('"./seller-onboarding-state"',JSON.stringify(file("app/components/seller-onboarding-state.ts")));
  let stageOutput=ts.transpileModule(await readFile(path.join(root,"app/components/DeliveryStageEvidence.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  for(const name of["react","react/jsx-runtime"])stageOutput=stageOutput.replaceAll(JSON.stringify(name),JSON.stringify(pathToFileURL(require.resolve(name)).href));
  stageOutput=stageOutput.replaceAll('"@/lib/delivery-stage-evidence"',JSON.stringify(file("lib/delivery-stage-evidence.ts")));await writeFile(path.join(dir,"stage-ui.mjs"),stageOutput);
  output=output.replaceAll('"./DeliveryStageEvidence"','"./stage-ui.mjs"');
  const modulePath=path.join(dir,"guide.mjs");await writeFile(modulePath,output);const {SellerDomAdapterGuide}=await import(pathToFileURL(modulePath).href);
  for(const language of["en","zh"]){const html=renderToStaticMarkup(createElement(SellerDomAdapterGuide,{language}));assert.match(html,/type="file"/u);assert.doesNotMatch(html,/\[name=guests\]/u);assert.match(html,/<details class="seller-onboarding-advanced"><summary>/u);assert.doesNotMatch(html,/<details[^>]*\bopen/u);assert.ok(html.indexOf('type="file"')<html.indexOf("seller-onboarding-advanced"));}
  const english=renderToStaticMarkup(createElement(SellerDomAdapterGuide,{language:"en"}));assert.match(english,/Preparation files/u);assert.match(english,/Manual preparation works without HTML/u);assert.match(english,/no upload, scripts or URL requests/u);assert.doesNotMatch(english,/automatically connected|backend verified|booking-protocol\.md/u);assert.match(english,/Check submission, storage, readback and test inbox separately/u);assert.match(english,/No upload, code execution, model or payment call/u);
  // Seed only the reducer's initial state to inspect the real download step;
  // the production guide, dependency builder and download controls stay intact.
  const seeded=output.replace(/useReducer\(sellerOnboardingReducer, undefined, createSellerOnboardingState\)/u,'useReducer(sellerOnboardingReducer, undefined, () => { const config = defaultSellerOnboardingConfig(); return {...createSellerOnboardingState(), step: 2, config, report: checkSellerOnboarding(config)}; })')+`\nimport {defaultSellerOnboardingConfig} from ${JSON.stringify(file("lib/seller-onboarding.ts"))};\n`;
  assert.notEqual(seeded,output);
  const downloadPath=path.join(dir,"guide-downloads.mjs");await writeFile(downloadPath,seeded);const {SellerDomAdapterGuide:DownloadGuide}=await import(pathToFileURL(downloadPath).href);
  const downloads=renderToStaticMarkup(createElement(DownloadGuide,{language:"en"}));
  assert.match(downloads,/<button type="button">Download complete preparation kit \(ZIP\)<\/button>/u);assert.match(downloads,/Individual templates \(dependencies excluded\)/u);assert.match(downloads,/SDK, bridge and SHA-256 manifest/u);
  for(const name of["pbp-onboarding.json","pbp-connect.mjs","PBP-SETUP.md","pbp-protocol-checklist.md"])assert.ok(downloads.includes(`>${name}</button>`));
  assert.match(renderToStaticMarkup(createElement(DownloadGuide,{language:"zh"})),/下载完整接入准备包（ZIP）/u);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("replacement clears all example/manual mappings and synchronously removes an old document alert",()=>{
 for(const action of[{type:"example"} as const,{type:"config",config:withOnboardingField(createSellerOnboardingState().config,"result","#manual-result")} as const]){
  let state=sellerOnboardingReducer(loaded(),action);assert.ok(ONBOARDING_SELECTOR_FIELDS.some(key=>onboardingFieldValue(state.config,key)!==""));
  state={...state,discovery:{...state.discovery!,validDocument:false,documentIssue:"html_node_limit"},notice:"Previous error"};
  state=sellerOnboardingReducer(state,{type:"file-start",generation:2});assert.ok(ONBOARDING_SELECTOR_FIELDS.every(key=>onboardingFieldValue(state.config,key)===""));assert.equal(state.discovery,undefined);assert.equal(state.notice,"");assert.equal(state.report,undefined);
  state=sellerOnboardingReducer(state,{type:"file-error",generation:2,message:"New file encoding error"});assert.equal(state.discovery,undefined);assert.equal(state.notice,"New file encoding error");
 }
});
test("seller-owned HTML discovery requires all thirteen explicit confirmations before the real mapped preflight and four exports",async()=>{
 const html=await readFile(new URL("./fixtures/seller-onboarding-independent.html",import.meta.url),"utf8"),discovery=await discoverSellerControls(html);
 let state=sellerOnboardingReducer(createSellerOnboardingState(),{type:"file-start",generation:1});
 state=sellerOnboardingReducer(state,{type:"file-ready",generation:1,filename:"independent.html",html,discovery});
 assert.equal(confirmedOnboardingCount(state),0);assert.equal(checkSellerOnboarding(state.config,html).configurationValid,false);
 for(const field of discovery.fields){assert.equal(field.state,"candidate",field.key);const id=field.candidates[0].id;assert.equal(state.selected[field.key],id);assert.equal(onboardingFieldValue(state.config,field.key),"");state=sellerOnboardingReducer(state,{type:"confirm",key:field.key,candidateId:id});}
 assert.equal(confirmedOnboardingCount(state),13);assert.equal(state.config.forms.create.partySize,"#headcount");
 const preflight=checkSellerOnboarding(state.config,state.html);state=sellerOnboardingReducer(state,{type:"report",generation:state.generation,revision:state.revision,report:preflight});assert.equal(state.report?.staticMarkupReady,true);assert.equal(state.report?.runtimeVerified,false);assert.equal(state.report?.backendVerified,false);
 const files=buildSellerOnboardingFiles(state.config);assert.deepEqual(files.map(file=>file.name),["pbp-onboarding.json","pbp-connect.mjs","PBP-SETUP.md","pbp-protocol-checklist.md"]);assert.deepEqual(JSON.parse(files[0].content),state.config);assert.ok(files.every(file=>!file.content.includes(html)));
 state=sellerOnboardingReducer(state,{type:"file-start",generation:2});assert.equal(state.report,undefined);assert.equal(confirmedOnboardingCount(state),0);assert.ok(ONBOARDING_SELECTOR_FIELDS.every(key=>onboardingFieldValue(state.config,key)===""));
});

test("a unique candidate previews its evidence without mapping or confirmation; ambiguous controls stay unselected",()=>{
 const discovery=discovered();discovery.fields[0]={...discovery.fields[0],state:"candidate",candidates:discovery.fields[0].candidates.slice(0,1)};
 let state=sellerOnboardingReducer(report(confirm(loaded())),{type:"file-start",generation:2});
 state=sellerOnboardingReducer(state,{type:"file-ready",generation:2,filename:"same.html",html:"new source",discovery});
 assert.equal(state.selected["create.partySize"],"party");assert.equal(onboardingFieldValue(state.config,"create.partySize"),"");assert.equal(confirmedOnboardingCount(state),0);assert.equal(state.report,undefined);
 state=sellerOnboardingReducer(state,{type:"confirm",key:"create.partySize",candidateId:"party"});assert.equal(onboardingFieldValue(state.config,"create.partySize"),"#attendees");assert.equal(confirmedOnboardingCount(state),1);
 const ambiguous=loaded();assert.equal(ambiguous.selected["create.partySize"],undefined);assert.equal(onboardingFieldValue(ambiguous.config,"create.partySize"),"");assert.equal(confirmedOnboardingCount(ambiguous),0);
});
