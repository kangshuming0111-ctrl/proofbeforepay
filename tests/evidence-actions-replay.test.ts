import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,writeFile,copyFile,mkdir,symlink,rm,access} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {evidenceReplayImplementationSnapshot,hashEvidenceReplay,stripEvidenceActionMetadata,verifyAdjustedCriteriaLineage,verifyWithheldRiskLineage,writeEvidenceReplay} from "../scripts/replay-evidence-actions-2026-11-06.mjs";
import {validateProjectCorpus} from "../scripts/run-project-assessment-evaluation.ts";

const root=fileURLToPath(new URL("..",import.meta.url));
const publicRoot=new URL("../public/benchmarks/citation-relations-2026-11-05/",import.meta.url);
const corpusFile="citation-relations-scope-corpus-2026-11-05.json";

test("only new action metadata is ignored; explanations, statuses and active risks stay observable",()=>{
 const original={items:[{criterionId:"coverage-1",status:"insufficient_evidence",explanation:"Original",citations:[],evidenceNeed:{schema:"source-evidence-need-v1",reason:"no_citations",targetFiles:[]}}],risks:[],limitations:["No execution"],withheldRisks:{schema:"future-test-only"}};
 const before=structuredClone(original),stripped=stripEvidenceActionMetadata(original);
 assert.deepEqual(original,before);assert.equal(Object.hasOwn(stripped.items[0],"evidenceNeed"),false);assert.equal(Object.hasOwn(stripped,"withheldRisks"),false);
 const changed=structuredClone(original);changed.items[0].explanation="Different";
 assert.notDeepEqual(stripEvidenceActionMetadata(changed),stripped);
 changed.items[0].explanation="Original";changed.items[0].status="supported";
 assert.notDeepEqual(stripEvidenceActionMetadata(changed),stripped);
});

test("quarantine audit requires original indexed risk contents and exact UTF-16 source lineage",()=>{
 const source="🙂<p>Tea AUD 18</p>",citation={file:"index.html",start:2,end:source.length,excerpt:source.slice(2)};
 const risk={title:"Original lead",explanation:"Original source concern.",suggestion:"Inspect the original owner.",citations:[citation]};
 const adjustedCriteria=[{criterionId:"coverage-1",originalStatus:"supported",publishedStatus:"insufficient_evidence"}];
 const report={items:[{criterionId:"coverage-1",status:"insufficient_evidence",citations:[]}],risks:[],limitations:[],withheldRisks:{version:1,reason:"item_status_adjusted",adjustedCriteria,entries:[{originalRiskIndex:0,risk}]}};
 const lineage={adjustedCriteria,candidates:[{originalRiskIndex:0,risk:structuredClone(risk)}]},files={"index.html":source},criteria=[{id:"coverage-1"}];
 const audit=verifyWithheldRiskLineage(report,lineage,files,criteria,true);
 assert.equal(audit.lineageVerified,true);assert.equal(audit.expectedEntries,1);assert.equal(audit.expectedCitations,1);
 const changed=structuredClone(report);changed.withheldRisks.entries[0].risk.explanation="A rewritten lead";
 assert.throws(()=>verifyWithheldRiskLineage(changed,lineage,files,criteria,true));
 changed.withheldRisks.entries[0].risk.explanation=risk.explanation;changed.withheldRisks.entries[0].originalRiskIndex=1;
 assert.throws(()=>verifyWithheldRiskLineage(changed,lineage,files,criteria,true));
 const incomplete={...report,withheldRisks:undefined};
 assert.throws(()=>verifyWithheldRiskLineage(incomplete,lineage,files,criteria,true));
});

