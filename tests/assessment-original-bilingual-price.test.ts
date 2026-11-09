import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import type {ProofAssessmentCitation,ProofAssessmentItem,ProofQuote} from "../lib/contracts.ts";
import {assessDelivery} from "../lib/delivery-assessment.ts";
import {createEvidenceExport,verifyEvidenceExport} from "../lib/evidence-export.ts";
import {summaryCoverageUnits} from "../lib/requirement-coverage.ts";
import {createUploadedDelivery,parseStaticProject} from "../lib/static-project.ts";

const badFiles: Record<string,string> = JSON.parse(await readFile(new URL("./fixtures/noodle-stage3-static-menu.json",import.meta.url),"utf8")).files;
const fixedFiles: Record<string,string> = {
  ...badFiles,
  "menu.html": badFiles["menu.html"].replace("AUD28.00","AUD18.00").replace("AUD 28","AUD 18"),
  "contact.html": badFiles["contact.html"].replace("<h1>Contact</h1>","<h1>Contact</h1><p>营业时间：上午11点到晚上8点。 Opening hours: 11 am to 8 pm.</p>"),
};
const summary = [
  "网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。",
  "菜单页同时展示中文「牛肉面」和英文「Beef noodles」，两种语言所示价格均为 AUD18。",
  "联系页展示营业时间为上午 11 点至晚上 8 点（11am–8pm）。",
  "首页、菜单页和联系页在手机上均可用，正文与导航可阅读及操作，无需横向滚动。",
].join("\n");
const menuId = "coverage-2";
const approvedAt = "2026-11-07T05:00:00.000Z";

function quote(files: Record<string,string>, source = summary, excludeMapping = false): ProofQuote {
  const title = "面馆网站交付演练", requiredPages = ["index.html","menu.html","contact.html"];
  const project = parseStaticProject({title,summary:source,amount:"1.00",requiredPages,manualRequirements:[],
    coverage:{version:2,sourceText:source,confirmed:true,decisions:summaryCoverageUnits(source,2).map(({id}) => id==="coverage-1"&&excludeMapping
      ? {id,disposition:"exclude",reason:"Unconfirmed page mapping."}
      : {id,disposition:"include"})}},"zh");
  const delivery = createUploadedDelivery(files,project.project,"zh",1);
  return {id:"fictional-noodle",reference:"PBP-TESTNOODLE",title,summary:source,brief:source,language:"zh",workflow:"proof-v1",status:"approved",
    aiMode:"demo",paymentMode:"demo",clientName:"Fictional buyer",currency:"AUD",hourlyRateCents:100,totalCents:100,lineItems:[],assumptions:[],questions:[],timelineDays:1,createdAt:approvedAt,
    proof:{demoRoleplay:true,project:project.project,criteria:project.criteria,delivery,paymentState:"unfunded",audit:[],
      review:{deliveryId:delivery.id,mode:"demo",reviewedAt:approvedAt,summary:"Controlled source test"},
      collaboration:{stage:"submitted",submission:{deliveryId:delivery.id,at:approvedAt,note:"Fictional fixture"},feedback:[]}}};
}

async function assess(agreement: ProofQuote, status: ProofAssessmentItem["status"], selection: "both"|"one"|"other" = "both") {
  const report = await assessDelivery(agreement,{DEEPSEEK_API_KEY:"local-intercept-no-network"},async (_url,init) => {
    const request = JSON.parse(String(init?.body)), packet = JSON.parse(request.messages[1].content);
    const entries = packet.citationCatalog.entries as (ProofAssessmentCitation & {id:string})[];
    const owners = entries.filter(entry=>entry.file==="menu.html"&&(/^<p><strong>牛肉面<\/strong> <span>(?:AUD|USD)[0-9.]+<\/span><\/p>$/u.test(entry.excerpt)
      || /^<div class="menu-item"><h3>Beef noodles<\/h3><p class="price">(?:AUD|USD) [0-9.]+<\/p><\/div>$/u.test(entry.excerpt)));
    const selected = selection==="other" ? entries.filter(entry=>entry.file==="contact.html").slice(0,1) : selection==="one" ? owners.slice(0,1) : owners;
    const items = agreement.proof.criteria.map(criterion => ({
      criterionId:criterion.id,status:criterion.id===menuId?status:"insufficient_evidence",
      explanation:"Fictional controlled response.",
      citations:Object.fromEntries(Array.from({length:6},(_,index)=>[`c${index+1}`,criterion.id===menuId ? selected[index]?.id??"" : ""])),
    }));
    return Response.json({choices:[{finish_reason:"tool_calls",message:{tool_calls:[{type:"function",function:{
      name:request.tools[0].function.name,arguments:JSON.stringify({catalogId:packet.citationCatalog.catalogId,items,risks:[],limitations:[]}),
    }}]}}]});
  });
  assert.equal(report.items.length,agreement.proof.criteria.length);
  return {report,item:report.items.find(item=>item.criterionId===menuId)!};
}

