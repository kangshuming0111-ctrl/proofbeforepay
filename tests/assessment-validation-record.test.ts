import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
const root=new URL("../public/benchmarks/gap-closure-cycles-2026-11-04/",import.meta.url);
const read=async(file:string)=>JSON.parse(await readFile(new URL(file,root),"utf8"));
test("published validation counters are derived from complete saved outputs and retain separate repeated cohorts",async()=>{
 const summary=await read("summary.json");const files=new Set<string>();
 for(const row of summary.rows){
  assert.match(row.output,/^[a-z0-9][a-z0-9-]*\.json$/u);assert.ok(!files.has(row.output));files.add(row.output);
  const report=await read(row.output),s=report.summary.overall;
  assert.equal(report.mode,"live");assert.equal(report.accounting.stopReason,"all_projects_completed");
  assert.equal(row.projects,s.attemptedProjects);assert.equal(row.criteria,s.attemptedCriteria);
  assert.equal(row.raw,s.raw.statusAgreement.count);assert.equal(row.application,s.application.statusAgreement.count);
  assert.equal(row.falsePass,s.application.defectFalsePass.count);assert.equal(row.unresolvedDefects,s.application.defectConservativeUnknown.count);
  assert.equal(row.rejectedReports,s.applicationRejectedProjects);
  assert.equal(row.freezeSha256,report.freezeSha256);
 }
 const known=summary.rows.filter((row:{kind:string})=>row.kind==="known-regression");assert.equal(known.length,2);assert.equal(known[0].freezeSha256,known[1].freezeSha256);
 for(const review of Object.values(summary.semantic) as {file:string;answers:number;accepted:number;qualified:number;rejected:number}[]){
  const full=await read(review.file);assert.equal(review.answers,full.summary.wholeAnswers);assert.equal(review.accepted,full.summary.accepted);assert.equal(review.qualified,full.summary.qualified);assert.equal(review.rejected,full.summary.rejected);
  assert.equal(review.answers,review.accepted+review.qualified+review.rejected+(full.summary.uncertain??0));
 }
 // The original application errors stay public; new regression never erases them.
 const original=JSON.parse(await readFile(new URL("../public/benchmarks/five-cycles-2026-11-04/summary.json",import.meta.url),"utf8"));assert.equal(original.application.statusMatches,22);
});
