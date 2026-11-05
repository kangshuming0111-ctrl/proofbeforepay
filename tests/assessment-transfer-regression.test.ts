import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {validateProjectCorpus,projectQuote} from "../scripts/run-project-assessment-evaluation.ts";
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {ProviderError} from "../lib/providers.ts";
const corpus=validateProjectCorpus(JSON.parse(await readFile(new URL("../scripts/assessment-transfer-corpus-2026-11-04.json",import.meta.url),"utf8")));
const response=(items:unknown)=>async()=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({items,risks:[],limitations:["Offline controlled response; no runtime or payment checked."]})}}]}),{headers:{"Content-Type":"application/json"}});
const env={DEEPSEEK_API_KEY:"synthetic-offline-only"};
function sourceItems(id:string){const project=corpus.projects.find(p=>p.id===id)!,q=projectQuote(project);return{q,items:q.proof.criteria.map(c=>({criterionId:c.id,status:"supported",explanation:"Synthetic source quotation supports text only.",citations:[{file:"index.html",excerpt:project.files["index.html"].slice(0,50)}]}))};}

test("explicit published-policy text is recognized without promoting the neighbouring backend requirement",async()=>{
 const {q,items}=sourceItems("cedar-workshop-pages");
 items[1].citations=[{file:"no-sidebar.html",excerpt:"If you cancel at least two days before the workshop starts, your deposit is returned in full."}];
 const r=await assessDelivery(q,env,response(items));
 assert.equal(r.items[0].status,"insufficient_evidence");assert.equal(r.items[1].status,"supported");
});
test("an explicit Chinese display-hours directive is text evidence even without literal 营业时间 in its source",async()=>{
 const {q,items}=sourceItems("perch-florist-policies");
 items[0].citations=[{file:"policy.html",excerpt:"提前两天（含两天）取消，可退回全部订金。"}];
 items[1].citations=[{file:"policy.html",excerpt:"周二、周三、周四、周五、周六和周日，上午十点开门，下午六点关门；星期一不营业。"}];
 const r=await assessDelivery(q,env,response(items));assert.equal(r.items[0].status,"supported");assert.equal(r.items[1].status,"supported");
});
test("text directives cannot launder actual refunds, persistence or form interaction into source-only support",async()=>{
 for(const suffix of[" The website must automatically process a refund to the original card."," The enquiry must be saved in the backend."," The form must submit and send a confirmation email."]){
  const {q,items}=sourceItems("cedar-workshop-pages");q.proof.criteria[1].source+=suffix;
  const r=await assessDelivery(q,env,response(items));assert.equal(r.items[1].status,"insufficient_evidence");
 }
 const {q,items}=sourceItems("perch-florist-policies");q.proof.criteria[1].source+=" 页面还必须实际提交预约并写入后台。";
 assert.equal((await assessDelivery(q,env,response(items))).items[1].status,"insufficient_evidence");
});
test("a plausible but absent Chinese quotation still rejects the entire provider answer",async()=>{
 const {q,items}=sourceItems("perch-florist-policies");items[1].citations=[{file:"policy.html",excerpt:"星期二不营业。"}];
 await assert.rejects(()=>assessDelivery(q,env,response(items)),ProviderError);
});
