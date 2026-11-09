import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {frozenDeliveryAssessment} from "../lib/plain-delivery-summary.ts";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const syntax = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, environment: Record<string, unknown>) {
  let declaration = "";
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      assert.equal(declaration, ""); declaration = node.getText(syntax);
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax); assert.ok(declaration);
  const js = ts.transpileModule(declaration, {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return new Function(...Object.keys(environment), `${js}; return ${name};`)(...Object.values(environment));
}
function environment(overrides: Record<string, unknown> = {}) {
  const calls: {name:string;args:unknown[]}[] = [];
  const spy = (name:string) => (...args:unknown[]) => calls.push({name,args});
  const criteria = [{id:"first"},{id:"second"}];
  const env = {
    busy:"", delivery:{id:"v2",evidence:[],assessment:{deliveryId:"v2",items:[{criterionId:"second"}]}},
    proof:{criteria}, acceptedCurrent:false, frozenAcceptance:{criteria:[{id:"frozen-only"}],evidence:[]},
    CSS:{escape:(value:string)=>value}, setCriterionIndex:spy("select"),setDeliveryTab:spy("tab"),focusPanel:spy("focus"),
    canCheckDelivery:true, comparisonHistoryLoading:false,comparisonHistoryError:false,frozenDeliveryAssessment,mutate:spy("FORBIDDEN_MUTATION"),...overrides,
  };
  return {calls,env};
}
test("overview opens the non-first criterion's actual AI evidence, or its rule evidence without a current AI report",()=>{
  for (const delivery of [undefined,{id:"v2",assessment:{deliveryId:"v1",items:[{criterionId:"second"}]}}]) {
    const f=environment(delivery?{delivery}:{});
    handler("openOverviewCriterion",f.env)({deliveryId:"v2",criterionId:"second",frozen:false});
    assert.deepEqual(f.calls.slice(0,2),[{name:"select",args:[1]},{name:"tab",args:["evidence"]}]);
    assert.equal(f.calls[2].name,"focus");
    assert.equal(f.calls[2].args[1],delivery?'.criterion-evidence[data-criterion-id="second"]':'.delivery-evidence-view > .delivery-assessment .assessment-item[data-criterion-id="second"]');
  }
});
test("accepted inspection uses only a criterion in the frozen snapshot and never the current live report",()=>{
  const f=environment({acceptedCurrent:true});
  const inspect=handler("openOverviewCriterion",f.env);
  inspect({deliveryId:"v2",criterionId:"second",frozen:true}); assert.deepEqual(f.calls,[]);
  inspect({deliveryId:"v2",criterionId:"frozen-only",frozen:true});
  assert.deepEqual(f.calls,[{name:"tab",args:["layout"]},{name:"focus",args:["delivery",'#current-acceptance-evidence [data-accepted-criterion="frozen-only"]']}]);
});
test("stale delivery, changed acceptance state, unknown criterion and busy requests cannot navigate",()=>{
  for (const input of [
    {deliveryId:"v1",criterionId:"second",frozen:false},
    {deliveryId:"v2",criterionId:"second",frozen:true},
    {deliveryId:"v2",criterionId:"missing",frozen:false},
  ]) {const f=environment();handler("openOverviewCriterion",f.env)(input);assert.deepEqual(f.calls,[]);}
  const f=environment({busy:"save"});
  handler("openOverviewCriterion",f.env)({deliveryId:"v2",criterionId:"second",frozen:false});assert.deepEqual(f.calls,[]);
});
test("same-delivery later AI cannot replace a frozen report when opening an accepted criterion",()=>{
  const snapshot={deliveryId:"v2",assessmentId:"accepted-A",criteria:[{id:"second"}],evidence:[],assessment:{id:"accepted-A",deliveryId:"v2",items:[{criterionId:"second"}]}};
  const f=environment({acceptedCurrent:true,frozenAcceptance:snapshot});
  handler("openOverviewCriterion",f.env)({deliveryId:"v2",criterionId:"second",frozen:true});
  assert.equal(f.calls.at(-1)?.args[1],'#current-acceptance-evidence .assessment-item[data-criterion-id="second"]');
  f.calls.length=0;snapshot.assessmentId="missing";
  handler("openOverviewCriterion",f.env)({deliveryId:"v2",criterionId:"second",frozen:true});
  assert.equal(f.calls.at(-1)?.args[1],'#current-acceptance-evidence [data-accepted-criterion="second"]');
});
test("a failed rule keeps focus on its real evidence even when AI supports the same item",()=>{
  const f=environment({proof:{criteria:[{id:"first"},{id:"second"}],review:{deliveryId:"v2"}},delivery:{id:"v2",evidence:[{criterionId:"second",finding:"fail"}],assessment:{deliveryId:"v2",items:[{criterionId:"second",status:"supported"}]}}});
  handler("openOverviewCriterion",f.env)({deliveryId:"v2",criterionId:"second",frozen:false});
  assert.equal(f.calls.at(-1)?.args[1],'.criterion-evidence[data-criterion-id="second"]');
});
test("accepted rules without AI target their saved file and excerpt, not only the status row",()=>{
  const f=environment({acceptedCurrent:true,frozenAcceptance:{criteria:[{id:"second"}],evidence:[{criterionId:"second",file:"contact.html",excerpt:"saved original"}]}});
  handler("openOverviewCriterion",f.env)({deliveryId:"v2",criterionId:"second",frozen:true});
  assert.equal(f.calls.at(-1)?.args[1],'#current-acceptance-evidence [data-accepted-rule-criterion="second"]');
});
test("the comparison shortcut is inactive while its historical source is loading",()=>{
  const f=environment({comparisonHistoryLoading:true});handler("openOverviewComparison",f.env)();assert.deepEqual(f.calls,[]);
});
test("AI and comparison shortcuts reveal existing views without running a model or workflow action",()=>{
  const f=environment();handler("openOverviewAI",f.env)();handler("openOverviewComparison",f.env)();
  assert.deepEqual(f.calls,[{name:"tab",args:["evidence"]},{name:"focus",args:["delivery",".delivery-evidence-view > .delivery-assessment"]},{name:"tab",args:["evidence"]},{name:"focus",args:["delivery",".delivery-comparison"]}]);
  for(const override of [{busy:"save"},{acceptedCurrent:true},{canCheckDelivery:false},{delivery:undefined}]){
    const blocked=environment(override);handler("openOverviewAI",blocked.env)();assert.deepEqual(blocked.calls,[]);
  }
});
test("preparing a buyer draft leaves overview and binds its exact delivery without sending it",()=>{
  const calls: string[]=[];
  const env={quote:{id:"q"},buyer:true,collaboration:{stage:"submitted"},deliveryUnlocked:true,busy:"",delivery:{id:"v2"},proof:{criteria:[{id:"second"}]},
    feedbackSerial:{current:0},overviewKey:"q:v2",tr:(_zh:string,en:string)=>en,
    setFeedbackSuggestion:(value:unknown)=>calls.push(JSON.stringify(value)),setDetailedWorkspaceKey:(key:string)=>calls.push(key),
    setWorkspaceView:(view:string)=>calls.push(view),setWorkspacePanel:(panel:string)=>calls.push(panel),setNotice:()=>calls.push("editable-not-sent"),
  };
  const draft={deliveryId:"v2",criterionId:"second",comment:"Please verify this exact item."};
  handler("prepareFeedback",env)(draft);
  assert.deepEqual(calls,[JSON.stringify({...draft,quoteId:"q",serial:1}),"q:v2","workbench","payment","editable-not-sent"]);
  for(const extra of [{buyer:false},{collaboration:{stage:"accepted"}},{busy:"save"},{delivery:{id:"v3"}}]){
    calls.length=0;handler("prepareFeedback",{...env,...extra})(draft);assert.deepEqual(calls,[]);
  }
});
