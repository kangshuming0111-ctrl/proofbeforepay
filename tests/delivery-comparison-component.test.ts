import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {parseFragment} from "parse5";
import ts from "typescript";
import type {ProofAssessmentItem, ProofCriterion, ProofDelivery, ProofDeliveryVersion} from "../lib/contracts.ts";
import type {ComparisonSelection, DeliveryComparisonProps} from "../app/components/DeliveryComparison.tsx";
import {buildDeliveryComparison} from "../lib/delivery-comparison.ts";

// Compile the actual component as in plain-delivery-workspace.test.ts. Only the
// unrelated HTTP/business comparison children are omitted; no handlers run.
const component = (async () => {
  const source = await readFile(new URL("../app/components/DeliveryComparison.tsx",import.meta.url),"utf8");
  let output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText
    .replace(/import ["'][^"']+\.css["'];/gu,"")
    .replace('import { BusinessRevisionComparison } from "./BusinessRevisionComparison";',"const BusinessRevisionComparison=()=>null;")
    .replace('import { RuntimeComparison } from "./RuntimeComparison";',"const RuntimeComparison=()=>null;");
  for (const name of ["react","react/jsx-runtime","lucide-react"]) output=output.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
  output=output.replaceAll('"@/lib/delivery-comparison"',JSON.stringify(new URL("../lib/delivery-comparison.ts",import.meta.url).href));
  return await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`) as typeof import("../app/components/DeliveryComparison.tsx");
})();
const criteria:ProofCriterion[]=[{id:"page",title:"Page exists",source:"Deliver the page."},{id:"price",title:"Noodle price",source:"The noodles cost AUD 18."}];
const citation=(marker:string)=>({file:"menu.html",start:0,end:marker.length,excerpt:marker});
function item(prefix:string):ProofAssessmentItem {
  return {criterionId:"price",status:"changes_suggested",explanation:`${prefix}-published-explanation`,citations:[citation(`${prefix}-published-citation`)],ruleEvidenceIds:[],
    publicationBasis:{schema:"source-publication-v3",reason:"locked_price_mismatch"},
    modelJudgment:{status:"supported",explanation:`${prefix}-original-explanation`,citations:[citation(`${prefix}-original-citation`)]},
    sourceFinding:{version:"source-finding-v3",basis:"locked_business_values",status:"insufficient_evidence",explanation:`${prefix}-source-explanation`,citations:[citation(`${prefix}-source-citation`)],files:["menu.html"]}};
}
function delivery(id:string,sequence:number):ProofDelivery {
  return {id,sequence,label:`Synthetic ${id}`,variant:"upload",submittedAt:`2026-11-10T00:0${sequence}:00.000Z`,evidence:[],
    assessment:{id:`report-${id}`,deliveryId:id,method:"source-ai-v1",mode:"live",model:"synthetic-no-call",assessedAt:"2026-11-10T01:00:00.000Z",items:[item(id)],risks:[],limitations:[],coverage:{includedFiles:["menu.html"],omittedFiles:[],truncatedFiles:[]}}};
}
function fixture():DeliveryComparisonProps {
  const previousVersion:ProofDeliveryVersion={delivery:delivery("old",1),archivedAt:"2026-11-10T00:02:00.000Z",feedback:[{id:"feedback-1",deliveryId:"old",criterionId:"price",comment:"Please fix the price.",at:"2026-11-10T00:01:30.000Z"}]};
  return {delivery:delivery("current",2),criteria,previousVersion,language:"en"};
}
async function render(props=fixture()) {return renderToStaticMarkup(createElement((await component).DeliveryComparison,props));}
type Node={attrs?:{name:string;value:string}[];childNodes?:Node[];value?:string;nodeName?:string};
const descendants=(node:Node):Node[]=>[node,...(node.childNodes??[]).flatMap(descendants)];
const text=(node:Node):string=>node.value??(node.childNodes??[]).map(text).join(" ");
function layers(html:string,layer:string) {return descendants(parseFragment(html) as Node).filter(node=>node.attrs?.some(attr=>attr.name==="data-evidence-layer"&&attr.value===layer)).map(text);}

test("each version renders opposing published/model/source findings with only its own layer citations",async()=>{
  const props=fixture(),before=structuredClone(props),html=await render(props);
  for(const [layer,token,status] of [["published","published","Changes suggested"],["model","original","Evidence found"],["source","source","Insufficient evidence"]]) {
    const sections=layers(html,layer);assert.equal(sections.length,2);
    for(const [index,version] of ["old","current"].entries()) {
      const section=sections[index];assert.ok(section.includes(status));
      assert.ok(section.includes(`${version}-${token}-explanation`));assert.ok(section.includes(`${version}-${token}-citation`));
      for(const other of ["published","original","source"].filter(value=>value!==token))assert.ok(!section.includes(`${version}-${other}-citation`));
      assert.ok(!section.includes(`${version==="old"?"current":"old"}-${token}-citation`));
    }
  }
  assert.match(html,/Published result · source checks/u);assert.match(html,/locked item and price/u);
  assert.match(html,/not model accuracy or proof of a fix/u);assert.deepEqual(props,before);
});

test("each version retains its exact assessment report ID, independently of shared model names",async()=>{
  const props=fixture(),comparison=buildDeliveryComparison(props),row=comparison.rows.find(value=>value.criterion.id==="price")!;
  assert.equal(row.previous?.ai.state,"available");assert.equal(row.current.ai.state,"available");
  if(row.previous?.ai.state!=="available"||row.current.ai.state!=="available")assert.fail("Both independent saved reports must be available");
  assert.equal(row.previous.ai.data.reportId,"report-old");assert.equal(row.current.ai.data.reportId,"report-current");
  const nodes=descendants(parseFragment(await render(props)) as Node);
  const versions=nodes.filter(node=>node.attrs?.some(attr=>attr.name==="class"&&attr.value==="comparison-version"));
  assert.equal(versions.length,2);
  assert.match(text(versions[0]),/Report ID:.*report-old/u);assert.doesNotMatch(text(versions[0]),/report-current/u);
  assert.match(text(versions[1]),/Report ID:.*report-current/u);assert.doesNotMatch(text(versions[1]),/report-old/u);
});

test("accepted snapshot A remains named separately while current saved assessment B stays the comparison source",async()=>{
  const props=fixture();props.acceptance={snapshotId:"accepted-snapshot-A",assessmentId:"frozen-report-A"};
  props.delivery.assessment!.id="later-report-B";
  const before=structuredClone(props),html=await render(props),nodes=descendants(parseFragment(html) as Node);
  const notice=nodes.find(node=>node.attrs?.some(attr=>attr.name==="data-comparison-acceptance"));assert.ok(notice);
  assert.match(text(notice),/not the frozen acceptance record/u);assert.match(text(notice),/accepted-snapshot-A/u);assert.match(text(notice),/frozen-report-A/u);assert.doesNotMatch(text(notice),/later-report-B/u);
  const current=nodes.filter(node=>node.attrs?.some(attr=>attr.name==="class"&&attr.value==="comparison-version"))[1];
  assert.match(text(current),/later-report-B/u);assert.match(text(current),/current-published-explanation/u);assert.doesNotMatch(text(current),/frozen-report-A/u);
  assert.deepEqual(props,before);
});

test("an acceptance without an AI report says so even when a later comparison report exists",async()=>{
  const props=fixture();props.acceptance={snapshotId:"accepted-without-ai"};
  for(const language of ["en","zh"] as const){
    const html=await render({...props,language}),nodes=descendants(parseFragment(html) as Node);
    const notice=nodes.find(node=>node.attrs?.some(attr=>attr.name==="data-comparison-acceptance"));assert.ok(notice);
    assert.ok(text(notice).includes(language==="zh"?"当时没有 AI 报告":"No AI report existed then"));
    assert.doesNotMatch(text(notice),/report-current/u);assert.match(html,/report-current/u);
  }
});

test("old and current model names and source coverage remain bound to their own report",async()=>{
  const props=fixture(),old=props.previousVersion!.delivery.assessment!,current=props.delivery.assessment!;
  old.model="old-model-distinct";old.coverage={includedFiles:["old-full.html"],truncatedFiles:["old-partial.css"],omittedFiles:["old-image.png"]};old.limitations=["Old report boundary"];
  current.model="current-model-distinct";current.coverage={includedFiles:["current-full.html"],truncatedFiles:["current-partial.css"],omittedFiles:["current-image.png"]};current.limitations=["Current report boundary"];
  const nodes=descendants(parseFragment(await render(props)) as Node),versions=nodes.filter(node=>node.attrs?.some(attr=>attr.name==="class"&&attr.value==="comparison-version"));
  for(const [index,prefix] of ["old","current"].entries()){
    const content=text(versions[index]),other=prefix==="old"?"current":"old";
    for(const expected of [`${prefix}-model-distinct`,`${prefix}-full.html`,`${prefix}-partial.css`,`${prefix}-image.png`])assert.ok(content.includes(expected),expected);
    for(const excluded of [`${other}-model-distinct`,`${other}-full.html`,`${other}-partial.css`,`${other}-image.png`])assert.ok(!content.includes(excluded),excluded);
    assert.ok(content.includes(prefix==="old"?"Old report boundary":"Current report boundary"));
  }
});

test("absent original model and source finding are explicit and never filled from the published item",async()=>{
  const props=fixture();delete props.delivery.assessment!.items[0].modelJudgment;delete props.delivery.assessment!.items[0].sourceFinding;
  const html=await render(props),original=layers(html,"model")[1],source=layers(html,"source")[1];
  assert.match(original,/No original model judgment was separately saved/u);assert.doesNotMatch(original,/current-published|Changes suggested/u);
  assert.match(source,/No independent source finding was saved/u);assert.doesNotMatch(source,/current-published|Changes suggested/u);
  assert.ok(layers(html,"published")[1].includes("current-published-explanation"));
});

test("ordinary publication stays distinct and empty original citations do not borrow published citations",async()=>{
  const props=fixture(),saved=props.delivery.assessment!.items[0];delete saved.publicationBasis;saved.modelJudgment!.citations=[];
  const html=await render(props),published=layers(html,"published")[1],original=layers(html,"model")[1];
  assert.match(published,/Published result/u);assert.doesNotMatch(published,/source checks|Publication basis/u);
  assert.match(original,/No source citation was saved for this layer/u);assert.doesNotMatch(original,/current-published-citation/u);
});

test("SSR opens the exact previously requested criterion and marks only matching old-version feedback",async()=>{
  const props=fixture();props.feedback=[{id:"wrong",deliveryId:"current",criterionId:"page",comment:"Not old-version feedback",at:"2026-11-10T00:04:00.000Z"}];
  const html=await render(props),nodes=descendants(parseFragment(html) as Node),options=nodes.filter(node=>node.nodeName==="option");
  const chosen=options.filter(node=>node.attrs?.some(attr=>attr.name==="selected"));assert.equal(chosen.length,1);assert.match(text(chosen[0]),/Noodle price.*Changes requested last time/u);
  assert.doesNotMatch(text(options[0]),/Changes requested/u);assert.match(html,/Please fix the price/u);assert.doesNotMatch(html,/Not old-version feedback/u);
});

test("late history chooses feedback until a user chooses, and an explicit choice survives first arrival and reload",async()=>{
  const {selectedComparisonRow,reconcileComparisonSelection}=await component,props=fixture();
  const loading=buildDeliveryComparison({...props,previousVersion:undefined}).rows,ready=buildDeliveryComparison(props).rows;
  assert.equal(selectedComparisonRow(loading)?.criterion.id,"page");assert.equal(selectedComparisonRow(ready)?.criterion.id,"price");
  let choice:ComparisonSelection={deliveryId:"current",criterionId:"page"};
  choice=reconcileComparisonSelection(choice,"current","old");assert.equal(selectedComparisonRow(ready,choice.criterionId)?.criterion.id,"page");
  assert.equal(reconcileComparisonSelection(choice,"current",undefined),choice);
  assert.equal(reconcileComparisonSelection(choice,"current","old"),choice);
});

test("delivery pair changes reset explicit choices without resurrecting them, and missing criteria fall back to feedback",async()=>{
  const {selectedComparisonRow,reconcileComparisonSelection}=await component,rows=buildDeliveryComparison(fixture()).rows;
  const choice:ComparisonSelection={deliveryId:"current",previousDeliveryId:"old",criterionId:"page"};
  const newOld=reconcileComparisonSelection(choice,"current","other-old");assert.equal(newOld.criterionId,undefined);
  const returnedOld=reconcileComparisonSelection(newOld,"current","old");assert.equal(returnedOld.criterionId,undefined);
  const nextDelivery=reconcileComparisonSelection(choice,"next","current");assert.equal(nextDelivery.criterionId,undefined);
  assert.equal(selectedComparisonRow(rows,nextDelivery.criterionId)?.criterion.id,"price");
  assert.equal(selectedComparisonRow(rows,"removed-criterion")?.criterion.id,"price");assert.equal(selectedComparisonRow([]),undefined);
});
