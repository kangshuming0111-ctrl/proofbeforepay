import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import ts from "typescript";
import {assessmentComponentModule} from "./assessment-component-harness.ts";
import {sameQuoteResponseView,type QuoteResponseView} from "../lib/quote-response-fence.ts";
import type {ProofAssessment,ProofAssessmentItem,ProofBrowserCheckReport,ProofCriterion,ProofEvidence} from "../lib/contracts.ts";

const criterion:ProofCriterion={id:"mobile",title:"Mobile usability",source:"Every agreed page must be usable on a mobile screen and checked by the buyer."};
const pages=["index.html","menu.html","contact.html"];
const evidence:ProofEvidence={id:"mobile-rule",criterionId:"mobile",finding:"needs_human",file:"all required pages",excerpt:"Static source does not prove mobile usability.",explanation:"Inspect every agreed page."};
const item:ProofAssessmentItem={criterionId:"mobile",status:"insufficient_evidence",explanation:"Exact saved mobile unknown.",citations:[],ruleEvidenceIds:["mobile-rule"],evidenceNeed:{schema:"source-evidence-need-v1",reason:"browser_observation",targetFiles:[]},modelJudgment:{status:"insufficient_evidence",explanation:"Exact original mobile model wording.",citations:[]}};
const report:ProofAssessment={id:"mobile-assessment",deliveryId:"current-delivery",mode:"live",method:"source-ai-v1",model:"synthetic-no-provider-call",assessedAt:"2026-11-07T00:00:00.000Z",items:[item],risks:[],limitations:["Static source only."],coverage:{includedFiles:["index.html","menu.html"],omittedFiles:[],truncatedFiles:[]}};
const nextStepModule=(async()=>{
 const source=await readFile(new URL("../app/components/ScopeClarificationPanel.tsx",import.meta.url),"utf8");
 let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText.replace('import "../scope-clarification.css";',"");
 for(const name of["react","react/jsx-runtime"])output=output.replaceAll(JSON.stringify(name),JSON.stringify(import.meta.resolve(name)));
 for(const name of["assessment-evidence-needs","assessment-requirement-completeness"])output=output.replaceAll(JSON.stringify("@/lib/"+name),JSON.stringify(new URL("../lib/"+name+".ts",import.meta.url).href));
 output = output.replaceAll('"./noodle-hours-guidance"', JSON.stringify(new URL("../app/components/noodle-hours-guidance.ts", import.meta.url).href));
 output = output.replaceAll('"./noodle-evidence-guidance"', JSON.stringify(new URL("../app/components/noodle-evidence-guidance.ts", import.meta.url).href));
 return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
})();
type Node={type?:unknown;props?:{children?:unknown;disabled?:boolean;onClick?:()=>void}};
function nodes(value:unknown):Node[]{if(Array.isArray(value))return value.flatMap(nodes);if(!value||typeof value!=="object"||!("props"in value))return[];const node=value as Node;return[node,...nodes(node.props?.children)];}
function text(value:unknown):string{if(Array.isArray(value))return value.map(text).join("");if(typeof value==="string"||typeof value==="number")return String(value);return value&&typeof value==="object"&&"props"in value?text((value as Node).props?.children):"";}
function nav(tree:unknown){return nodes(tree).find(node=>node.type==="button"&&["Open mobile checks","打开手机显示检查"].includes(text(node)));}

test("locked noodle navigation and unbound menu prices get different, concrete evidence steps",async()=>{
  const {RequirementNextStep}=await nextStepModule;
  const {Component,cleanup}=await assessmentComponentModule(true);
  try {
    const reason={schema:"source-evidence-need-v1" as const,reason:"requirement_clarification" as const,targetFiles:[]};
    const navigation={id:"coverage-1",title:"Navigation",source:"网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。"};
    const price={id:"coverage-2",title:"Prices",source:"菜单页同时展示中文「牛肉面」和英文「Beef noodles」，两种语言所示价格均为 AUD18。"};
    for(const [requirement,expected] of [[navigation,/分别点击菜单和联系链接.*menu\.html.*contact\.html/u],[price,/没有绑定唯一的菜单文件.*牛肉面.*Beef noodles.*AUD 18/u]] as const){
      const saved={...item,criterionId:requirement.id,evidenceNeed:reason};
      const next=renderToStaticMarkup(RequirementNextStep({criterion:requirement,item:saved,language:"zh"}));
      const assessment=renderToStaticMarkup(Component({report:{...report,items:[saved]},criteria:[requirement],language:"zh"}));
      assert.match(next,expected);
      assert.match(assessment,expected);
      assert.match(assessment,/证据不足/u);
    }
  } finally {await cleanup();}
});