test("all original wire status differences are checked even when no risks exist",()=>{
 const criteria=[{id:"coverage-1"},{id:"coverage-2"}],wire=[{criterionId:"coverage-2",status:"changes_suggested"},{criterionId:"coverage-1",status:"supported"}];
 const adjustedCriteria=[{criterionId:"coverage-1",originalStatus:"supported",publishedStatus:"insufficient_evidence"},{criterionId:"coverage-2",originalStatus:"changes_suggested",publishedStatus:"insufficient_evidence"}];
 const report={items:criteria.map(({id})=>({criterionId:id,status:"insufficient_evidence"})),risks:[],withheldRisks:{version:1,reason:"item_status_adjusted",adjustedCriteria,entries:[]}};
 const checked=verifyAdjustedCriteriaLineage(wire,criteria,report,true);
 assert.equal(checked.allAgreedCriteriaCompared,true);assert.equal(checked.ledgerVerified,true);assert.deepEqual(checked.adjustedCriteria,adjustedCriteria);
 for(const bad of[adjustedCriteria.slice(0,1),[...adjustedCriteria].reverse(),[{...adjustedCriteria[0],originalStatus:"changes_suggested"},adjustedCriteria[1]]]){
  assert.throws(()=>verifyAdjustedCriteriaLineage(wire,criteria,{...report,withheldRisks:{...report.withheldRisks,adjustedCriteria:bad}},true));
 }
 assert.throws(()=>verifyAdjustedCriteriaLineage(wire,criteria,{...report,withheldRisks:undefined},true));
 assert.throws(()=>verifyAdjustedCriteriaLineage([wire[0],wire[0]],criteria,report,true));
 const unchanged={items:criteria.map((criterion,index)=>({criterionId:criterion.id,status:adjustedCriteria[index].originalStatus})),risks:[]};
 assert.equal(verifyAdjustedCriteriaLineage(wire,criteria,unchanged,true).ledgerVerified,true);
});

test("new no-adjustment reports explicitly record not_withheld without removing active risks",()=>{
 const citation={file:"index.html",start:0,end:11,excerpt:"<p>Home</p>"},risk={title:"Original lead",explanation:"Needs human review.",suggestion:"Inspect source.",citations:[citation]};
 const metadata={version:1,reason:"not_withheld",adjustedCriteria:[],entries:[]};
 const report={items:[{criterionId:"coverage-1",status:"supported",citations:[citation]}],risks:[risk],limitations:[],withheldRisks:metadata};
 const lineage={adjustedCriteria:[],candidates:[]},files={"index.html":"<p>Home</p>"},criteria=[{id:"coverage-1"}],before=structuredClone(report);
 const audit=verifyWithheldRiskLineage(report,lineage,files,criteria,true);
 assert.equal(audit.disposition,"not_withheld");assert.equal(audit.lineageVerified,true);assert.deepEqual(report,before);
 assert.throws(()=>verifyWithheldRiskLineage({...report,withheldRisks:undefined},lineage,files,criteria,true));
 assert.throws(()=>verifyWithheldRiskLineage({...report,withheldRisks:{...metadata,reason:"item_status_adjusted"}},lineage,files,criteria,true));
 assert.throws(()=>verifyWithheldRiskLineage({...report,withheldRisks:{...metadata,entries:[{originalRiskIndex:0,risk}]}},lineage,files,criteria,true));
 const adjusted=[{criterionId:"coverage-1",originalStatus:"supported",publishedStatus:"insufficient_evidence"}],emptyRiskReport={...report,items:[{...report.items[0],status:"insufficient_evidence"}],risks:[],withheldRisks:{...metadata,reason:"item_status_adjusted",adjustedCriteria:adjusted}};
 assert.equal(verifyWithheldRiskLineage(emptyRiskReport,{adjustedCriteria:adjusted,candidates:[]},files,criteria,true).disposition,"item_status_adjusted");
});

