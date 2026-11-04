import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import type {ProofQuote,ProofAssessmentCitation} from "../lib/contracts.ts";
import {sourceVisibilityPlan,createSourceVisibilityReport,validateVisibilityReadings,validateStoredVisibilityReport,type SourceVisibilityReading,type SourceVisibilityPlan} from "../lib/source-visibility.ts";
import {SOURCE_VISIBILITY_INSERT} from "../lib/source-visibility-sql.ts";
const html='<!doctype html><html><head><title>Fictional hours</title><style>.old {display:none}</style></head><body><nav class="old"><span>Old hours 10–18</span></nav><main><p>New hours 11–20 &amp; weekends</p></main></body></html>';
const cite=(source:string,excerpt:string,file="index.html"):ProofAssessmentCitation=>({file,start:source.indexOf(excerpt),end:source.indexOf(excerpt)+excerpt.length,excerpt});
function fixture(source=html,citations=[cite(source,"<span>Old hours 10–18</span>"),cite(source,"<p>New hours 11–20 &amp; weekends</p>")],files:Record<string,string>={"index.html":source}):ProofQuote{
 return{id:"fictional-project",proof:{delivery:{id:"delivery-current",variant:"upload",files,assessment:{id:"assessment-current",deliveryId:"delivery-current",items:[{criterionId:"hours",citations:[citations[1]].filter(Boolean)}],risks:[{citations:[citations[0]].filter(Boolean)}]}}}}as unknown as ProofQuote;
}
function readings(plan:SourceVisibilityPlan):SourceVisibilityReading[]{return plan.citations.flatMap(c=>([375,1280]as const).map(w=>({citationId:c.id,viewportWidth:w,state:c.target?"visible"as const:"unavailable"as const,...(!c.target?{reason:"unsupported_target"as const}:{})})));}
test("exact full source text nodes map to stable paths and decoded DOM text; references remain AI-source references",async()=>{
 const quote=fixture(),before=structuredClone(quote),plan=await sourceVisibilityPlan(quote);
 assert.deepEqual(plan.widths,[375,1280]);assert.equal(plan.citations.length,2);assert.equal(plan.citations[0].target?.value,"New hours 11–20 & weekends");assert.deepEqual(plan.citations[0].target?.path,[1,0]);assert.deepEqual(plan.citations[0].target?.tags,["main","p"]);assert.equal(plan.citations[1].target?.value,"Old hours 10–18");assert.deepEqual(plan.citations[1].references,["risk:0"]);assert.deepEqual(quote,before);
});
test("partial words, cross-node quotations, attributes, CSS, scripts and inert template content never become observed text",async()=>{
 for(const [source,excerpt]of [["<body><p>Hours Monday Friday</p></body>","Monday"],["<body><p>Hours <b>Monday</b> Friday</p></body>","<p>Hours <b>Monday</b> Friday</p>"],["<body><p title=\"Monday\">Other hours</p></body>",'title="Monday"'],["<body><script>Monday</script></body>","<script>Monday</script>"],["<body><template><p>Monday</p></template></body>","<p>Monday</p>"]]){
  const plan=await sourceVisibilityPlan(fixture(source,[cite(source,excerpt)]));assert.equal(plan.citations[0].target,undefined,excerpt);
 }
 const plan=await sourceVisibilityPlan(fixture("<body>Hours</body>",[cite("p{color:red}","color:red","style.css")],{"index.html":"<body>Hours</body>","style.css":"p{color:red}"}));assert.equal(plan.citations[0].unsupported,"non_html_source");
});
test("same decoded or whitespace-normalized text at multiple locations remains manual, while separate unique nodes can be mapped",async()=>{
 for(const source of ['<body><p>Hours 11–20</p><p>Hours 11–20</p></body>','<body><p>Hours 11–20</p><p>Hours  11–20</p></body>']){const plan=await sourceVisibilityPlan(fixture(source,[cite(source,'<p>Hours 11–20</p>')]));assert.equal(plan.citations[0].unsupported,"repeated_text");}
});
test("source citations are exact UTF16 offsets; stale assessment identity and invented excerpt are refused",async()=>{
 const q=fixture();q.proof.delivery!.assessment!.risks[0].citations[0].excerpt="Invented";await assert.rejects(sourceVisibilityPlan(q),/differs/);
 const old=fixture();old.proof.delivery!.assessment!.deliveryId="old";await assert.rejects(sourceVisibilityPlan(old),/current delivery/);
 const source="<body><p>🌷 Hours 11–20</p></body>",plan=await sourceVisibilityPlan(fixture(source,[cite(source,"<p>🌷 Hours 11–20</p>")]));assert.equal(plan.citations[0].target?.value,"🌷 Hours 11–20");
});
test("duplicate citations are one plan target with all reference links; the cap reports excluded citations explicitly",async()=>{
 const source="<body>"+Array.from({length:28},(_,i)=>`<p>Distinct hours ${i}</p>`).join("")+"</body>",q=fixture(source,[]),report=q.proof.delivery!.assessment!;
 report.items=[{criterionId:"hours",status:"supported",explanation:"Synthetic",ruleEvidenceIds:[],citations:Array.from({length:28},(_,i)=>cite(source,`<p>Distinct hours ${i}</p>`))}];report.risks=[{title:"Synthetic",explanation:"Synthetic",suggestion:"Inspect",citations:[report.items[0].citations[0]]}];const plan=await sourceVisibilityPlan(q);
 assert.equal(plan.citations.length,24);assert.equal(plan.omittedCitations,4);assert.deepEqual(plan.citations[0].references,["criterion:hours","risk:0"]);
});
test("complete exact-plan readings are mandatory; client URLs, target edits, forged supported state and mismatched reasons are rejected",async()=>{
 const q=fixture(),plan=await sourceVisibilityPlan(q),good=readings(plan);
 assert.equal(validateVisibilityReadings(plan,good).length,4);
 for(const value of [good.slice(1),[good[0],good[0],...good.slice(2)],good.map((r,i)=>i? r:{...r,viewportWidth:900}),good.map((r,i)=>i? r:{...r,url:"https://caller.example"}),good.map((r,i)=>i? r:{...r,state:"hidden"}),good.map((r,i)=>i? r:{...r,state:"hidden",reason:"load_failed"})])assert.throws(()=>validateVisibilityReadings(plan,value));
 const partial=await sourceVisibilityPlan(fixture(html,[cite(html,"Old hours")]));assert.throws(()=>validateVisibilityReadings(partial,readings(partial).map(r=>({...r,state:"visible"}))));
 await assert.rejects(createSourceVisibilityReport(q,"buyer",{deliveryId:plan.deliveryId,assessmentId:plan.assessmentId,previousReportId:null,readings:good,url:"https://caller.example"}),/unsupported/);
 await assert.rejects(createSourceVisibilityReport(q,"buyer",{deliveryId:"old",assessmentId:plan.assessmentId,previousReportId:null,readings:good}),/changed/);
});
test("saved supplemental reports rederive counts and retain role/version without modifying any original quote content",async()=>{
 const q=fixture(),before=structuredClone(q),plan=await sourceVisibilityPlan(q),values=readings(plan);values[2]={...values[2],state:"hidden",reason:"display_none"};
 const{report}=await createSourceVisibilityReport(q,"seller",{deliveryId:plan.deliveryId,assessmentId:plan.assessmentId,previousReportId:null,readings:values},{id:"retained",at:"2026-11-04T12:00:00.000Z"});
 assert.deepEqual(report.summary,{visible:3,hidden:1,ambiguous:0,unavailable:0});assert.equal(report.reportedByRole,"seller");assert.deepEqual(q,before);assert.deepEqual(validateStoredVisibilityReport(report),report);
 assert.throws(()=>validateStoredVisibilityReport({...report,summary:{...report.summary,visible:4}}),/disagree/);
 assert.throws(()=>validateStoredVisibilityReport({...report,plan:{...report.plan,deliveryId:"wrong"}}),/invalid/);
 const changed=structuredClone(report);changed.plan.citations[0].target!.value="Invented text";assert.throws(()=>validateStoredVisibilityReport(changed),/differs/);
 assert.equal("accepted"in report,false);assert.equal("payment"in report,false);
});
test("native SQLite append CAS admits one concurrent report even with equal timestamps and descending IDs; role/version/history caps are enforced",async()=>{
 const migration=await readFile(new URL("../drizzle/0009_source_visibility_reports.sql",import.meta.url),"utf8");
 const python=String.raw`import json,sqlite3,tempfile,os,concurrent.futures
p=json.loads(input());f=tempfile.NamedTemporaryFile(delete=False);f.close()
try:
 c=sqlite3.connect(f.name);c.executescript('CREATE TABLE quotes(id TEXT PRIMARY KEY,version INTEGER,owner_id TEXT,seller_id TEXT);'+p['migration']);c.execute("INSERT INTO quotes VALUES ('project',1,'buyer','seller')");c.commit();c.close()
 def insert(id,previous='',actor='buyer',version=1,limit=20):
  db=sqlite3.connect(f.name,timeout=10);r=db.execute(p['sql'],[id,'project','delivery','digest','assessment','{}','same-time','project',version,actor,actor,'project',limit,'project','delivery','assessment',previous]);db.commit();count=r.rowcount;db.close();return count
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex: first=list(ex.map(lambda id:insert(id),['zz-old','zz-other']))
 assert sorted(first)==[0,1],first
 c=sqlite3.connect(f.name);first_id=c.execute('SELECT id FROM source_visibility_reports').fetchone()[0];c.close()
 with concurrent.futures.ThreadPoolExecutor(max_workers=2)as ex: results=list(ex.map(lambda id:insert(id,'zz-old'),['aa-next','ab-next']))
 if first_id=='zz-old':assert sorted(results)==[0,1],results
 else:
  assert results==[0,0],results
  assert insert('aa-next',first_id)==1
 c=sqlite3.connect(f.name);latest=c.execute('SELECT id FROM source_visibility_reports ORDER BY rowid DESC LIMIT 1').fetchone()[0];c.close()
 assert insert('stale','zz-old')==0
 assert insert('outsider',latest,'outsider')==0
 assert insert('wrong-version',latest,'seller',2)==0
 assert insert('full',latest,'seller',1,2)==0
 assert insert('seller-next',latest,'seller')==1
 print(json.dumps({'concurrent':results,'roleGuard':True,'versionGuard':True,'historyGuard':True,'immutableRows':3}))
finally:os.unlink(f.name)
`;
 const result=spawnSync("/usr/bin/python3",["-c",python],{input:JSON.stringify({sql:SOURCE_VISIBILITY_INSERT,migration}),encoding:"utf8"});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).immutableRows,3);
});
