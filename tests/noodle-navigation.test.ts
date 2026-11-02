import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { parseStaticProject, createUploadedDelivery } from "../lib/static-project.ts";
import { summaryCoverageUnits } from "../lib/requirement-coverage.ts";
import { getBrowserCheckPlan } from "../lib/browser-check-report.ts";
import type { ProofQuote } from "../lib/contracts.ts";

test("the bundled bilingual restaurant delivery preserves original requirements and exposes the wrong language destination", async () => {
  const root=new URL("./fixtures/noodle-navigation/",import.meta.url);
  const spec=JSON.parse(await readFile(new URL("project.json",root),"utf8"));
  const units=summaryCoverageUnits(spec.summary);
  const parsed=parseStaticProject({...spec,coverage:{version:1,sourceText:spec.summary,confirmed:true,decisions:units.map((unit,index)=>({id:unit.id,disposition:index===units.length-1?"exclude":"include",...(index===units.length-1?{reason:"This milestone only checks static navigation; booking and email are not delivered."}:{})}))}},"zh",{requireCoverage:true});
  assert.equal(parsed.project.coverage!.decisions.filter(row=>row.disposition==="include").length,4);
  assert.equal(parsed.project.coverage!.decisions.at(-1)!.disposition,"exclude");
  const names=["index.html","menu-en.html","menu-zh.html","visit.html","site.css"];
  const deliveries=await Promise.all(["v1","v2"].map(async variant=>createUploadedDelivery(Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(new URL(`${variant}/${name}`,root),"utf8")]))),parsed.project,"zh",variant==="v1"?1:2)));
  assert.deepEqual(deliveries[0].evidence.filter(row=>row.finding==="fail").map(row=>row.criterionId),["link-2"]);
  assert.equal(deliveries[1].evidence.filter(row=>row.finding==="fail").length,0);
  assert.deepEqual(deliveries[1].evidence.filter(row=>row.finding==="needs_human").map(row=>row.criterionId),["mobile","coverage-1","coverage-2","coverage-3","coverage-4"]);
  const plan=getBrowserCheckPlan({id:"fixture",proof:{project:parsed.project,criteria:parsed.criteria,delivery:deliveries[1]}} as ProofQuote);
  assert.equal(plan.length,14);
  assert.equal(plan.filter(row=>row.kind==="page").length,8);
  assert.equal(plan.filter(row=>row.kind==="link").length,6);
});