test("locked original replays same bilingual menu evidence before and after the exact price correction",async()=>{
  for(const [files,status,reason,price] of [
    [badFiles,"changes_suggested","locked_price_mismatch","AUD 28.00"],
    [fixedFiles,"supported","locked_price_match","AUD 18.00"],
  ] as const){
    const agreement = quote(files);
    const {report,item}=await assess(agreement,status);
    assert.equal(item.status,status);
    assert.equal(item.publicationBasis?.reason,reason);
    assert.equal(item.modelJudgment?.status,status);
    assert.equal(item.citations.length,2);
    assert.ok(item.citations.every(citation=>citation.file==="menu.html"));
    assert.match(item.explanation,new RegExp(`牛肉面.+${price.replace(".","\\.")}.*Beef noodles.+${price.replace(".","\\.")}`,"u"));
    assert.equal(agreement.proof.project!.businessChecks,undefined);
    assert.equal(agreement.proof.collaboration!.stage,"submitted");
    agreement.proof.delivery!.assessment=report;
    const exported=await createEvidenceExport(agreement);
    const verified=await verifyEvidenceExport(exported);
    assert.equal(verified.consistency,"consistent",JSON.stringify(verified.checks));
    delete exported.delivery.assessment!.items.find(entry=>entry.criterionId===menuId)!.publicationBasis;
    exported.delivery.assessment!.publicationPolicy!.reconciledCriterionIds=[];
    assert.equal((await verifyEvidenceExport(exported)).consistency,"inconsistent");
  }
});

test("bilingual original needs both owner quotes in its explicitly locked menu",async()=>{
  for (const [selection,reason] of [["one","field_relationship"],["other","page_citations"]] as const) {
    const {item}=await assess(quote(fixedFiles),"supported",selection);
    assert.equal(item.status,"insufficient_evidence");
    assert.equal(item.evidenceNeed?.reason,reason);
    assert.deepEqual(item.evidenceNeed?.targetFiles,["menu.html"]);
    assert.equal(item.publicationBasis,undefined);
    if(selection==="one")assert.match(item.explanation,/缺少 menu\.html 中 「Beef noodles」 的完整价格段/u);
  }
  const {item}=await assess(quote(fixedFiles,summary,true),"supported");
  assert.equal(item.status,"insufficient_evidence");
  assert.equal(item.evidenceNeed?.reason,"page_scope");
  assert.deepEqual(item.evidenceNeed?.targetFiles,[]);
  const duplicate = await assess(quote(fixedFiles,`${summary}\n${summary.split("\n")[1].replace("AUD18","AUD28")}`),"supported");
  assert.equal(duplicate.item.status,"insufficient_evidence");
  assert.equal(duplicate.item.evidenceNeed?.reason,"requirement_clarification");
});

test("wrong, hidden, duplicate, and cross-page prices cannot become whole-clause support",async()=>{
  const menu=fixedFiles["menu.html"];
  for (const files of [
    badFiles,
    {...fixedFiles,"menu.html":menu.replace("AUD 18","USD 18")},
    {...fixedFiles,"site.css":fixedFiles["site.css"]+".menu-item{display:none}"},
    {...fixedFiles,"menu.html":menu.replace("</body>","<p>Beef noodles AUD28</p></body>")},
    {...fixedFiles,"menu.html":menu.replace(/<div class="menu-item">.*?<\/div>/u,""),
      "contact.html":fixedFiles["contact.html"].replace("</body>","<p>Beef noodles AUD18</p></body>")},
  ]) {
    const {item}=await assess(quote(files),"supported");
    assert.equal(item.status,"insufficient_evidence");
    assert.equal(item.publicationBasis,undefined);
  }
  const {item}=await assess(quote(fixedFiles,summary.replace("均为 AUD18。","均为 AUD18。还须支持线上下单。")),"supported");
  assert.equal(item.status,"insufficient_evidence");
  assert.equal(item.publicationBasis,undefined);
});
