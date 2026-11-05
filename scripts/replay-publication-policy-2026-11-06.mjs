// Retained V3 provider bodies, current publication policy, zero model/network
// calls. A changed request is a failed replay, never a new model experiment.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstat,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT,ASSESSMENT_RISK_CITATION_LIMIT} from "../lib/assessment-limits.ts";
import {prepareProjectEvaluation,projectQuote,validateProjectCorpus} from "./run-project-assessment-evaluation.ts";

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const DEFAULT_INPUT=path.join(ROOT,"outputs/citation-relations-2026-11-05");
const hash=value=>createHash("sha256").update(value).digest("hex");
const object=value=>value!==null&&typeof value==="object"&&!Array.isArray(value);
const canonical=value=>JSON.stringify(value,(_key,entry)=>object(entry)?Object.fromEntries(Object.entries(entry).sort(([a],[b])=>a.localeCompare(b,"en"))):entry);
const same=(a,b)=>canonical(a)===canonical(b);
const quoteShape=citations=>citations.map(({file,start,end,excerpt})=>({file,start,end,excerpt}));
const statuses=application=>application?.accepted&&application.report?application.report.items.map(({criterionId,status})=>({criterionId,status})):null;

function verifyCitations(report,files,criteria){
 assert.ok(report&&Array.isArray(report.items)&&Array.isArray(report.risks)&&Array.isArray(report.limitations));
 assert.deepEqual(report.items.map(item=>item.criterionId),criteria.map(item=>item.id));
 let itemCitations=0,riskCitations=0;
 for(const [kind,maximum]of[["items",ASSESSMENT_ITEM_CITATION_LIMIT],["risks",ASSESSMENT_RISK_CITATION_LIMIT]]){
  for(const row of report[kind]){
   assert.ok(Array.isArray(row.citations)&&row.citations.length<=maximum);
   for(const citation of row.citations){
    assert.ok(Object.hasOwn(files,citation.file));
    assert.ok(Number.isSafeInteger(citation.start)&&Number.isSafeInteger(citation.end)&&citation.start>=0&&citation.end>citation.start&&citation.end<=files[citation.file].length);
    assert.equal(files[citation.file].slice(citation.start,citation.end),citation.excerpt);
    if(kind==="items")itemCitations++;else riskCitations++;
   }
  }
 }
 return{itemCitations,riskCitations,exactUtf16SourceSpans:true};
}

function changes(previous,current){
 if(!previous?.report||!current?.report)return{previousAdmitted:!!previous?.accepted,currentAdmitted:!!current?.accepted};
 const old=previous.report,next=current.report;
 return{
  itemExplanationChanges:next.items.filter((item,index)=>item.explanation!==old.items[index].explanation).map((item)=>({criterionId:item.criterionId,previous:old.items.find(x=>x.criterionId===item.criterionId).explanation,current:item.explanation})),
  itemCitationChanges:next.items.filter((item,index)=>!same(quoteShape(item.citations),quoteShape(old.items[index].citations))).map(item=>({criterionId:item.criterionId,previous:quoteShape(old.items.find(x=>x.criterionId===item.criterionId).citations),current:quoteShape(item.citations)})),
  risksChanged:!same(old.risks,next.risks),previousRiskCount:old.risks.length,currentRiskCount:next.risks.length,
  limitationsChanged:!same(old.limitations,next.limitations),previousLimitations:old.limitations,currentLimitations:next.limitations,
 };
}