test("retained replay remains runnable in an exported tree with public fixtures and no ignored outputs",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-exported-evidence-replay-"));
 try{
  const closure=(await evidenceReplayImplementationSnapshot(root)).map(row=>row.file);
  for(const file of closure){assert.ok(!file.split("/").includes("outputs"));const destination=path.join(dir,file);await mkdir(path.dirname(destination),{recursive:true});await copyFile(path.join(root,file),destination);}
  await symlink(path.join(root,"node_modules"),path.join(dir,"node_modules"),"dir");
  const fixtureRoot=path.join(dir,"public-fixtures");await mkdir(fixtureRoot);
  for(const file of[corpusFile,"cycle-15-scope-live.json","cycle-15-scope-freeze.json"])await copyFile(new URL(file,publicRoot),path.join(fixtureRoot,file));
  const original=JSON.parse(await readFile(new URL("final-publication-replay.json",publicRoot),"utf8"));
  const rows=original.rows.filter((row:{group:string})=>row.group==="scope");
  const baseline=path.join(fixtureRoot,"derived-scope-only-baseline.json");
  await writeFile(baseline,JSON.stringify({...original,rows,projects:rows.length,criteria:6,fixtureNote:"Nonmutating subset of tracked public reports for an exported-tree regression test."}));
  const manifest=path.join(fixtureRoot,"manifest.json"),output=path.join(dir,"replay-result.json");
  await writeFile(manifest,JSON.stringify({schema:"pbp-evidence-actions-replay-inputs-v1",groups:[{label:"scope",corpus:path.join(fixtureRoot,corpusFile),live:path.join(fixtureRoot,"cycle-15-scope-live.json"),freeze:path.join(fixtureRoot,"cycle-15-scope-freeze.json")}] }));
  await assert.rejects(access(path.join(dir,"outputs")));
  const run=spawnSync(process.execPath,["--experimental-strip-types","scripts/replay-evidence-actions-2026-11-06.mjs","--manifest",manifest,"--baseline",baseline,"--output",output],{cwd:dir,encoding:"utf8",env:{PATH:process.env.PATH??"",NODE_ENV:"test"},timeout:120000});
  assert.equal(run.status,0,run.stdout+run.stderr);
  const report=JSON.parse(await readFile(output,"utf8"));
  assert.equal(report.projects,6);assert.equal(report.criteria,6);assert.equal(report.apiCalls,0);assert.equal(report.networkCalls,0);assert.equal(report.blockedNetworkAttempts,0);
  assert.ok(report.rows.every((row:{publishedFieldsUnchanged:boolean;acceptanceAndPaymentUnchanged:boolean})=>row.publishedFieldsUnchanged&&row.acceptanceAndPaymentUnchanged));
  assert.equal(report.runtimeClosureSha256.length,64);
  const retainedOutputHash=hashEvidenceReplay(await readFile(output));
  await assert.rejects(writeEvidenceReplay(output,{changed:true}),/EEXIST/u);
  assert.equal(hashEvidenceReplay(await readFile(output)),retainedOutputHash);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test("eight authored boundary sources and independent references stay frozen and are not customer samples",async()=>{
 const bytes=await readFile(new URL("../scripts/evidence-actions-boundary-corpus-2026-11-06.json",import.meta.url));
 const refs=JSON.parse(await readFile(new URL("../scripts/evidence-actions-boundary-references-2026-11-06.json",import.meta.url),"utf8"));
 const corpus=validateProjectCorpus(JSON.parse(bytes.toString("utf8")));
 assert.equal(hashEvidenceReplay(bytes),refs.corpusSha256);assert.equal(corpus.projects.length,8);assert.equal(refs.cases.length,8);
 assert.equal(refs.thirdPartyRepositories,0);assert.equal(refs.customerProjects,0);assert.equal(refs.frozenBeforeProviderInspection,true);
 for(const file of refs.files){const project=corpus.projects.find(row=>row.id===file.id)!;assert.equal(hashEvidenceReplay(project.files[file.file]),file.sha256);}
 // The partial-witness control intentionally differs from source truth. Do not
 // turn a conservative unknown into a correct source reference to inflate 8/8.
 const partial=refs.cases.find((row:{id:string})=>row.id==="evidence-actions-partial-owner-only");
 assert.equal(partial.sourceReferenceStatus,"supported");assert.equal(partial.expectedApplicationStatus,"insufficient_evidence");
});
