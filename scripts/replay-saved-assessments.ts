import {createHash} from "node:crypto";
import {lstat,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {projectQuote,validateProjectCorpus} from "./run-project-assessment-evaluation.ts";

const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
const canonical=(v:unknown):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==="object"&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b,"en"))):x);
async function load(file:string){const info=await lstat(file);if(!path.isAbsolute(file)||!info.isFile()||info.isSymbolicLink()||info.size>2*1024*1024)throw new Error("Use bounded absolute regular JSON inputs.");const source=await readFile(file,"utf8");return{source,value:JSON.parse(source)};}
/** Reprocess exact saved provider replies. This never asks the model again and
 * cannot be counted as additional projects, provider calls or held-out accuracy. */
export async function replaySavedAssessments(corpusFile:string,resultFile:string,freezeFile:string){
 const [c,r,f]=await Promise.all([load(corpusFile),load(resultFile),load(freezeFile)]),corpus=validateProjectCorpus(c.value),first=r.value,freeze=f.value;
 if(first.schema!=="proofbeforepay-project-evaluation-report-v1"||first.mode!=="live"||freeze.schema!=="proofbeforepay-project-evaluation-freeze-v1"||hash(canonical(freeze.snapshot))!==freeze.snapshotSha256||freeze.snapshot.corpusSha256!==hash(c.source)||first.freezeSha256!==freeze.snapshotSha256||canonical(first.snapshot)!==canonical(freeze.snapshot)||first.results.length!==corpus.projects.length)throw new Error("The saved first attempts, corpus and freeze differ.");
 const cases=[];
 for(const project of corpus.projects){
  const prior=first.results.find((v:{id:string})=>v.id===project.id),frozen=freeze.snapshot.projects.find((v:{id:string})=>v.id===project.id);
  if(!prior?.raw?.bodyComplete||!prior.raw.utf8Valid||typeof prior.raw.bodyText!=="string"||!frozen)throw new Error("A complete saved provider reply and frozen request are required.");
  let interceptions=0;
  const report=await assessDelivery(projectQuote(project),{DEEPSEEK_API_KEY:"offline-replay-placeholder",DEEPSEEK_MODEL:freeze.snapshot.model},async(url,init)=>{
   if(++interceptions!==1||String(url)!=="https://api.deepseek.com/chat/completions"||hash(String(init?.body))!==frozen.plan.requestSha256)throw new Error("The replay would use another request. No network request was made.");
   return new Response(prior.raw.bodyText,{status:prior.raw.httpStatus,headers:{"content-type":"application/json"}});
  });
  cases.push({id:project.id,storedProviderReplySha256:hash(prior.raw.bodyText),sourceRequestSha256:frozen.plan.requestSha256,firstApplication:prior.application,application:report,criteria:project.criteria.map(c=>({id:c.id,reference:c.reference.expectedStatus,first:prior.criteria.find((v:{id:string})=>v.id===c.id).applicationStatus,replayed:report.items.find(v=>v.criterionId===c.id)!.status}))});
 }
 const criteria=cases.flatMap(c=>c.criteria);
 return{schema:"pbp-saved-reply-replay-v1",kind:"known-case-application-replay",networkRequests:0,providerCalls:0,additionalIndependentProjects:0,storedReplies:cases.length,firstFreezeSha256:freeze.snapshotSha256,corpusSha256:hash(c.source),firstStatusAgreement:criteria.filter(c=>c.first===c.reference).length,replayedStatusAgreement:criteria.filter(c=>c.replayed===c.reference).length,criteria:criteria.length,cases,limits:["Exact saved provider replies and unchanged request bodies are reprocessed by the current application.","This measures an application correction on known cases, not current-model or customer accuracy.","Original first attempts, rejected/qualified whole answers and all earlier cohorts remain unchanged."]};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.length!==4||!args.every(path.isAbsolute))throw new Error("Use four absolute paths: corpus, first result, first freeze, new output.");
 const result=await replaySavedAssessments(args[0],args[1],args[2]);await writeFile(args[3],JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
 process.stdout.write(JSON.stringify({output:args[3],networkRequests:0,providerCalls:0,firstStatusAgreement:result.firstStatusAgreement,replayedStatusAgreement:result.replayedStatusAgreement,criteria:result.criteria})+"\n");
}