async function readGroup(group){
 const [corpusBytes,liveBytes,freezeBytes]=await Promise.all([readFile(group.corpus),readFile(group.live),readFile(group.freeze)]);
 const corpus=validateProjectCorpus(JSON.parse(corpusBytes)),live=JSON.parse(liveBytes),frozen=JSON.parse(freezeBytes),corpusSha256=hash(corpusBytes);
 assert.equal(frozen.schema,"proofbeforepay-project-evaluation-freeze-v1");
 assert.equal(frozen.snapshotSha256,hash(canonical(frozen.snapshot)));
 assert.equal(live.freezeSha256,frozen.snapshotSha256);assert.ok(same(live.snapshot,frozen.snapshot));
 assert.equal(frozen.snapshot.corpusSha256,corpusSha256);assert.equal(frozen.snapshot.corpusEncoding,"exact-file-utf8");
 assert.equal(live.model,frozen.snapshot.model);
 assert.deepEqual(live.results.map(row=>row.id),corpus.projects.map(project=>project.id));
 assert.deepEqual(frozen.snapshot.projects.map(row=>row.id),corpus.projects.map(project=>project.id));
 for(const project of corpus.projects){
  const old=live.results.find(row=>row.id===project.id),source=frozen.snapshot.projects.find(row=>row.id===project.id);
  assert.ok(old.attempted&&old.networkAttempted&&old.raw?.bodyComplete&&old.raw.bodyByteCountIsComplete&&old.raw.utf8Valid&&typeof old.raw.bodyText==="string");
  assert.equal(hash(source.requestBody),source.plan.requestSha256);
  assert.deepEqual(source.files.map(row=>row.file).sort(),Object.keys(project.files).sort());
  for(const row of source.files)assert.equal(hash(project.files[row.file]),row.sha256);
  assert.equal(Buffer.byteLength(old.raw.bodyText),old.raw.bodyUtf8Bytes);
  assert.ok(same(JSON.parse(old.raw.bodyText),old.raw.providerBody));
 }
 return{label:group.label,paths:{corpus:group.corpus,live:group.live,freeze:group.freeze},corpus,live,frozen,corpusText:corpusBytes.toString("utf8"),hashes:{corpusSha256,liveSha256:hash(liveBytes),freezeFileSha256:hash(freezeBytes)}};
}

export async function replayPublicationPolicy(groups){
 const loaded=await Promise.all(groups.map(readGroup)),rows=[],currentImplementations=[];
 let interceptedRequests=0;
 for(const group of loaded){
  const prepared=await prepareProjectEvaluation(group.corpus,{corpusText:group.corpusText,env:{DEEPSEEK_MODEL:group.live.model}});
  currentImplementations.push({group:group.label,currentSnapshotSha256:prepared.snapshotSha256,currentImplementation:prepared.snapshot.implementation,
   unchangedOriginalRequestHashes:prepared.snapshot.projects.map(project=>({id:project.id,requestSha256:project.plan.requestSha256}))});
  for(const project of group.corpus.projects){
   const old=group.live.results.find(row=>row.id===project.id),original=group.frozen.snapshot.projects.find(row=>row.id===project.id);
   const currentPrepared=prepared.prepared.find(row=>row.project.id===project.id);
   const currentFrozen=prepared.snapshot.projects.find(row=>row.id===project.id);
   assert.equal(currentFrozen.quoteSha256,original.quoteSha256,"Current fixture quote differs from the original frozen quote.");
   assert.equal(currentPrepared.body,original.requestBody,"Current request bytes differ from the retained model request; replay cannot substitute a different prompt.");
   assert.equal(currentPrepared.plan.requestSha256,original.plan.requestSha256);
   const packet=JSON.parse(JSON.parse(original.requestBody).messages[1].content);assert.equal(packet.citationEncoding,"catalog_slots");
   assert.deepEqual(packet.criteria,project.criteria.map(({id,title,source})=>({id,title,source})));
   const quote=projectQuote(project),before=structuredClone(quote);
   let currentApplication,intercepts=0,requestSha256=null,invariantError;
   try{
    const report=await assessDelivery(quote,{DEEPSEEK_API_KEY:"controlled-offline-no-network-replay",DEEPSEEK_MODEL:group.live.model},async(url,init)=>{
     try{
      assert.equal(intercepts,0,"A replay attempted a second provider request.");intercepts++;interceptedRequests++;
      assert.equal(String(url),"https://api.deepseek.com/beta/chat/completions");assert.equal(init?.method,"POST");
      const body=String(init?.body??"");requestSha256=hash(body);assert.equal(requestSha256,original.plan.requestSha256);assert.equal(body,original.requestBody);
     }catch(error){invariantError=error;throw error;}
     return new Response(old.raw.bodyText,{status:old.raw.httpStatus,headers:{"Content-Type":"application/json"}});
    });
    currentApplication={accepted:true,report,error:null};
   }catch(error){
    currentApplication={accepted:false,report:null,error:error instanceof AssessmentResponseError?error.reason:"application_rejected_or_provider_failed",...(error instanceof AssessmentResponseError?{failureReason:error.reason}:{})};
   }
   if(invariantError)throw invariantError;
   assert.equal(intercepts,1);assert.deepEqual(quote,before,"Application replay mutated its quote.");
   assert.equal(currentApplication.accepted,old.application.accepted);
   assert.deepEqual(statuses(currentApplication),statuses(old.application),"Publication replay changed a criterion status.");
   if(!currentApplication.accepted)assert.equal(currentApplication.failureReason,old.application.failureReason);
   const oldCitationVerification=old.application.report?verifyCitations(old.application.report,project.files,packet.criteria):null;
   const currentCitationVerification=currentApplication.report?verifyCitations(currentApplication.report,project.files,packet.criteria):null;
   rows.push({group:group.label,id:project.id,originalLiveReportSha256:group.hashes.liveSha256,originalFreezeSha256:group.frozen.snapshotSha256,
    originalProviderBodySha256:hash(old.raw.bodyText),originalRequestSha256:original.plan.requestSha256,replayRequestSha256:requestSha256,
    originalSourceFiles:original.files,criterionCount:project.criteria.length,originalQuoteSha256:original.quoteSha256,currentQuoteSha256:currentFrozen.quoteSha256,quoteUnchanged:true,itemStatusesUnchanged:true,originalApplication:old.application,currentApplication,
    citationVerification:{original:oldCitationVerification,current:currentCitationVerification},publicationChanges:changes(old.application,currentApplication)});
  }
 }
 const harnessBytes=await readFile(fileURLToPath(import.meta.url));
 return{schema:"pbp-controlled-publication-policy-replay-v1",createdAt:new Date().toISOString(),mode:"controlled_application_replay",
  apiCalls:0,modelCalls:0,networkCalls:0,interceptedRequests,preparedRequestBodies:loaded.reduce((sum,group)=>sum+group.corpus.projects.length,0),projects:rows.length,criteria:rows.reduce((sum,row)=>sum+row.criterionCount,0),
  harness:{file:"scripts/replay-publication-policy-2026-11-06.mjs",sha256:hash(harnessBytes)},
  runtime:{node:process.version,platform:process.platform},inputs:loaded.map(group=>({group:group.label,...group.paths,...group.hashes})),
  currentImplementations,rows,
  limits:["Exact retained provider HTTP bodies and byte-identical original requests; no new model inference, prompt experiment or provider call.",
   "Current application output is separately labelled publication-policy replay. Original raw replies, original application reports, input corpora and frozen references were not changed.",
   "The input project quote and criterion statuses remained unchanged; current explanations, source citations, optional-risk publication and system notes are shown beside the original report.",
   "Exact quote provenance and status preservation do not establish semantic correctness, browser execution, customer acceptance or payment.",
   "Original invalid risk/structure responses must still fail closed. This harness does not remove or repair provider content to admit a report."]};
}