test("saved navigation displays observed arrivals by delivery and keeps human confirmation separate", async () => {
  const {RequirementNextStep} = await nextStepModule;
  const {Component, cleanup} = await assessmentComponentModule(true);
  try {
    const navigation = {id:"coverage-1", title:"Homepage links", source:"网站包含首页、菜单页 menu.html 和联系页 contact.html，首页可打开菜单页和联系页。"};
    const savedItem: ProofAssessmentItem = {...item, criterionId:navigation.id, evidenceNeed:{schema:"source-evidence-need-v1", reason:"direct_observation", targetFiles:[]}};
    const readings: ProofBrowserCheckReport["readings"] = ([375,900] as const).flatMap(viewportWidth => ["menu", "contact"].map(label => ({
      stepId:`${label}:${viewportWidth}`, kind:"link" as const, status:"observed" as const, file:"index.html", label, viewportWidth,
      target:`${label}.html`, clickedLabel:label === "menu" ? "菜单" : "联系", reachedTarget:`${label}.html`, sourceVisible:true,
      sourceHitTarget:true, activated:true, destinationMatched:true, targetVisible:true, outcome:"expected_observation" as const,
    })));
    const navigationReport: ProofBrowserCheckReport = {id:"saved-browser-run", deliveryId:report.deliveryId, method:"client-browser-checks-noodle-v2",
      receivedAt:report.assessedAt, viewportHeight:800, readings, summary:{steps:4, observed:4, issues:0, unavailable:0}};
    const render = (saved: ProofBrowserCheckReport) => renderToStaticMarkup(Component({report:{...report, items:[savedItem]}, criteria:[navigation],
      language:"zh", navigationReport:saved, navigationAccepted:true, onPrepareFeedback:()=>{}}));
    const markup = render(navigationReport);
    assert.match(markup,/首页导航回放证据.*验收时保存的报告.*<code>current-delivery<\/code>/u);
    assert.match(markup,/<dt>点击的链接<\/dt><dd>菜单<\/dd>.*<dt>实际到达<\/dt><dd><code>menu\.html/u);
    assert.match(markup,/<dt>点击的链接<\/dt><dd>联系<\/dd>.*<dt>实际到达<\/dt><dd><code>contact\.html/u);
    assert.match(markup,/核对后，勾选本项人工核对/u);
    assert.doesNotMatch(markup,/分别点击菜单和联系链接|请求补充证据/u);
    assert.doesNotMatch(render({...navigationReport,deliveryId:"stale-delivery"}), /首页导航回放证据/u);

    const mismatch = structuredClone(navigationReport);
    const row = mismatch.readings[0];
    if (row.status === "observed" && row.kind === "link") Object.assign(row,{reachedTarget:"contact.html", destinationMatched:false, targetVisible:false, outcome:"mismatch"});
    assert.match(render(mismatch), /到达页与约定不符.*<dt>实际到达<\/dt><dd><code>contact\.html<\/code><\/dd>.*<dt>约定目标<\/dt><dd><code>menu\.html/u);
    const next = renderToStaticMarkup(RequirementNextStep({criterion:navigation,item:savedItem,language:"zh",navigationReport}));
    assert.match(next,/浏览器记录了两条首页链接的到达页.*买家尚未人工确认本项/u);
    assert.doesNotMatch(next,/分别点击菜单和联系链接/u);
  } finally {await cleanup();}
});

test("buyer can open the existing mobile checks before AI, with every locked page retained and no automatic human confirmation",async()=>{
 const {RequirementNextStep}=await nextStepModule;
 for(const language of["zh","en"]as const){const calls:string[]=[],before=structuredClone({criterion,pages,evidence});
  const tree=RequirementNextStep({criterion,evidence:[evidence],language,mobileObservation:{requiredPages:pages,onOpen:()=>calls.push("open")}}),html=renderToStaticMarkup(tree);
  for(const file of pages)assert.ok(html.includes(`<code>${file}</code>`));assert.match(html,language==="zh"?/AI 尚未运行/u:/AI has not run/u);assert.match(html,language==="zh"?/买家尚未人工确认本项/u:/Buyer has not confirmed this requirement manually/u);
  assert.match(html,language==="zh"?/买家逐页查看/u:/The buyer inspects every agreed page/u);assert.match(html,language==="zh"?/实际操作能力需另行验证|宽度读数不等于手机可用/u:/working interactions need separate verification|Width readings do not establish mobile usability/u);
  assert.doesNotMatch(html,/<input\b|<form\b/u);assert.deepEqual(calls,[]);const button=nav(tree);assert.ok(button?.props?.onClick);button.props.onClick();assert.deepEqual(calls,["open"]);assert.deepEqual({criterion,pages,evidence},before);
 }
});

test("confirmed mobile evidence removes the task from the current report and keeps the original observation limit",async()=>{
  const {RequirementNextStep}=await nextStepModule;
  const {Component,cleanup}=await assessmentComponentModule(true);
  try {
    for(const state of ["draft","saved"] as const){
      const observationReview={state,items:[{criterionId:"mobile",kind:"mobile" as const}]};
      const mobileObservation={requiredPages:pages,onOpen:()=>{}};
      const next=renderToStaticMarkup(RequirementNextStep({criterion,item,evidence:[evidence],language:"zh",observationReview,mobileObservation}));
      const card=renderToStaticMarkup(Component({report,criteria:[criterion],language:"zh",observationReview,mobileObservation,onPrepareFeedback:()=>{}}));
      for(const html of [next,card]){
        assert.match(html,state==="draft"?/已勾选人工核对，待随本版验收保存/u:/人工证据已写入本版验收记录/u);
        assert.doesNotMatch(html,/打开手机显示检查|请求补充证据/u);
      }
      assert.match(card,/查看当时的源码评估（证据不足）/u);
      assert.match(card,/Exact saved mobile unknown/u);
      assert.match(card,/仍待补证 0 项/u);
    }
  } finally {await cleanup();}
});

test("saved mobile browser-unknown uses agreed all-page scope rather than empty-source-target speculation and only navigates on click",async()=>{
 const {Component,cleanup}=await assessmentComponentModule(true);try{for(const language of["zh","en"]as const){const calls:string[]=[],before=structuredClone(report);
  const tree=Component({report,criteria:[criterion],language,mobileObservation:{requiredPages:pages,onOpen:()=>calls.push("open")},onRun:()=>calls.push("run"),onPrepareFeedback:()=>calls.push("feedback")}),html=renderToStaticMarkup(tree);
  for(const file of pages)assert.ok(html.includes(`<code>${file}</code>`));assert.ok(!report.coverage.includedFiles.includes("contact.html"),"Missing delivered contact page remains an agreed observation target, not a substituted extra page.");
  assert.match(html,language==="zh"?/约定的全部页面|买家按下方已约定的全部页面/u:/All agreed pages|The buyer inspects mobile presentation on every agreed page/u);assert.doesNotMatch(html,/尚未定位具体文件|No exact target file was recorded|卖家补充对应页面的浏览器观察记录/u);
  assert.ok(html.includes(item.explanation));assert.ok(html.includes(item.modelJudgment!.explanation));assert.match(html,language==="zh"?/证据不足/u:/insufficient evidence/u);assert.deepEqual(calls,[]);const button=nav(tree);assert.ok(button?.props?.onClick);button.props.onClick();assert.deepEqual(calls,["open"]);assert.deepEqual(report,before);
 }}finally{await cleanup();}
});

test("busy and readonly mobile guidance cannot invoke the navigation and a recorded human check is not requested again",async()=>{
 const {RequirementNextStep}=await nextStepModule,{Component,cleanup}=await assessmentComponentModule(true);try{
  for(const kind of["disabled","readonly","missing-callback"]as const){const calls:string[]=[],mobileObservation={requiredPages:pages,...(kind!=="missing-callback"?{onOpen:()=>calls.push("open")}:{}) ,disabled:kind==="disabled"},readOnly=kind==="readonly";
   for(const tree of[RequirementNextStep({criterion,evidence:[evidence],item,language:"en",humanConfirmed:true,readOnly,mobileObservation}),Component({report,criteria:[criterion],language:"en",readOnly,mobileObservation})]){
    const button=nav(tree);if(kind==="disabled"){assert.equal(button?.props?.disabled,true);button?.props?.onClick?.();}else assert.equal(button,undefined);assert.deepEqual(calls,[]);
   }
  }
  const recorded=renderToStaticMarkup(RequirementNextStep({criterion,item,evidence:[evidence],humanConfirmed:true,language:"en",mobileObservation:{requiredPages:pages}}));assert.match(recorded,/The human check for this requirement is recorded/u);assert.doesNotMatch(recorded,/then explicitly confirm this requirement after inspection/u);
  const calls:string[]=[],busy=Component({report,criteria:[criterion],language:"en",busy:true,mobileObservation:{requiredPages:pages,onOpen:()=>calls.push("open")}}),button=nav(busy);assert.equal(button?.props?.disabled,true);button?.props?.onClick?.();assert.deepEqual(calls,[]);
 }finally{await cleanup();}
});