async function main(args){
 const flags=new Map();
 for(let i=0;i<args.length;i++){
  if(!["--output","--input-dir","--known-corpus","--repair-new-corpus","--scope-corpus"].includes(args[i])||flags.has(args[i])||!args[i+1]||args[i+1].startsWith("--"))throw new Error("Use --output /absolute/new.json with optional absolute --input-dir and three --*-corpus overrides.");
  flags.set(args[i],args[++i]);
 }
 const output=flags.get("--output"),input=flags.get("--input-dir")??DEFAULT_INPUT;
 if(!output||!path.isAbsolute(output)||!output.endsWith(".json")||!path.isAbsolute(input))throw new Error("Use an absolute new JSON output and absolute input directory.");
 try{await lstat(output);throw new Error("Output already exists; inputs and prior outputs will not be overwritten.");}catch(error){if(error.code!=="ENOENT")throw error;}
 const corpusPaths={known:flags.get("--known-corpus")??path.join(input,"cycle-13-known-corpus.json"),"repair-new":flags.get("--repair-new-corpus")??path.join(ROOT,"scripts/project-assessment-corpus-citation-relations-holdout.json"),scope:flags.get("--scope-corpus")??path.join(ROOT,"scripts/citation-relations-scope-corpus-2026-11-05.json")};
 const groups=["known","repair-new","scope"].map(label=>({label,corpus:corpusPaths[label],live:path.join(input,`cycle-15-${label}-live.json`),freeze:path.join(input,`cycle-15-${label}-freeze.json`)}));
 if(groups.some(group=>[group.corpus,group.live,group.freeze].some(value=>!path.isAbsolute(value)||!value.endsWith(".json"))))throw new Error("All corpus/live/freeze inputs must be absolute JSON paths.");
 const report=await replayPublicationPolicy(groups);
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
 console.log(JSON.stringify({output,mode:report.mode,apiCalls:0,networkCalls:0,projects:report.projects,criteria:report.criteria,interceptedRequests:report.interceptedRequests,itemStatusesUnchanged:true}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){main(process.argv.slice(2)).catch(()=>{console.error("Publication replay stopped. Check input/freeze hashes, unchanged request bytes, status invariants and a new output path. No provider request was sent; no input or prior output was overwritten.");process.exitCode=1;});}