test("custom or unknown page contexts do not borrow the built-in mobile all-page route, and legacy need causes remain unguessed",async()=>{
 const {RequirementNextStep}=await nextStepModule,{Component,cleanup}=await assessmentComponentModule(true);try{
  for(const custom of[true,false]){const target=custom?{...criterion,id:"manual-1"}:criterion,saved={...report,items:[{...item,criterionId:target.id}]},requiredPages=custom?pages:[];
   const trees=[RequirementNextStep({criterion:target,item:saved.items[0],language:"en",mobileObservation:{requiredPages,onOpen:()=>{throw Error("FORBIDDEN_OPEN");}}}),Component({report:saved,criteria:[target],language:"en",mobileObservation:{requiredPages,onOpen:()=>{throw Error("FORBIDDEN_OPEN");}}})];
   for(const tree of trees){assert.equal(nav(tree),undefined);assert.doesNotMatch(renderToStaticMarkup(tree),/All agreed pages/u);}
  }
  const legacy={...report,items:[{...item,evidenceNeed:undefined}]},before=structuredClone(legacy),html=renderToStaticMarkup(createElement(Component,{report:legacy,criteria:[criterion],language:"en",mobileObservation:{requiredPages:pages,onOpen:()=>{}}}));assert.match(html,/No structured evidence-needed reason was recorded/u);assert.doesNotMatch(html,/The buyer inspects mobile presentation on every agreed page/u);assert.deepEqual(legacy,before);
 }finally{await cleanup();}
});

const pageSource=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
function pageNavigation(overrides:Record<string,unknown>={}){
 const names=["openMobileChecks","focusPanel","scheduleWorkspaceFocus"],source=ts.createSourceFile("page.tsx",pageSource,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX),selected=new Map<string,string>();
 function visit(node:ts.Node){if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))selected.set(node.name.text,node.getText(source));ts.forEachChild(node,visit);}visit(source);assert.equal(selected.size,names.length);
 const calls:{name:string;args:unknown[]}[]=[],frames:(()=>void)[]=[],view={current:{projectId:"project",deliveryId:"delivery",role:"buyer"}as QuoteResponseView},root={};
 const spy=(name:string)=>(...args:unknown[])=>{calls.push({name,args});};
 const env={quote:{id:"project"},delivery:{id:"delivery"},deliveryUnlocked:true,busy:"",window:{requestAnimationFrame:(callback:()=>void)=>{frames.push(callback);return frames.length;}},currentQuoteView:view,workspaceFocusSerial:{current:0},workspaceRef:{current:root},sameQuoteResponseView,setDeliveryTab:spy("tab"),setWorkspaceView:spy("view"),setWorkspacePanel:spy("panel"),overviewKey:"project:buyer",setDetailedWorkspaceKey:spy("detail"),setTechnicalFocusRequest:spy("technical"),setNotice:spy("notice"),revealGuidedTarget:(...args:unknown[])=>{calls.push({name:"reveal",args});return true;},tr:(_zh:string,en:string)=>en,mutate:()=>{throw Error("FORBIDDEN_MUTATION");},request:()=>{throw Error("FORBIDDEN_REQUEST");},fetch:()=>{throw Error("FORBIDDEN_NETWORK");},...overrides};
 const js=ts.transpileModule(names.map(name=>selected.get(name)).join("\n"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const handlers=new Function(...Object.keys(env),`${js}\nreturn {${names.join(",")}};`)(...Object.values(env))as{openMobileChecks:()=>void};
 return{calls,frames,view,root,open:handlers.openMobileChecks,flush:()=>{while(frames.length)frames.shift()!();}};
}

test("actual page mobile action selects the existing layout panel only after the guarded frame, without a workflow action",()=>{
 const h=pageNavigation();h.open();assert.ok(h.calls.some(c=>c.name==="tab"&&c.args[0]==="layout"));assert.ok(!h.calls.some(c=>c.name==="reveal"));h.flush();assert.deepEqual(h.calls.find(c=>c.name==="reveal")?.args,[h.root,".layout-check-panel",".evidence-panel"]);
 for(const overrides of[{quote:undefined},{delivery:undefined},{deliveryUnlocked:false},{busy:"layout"}]){const blocked=pageNavigation(overrides);blocked.open();assert.deepEqual(blocked.calls,[]);assert.equal(blocked.frames.length,0);}
});

test("actual page mobile focus cancels across project, delivery, role or superseding navigation",()=>{
 for(const change of[{projectId:"another"},{deliveryId:"replacement"},{role:"seller"as const}]){const h=pageNavigation();h.open();Object.assign(h.view.current,change);h.flush();assert.ok(!h.calls.some(c=>c.name==="reveal"));}
 const h=pageNavigation();h.open();h.open();h.flush();assert.equal(h.calls.filter(c=>c.name==="reveal").length,1);
});
