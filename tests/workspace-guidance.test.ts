import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {quoteResponseContext,sameQuoteResponseView,type QuoteResponseView} from "../lib/quote-response-fence.ts";

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8");
const syntax=ts.createSourceFile("page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
/** Execute selected actual declarations with explicit local dependencies. This
 * is a source-level handler test, not React rendering or native browser QA. */
function declarations(names:readonly string[]){
  const found=new Map<string,string>();
  const visit=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text)){assert.ok(!found.has(node.name.text),`Ambiguous function ${node.name.text}`);found.set(node.name.text,node.getText(syntax));}ts.forEachChild(node,visit);};visit(syntax);
  for(const name of names)assert.ok(found.has(name),`Actual function ${name} not found`);
  return names.map(name=>found.get(name)!).join("\n");
}
function compile(source:string,names:readonly string[],environment:Record<string,unknown>):Record<string,Function>{
  const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  return new Function(...Object.keys(environment),`${js}\nreturn {${names.join(",")}};`)(...Object.values(environment));
}
const actual=(names:readonly string[],environment:Record<string,unknown>)=>compile(declarations(names),names,environment);
type Call={name:string;args:unknown[]};
function actionEnvironment(extra:Record<string,unknown>={}){
  const calls:Call[]=[],spy=(name:string)=>(...args:unknown[])=>{calls.push({name,args});};
  const env:Record<string,unknown>={
    tr:(_zh:string,en:string)=>en,paymentPending:false,captured:false,voided:false,closedUnpaid:false,expired:false,acceptedCurrent:false,
    quote:{id:"current-project",status:"approved",paymentMode:"demo"},buyer:true,roleplay:false,collaboration:undefined,authorized:false,
    delivery:undefined,deliveryUnlocked:true,customView:true,reviewCurrent:false,
    focusPanel:spy("focus"),switchWorkspaceRole:spy("switch"),beginDeliveryAcceptance:spy("acceptance-view"),openTransferChecks:spy("transfer-view"),openModelChecks:spy("model-view"),
    mutate:spy("FORBIDDEN_MUTATION"),...extra,
  };
  return {calls,env,handler:actual(["nextWorkspaceAction"],env).nextWorkspaceAction};
}

// Exact pre-round30 no-delivery branch from e6b5b1d05852af340ba206515478dee75330993b,
// after the existing eligibility guards.
// Retained bounded source excerpt documents the old missing-target regression;
// it is not a replacement implementation of the current workflow resolver.
const priorNoDelivery=`function priorNoDelivery(){
  if (!delivery) return {label: tr("前往上传交付文件", "Open delivery upload"), help: tr("保存时会同时完成规则核查。", "Saving also runs the rule checks."), action: () => focusPanel("delivery", "#deliveryFiles")};
}`;
test("the retained old branch targets a buyer-hidden input; the actual eligible legacy branch switches display first",()=>{
  const f=actionEnvironment(),old=compile(priorNoDelivery,["priorNoDelivery"],f.env).priorNoDelivery();
  assert.equal(f.calls.length,0);old.action();assert.deepEqual(f.calls,[{name:"focus",args:["delivery","#deliveryFiles"]}]);
  f.calls.length=0;const current=f.handler();assert.equal(f.calls.length,0);current.action();assert.deepEqual(f.calls,[{name:"switch",args:["seller"]}]);
  assert.equal(f.env.buyer,true,"The navigation spy does not grant server membership or upload files");
});
test("four legacy delivery-entry branches choose a display switch, file input or one exact sample button without clicking it",()=>{
  for(const customView of[true,false])for(const buyer of[true,false]){
    const f=actionEnvironment({buyer,customView,authorized:!customView}),next=f.handler();assert.ok(next.label&&next.help);assert.equal(f.calls.length,0);next.action();
    assert.deepEqual(f.calls,buyer?[{name:"switch",args:["seller"]}]:[{name:"focus",args:["delivery",customView?"#deliveryFiles":".demo-quick-deliveries .variant-button.is-flawed"]}]);
    assert.ok(!f.calls.some(call=>call.name==="FORBIDDEN_MUTATION"));
  }
});
test("scope and payment eligibility keep priority over legacy entry; real collaboration never grants seller perspective",()=>{
  const cases:[Record<string,unknown>,Call][]=[
    [{quote:{id:"p",status:"draft"}},{name:"focus",args:["agreement",".scope-approval button"]}],
    [{deliveryUnlocked:false,customView:false},{name:"focus",args:["payment"]}],
    [{paymentPending:true},{name:"focus",args:["payment"]}],
    [{captured:true},{name:"focus",args:["payment"]}],
    [{voided:true},{name:"focus",args:["payment"]}],
    [{closedUnpaid:true},{name:"focus",args:["payment"]}],
    [{expired:true},{name:"focus",args:["payment"]}],
    [{collaboration:{stage:"awaiting_seller"}},{name:"focus",args:["payment",".collaboration-invite-form input"]}],
    [{collaboration:{stage:"in_progress"}},{name:"focus",args:["payment"]}],
    [{collaboration:{stage:"changes_requested"}},{name:"focus",args:["payment"]}],
  ];
  for(const[change,expected]of cases){const f=actionEnvironment(change),next=f.handler();assert.equal(f.calls.length,0);next.action();assert.deepEqual(f.calls,[expected]);}
});

function focusEnvironment(extra:Record<string,unknown>={}){
  const calls:Call[]=[],queue:(()=>void)[]=[],spy=(name:string)=>(...args:unknown[])=>calls.push({name,args});
  const currentQuoteView={current:{projectId:"current-project",deliveryId:"current-delivery",role:"buyer"}as QuoteResponseView},workspaceFocusSerial={current:0};
  const article={focus:spy("article-focus"),scrollIntoView:spy("article-scroll")},acceptance={scrollIntoView:spy("acceptance-scroll")};
  const root={focus:spy("root-focus"),contains:(value:unknown)=>value===acceptance,querySelectorAll:(selector:string)=>{calls.push({name:"query",args:[selector]});return selector===".criterion-evidence"?[article]:[];}};
  const workspaceRef:{current:unknown}={current:root};let technical:unknown={kind:"journey",deliveryId:"current-delivery",id:0};
  const env:Record<string,unknown>={
    currentQuoteView,workspaceFocusSerial,workspaceRef,sameQuoteResponseView,window:{requestAnimationFrame:(callback:()=>void)=>{queue.push(callback);return queue.length;}},
    tr:(_zh:string,en:string)=>en,setWorkspaceView:spy("view"),setWorkspacePanel:spy("panel"),setDeliveryTab:spy("tab"),setNotice:spy("notice"),setCriterionIndex:spy("criterion-index"),setShowDeliveryAcceptance:spy("acceptance-visible"),setDeliveryConsent:spy("delivery-consent"),acceptanceRef:{current:acceptance},
    setTechnicalFocusRequest:(value:unknown)=>{technical=value;calls.push({name:"technical-focus",args:[value]});},
    revealGuidedTarget:(...args:unknown[])=>{calls.push({name:"reveal",args});return true;},
    proof:{criteria:[{id:"current-criterion"}]},delivery:{id:"current-delivery"},
    mutate:spy("FORBIDDEN_MUTATION"),request:spy("FORBIDDEN_REQUEST"),...extra,
  };
  const names=["scheduleWorkspaceFocus","focusPanel","openCriterion","beginDeliveryAcceptance","openRuntimeChecks","openEnquiryChecks","openModelChecks","openProjectJourney","openTransferChecks"];
  return {calls,queue,env,currentQuoteView,workspaceFocusSerial,workspaceRef,root,acceptance,handlers:actual(names,env),technical:()=>technical,flush:()=>{while(queue.length)queue.shift()!();}};
}
test("actual scheduled focus executes only after RAF for the same project, delivery and role",()=>{
  for(const change of[undefined,{projectId:"other-project"},{deliveryId:"other-delivery"},{role:"seller"}as const]){
    const f=focusEnvironment(),effects:unknown[]=[];f.handlers.scheduleWorkspaceFocus((root:unknown)=>effects.push(root));
    assert.deepEqual(effects,[]);assert.equal(f.technical(),undefined,"New navigation clears a retained technical request");
    if(change)f.currentQuoteView.current={...f.currentQuoteView.current,...change};f.flush();
    assert.deepEqual(effects,change?[]:[f.root]);assert.ok(!f.calls.some(call=>call.name.startsWith("FORBIDDEN_")));
  }
});
test("latest navigation intent cancels older RAF even if identity stays equal or changes away and back",()=>{
  const f=focusEnvironment(),effects:string[]=[];
  f.handlers.scheduleWorkspaceFocus(()=>effects.push("old"));f.handlers.scheduleWorkspaceFocus(()=>effects.push("new"));f.flush();assert.deepEqual(effects,["new"]);
  f.handlers.scheduleWorkspaceFocus(()=>effects.push("old-before-switch"));const before={...f.currentQuoteView.current};f.currentQuoteView.current={...before,role:"seller"};f.handlers.scheduleWorkspaceFocus(()=>effects.push("seller"));f.currentQuoteView.current=before;f.handlers.scheduleWorkspaceFocus(()=>effects.push("back-current"));f.flush();assert.deepEqual(effects,["new","back-current"]);
});
function publishingEnvironment(){
  const f=focusEnvironment(),quoteApplyRevision={current:0},currentBrowserContext={current:""},clearedWhile:QuoteResponseView[]=[],renderRevisions:number[]=[];
  const env={...f.env,quoteApplyRevision,currentBrowserContext,quoteResponseContext,setQuoteRenderRevision:(value:number)=>renderRevisions.push(value),setTechnicalFocusRequest:(value:unknown)=>{if(value===undefined)clearedWhile.push({...f.currentQuoteView.current});(f.env.setTechnicalFocusRequest as Function)(value);}};
  return {...f,quoteApplyRevision,currentBrowserContext,clearedWhile,renderRevisions,handlers:actual(["publishQuoteResponseView","scheduleWorkspaceFocus","openProjectJourney","openTransferChecks"],env)};
}
test("publishing a different perspective retires retained same-delivery technical focus before assigning the new view",()=>{
  const f=publishingEnvironment(),buyer={...f.currentQuoteView.current};f.handlers.openProjectJourney();assert.deepEqual(f.technical(),{kind:"journey",deliveryId:buyer.deliveryId,id:1});
  const seller:QuoteResponseView={...buyer,role:"seller"};f.handlers.publishQuoteResponseView(seller);
  assert.equal(f.technical(),undefined);assert.equal(f.workspaceFocusSerial.current,2);assert.deepEqual(f.clearedWhile,[buyer],"Retire the old intent synchronously while the old view is still published");assert.deepEqual(f.currentQuoteView.current,seller);assert.notEqual(f.currentQuoteView.current,seller);assert.deepEqual(f.renderRevisions,[1]);assert.equal(f.quoteApplyRevision.current,1);assert.equal(f.currentBrowserContext.current,quoteResponseContext(seller));
  f.handlers.publishQuoteResponseView(buyer);assert.equal(f.workspaceFocusSerial.current,3);assert.equal(f.technical(),undefined,"Returning to buyer cannot replay the retained journey intent");assert.deepEqual(f.renderRevisions,[1,2]);
});
test("actual central publishing cancels an A-to-B-to-A queued focus even without an intervening navigation request",()=>{
  for(const changed of[{projectId:"other-project"},{deliveryId:"other-delivery"},{role:"seller"}as const]){
    const f=publishingEnvironment(),a={...f.currentQuoteView.current},effects:unknown[]=[];
    f.handlers.scheduleWorkspaceFocus((root:unknown)=>effects.push(root));assert.equal(f.workspaceFocusSerial.current,1);
    f.handlers.publishQuoteResponseView({...a,...changed});f.handlers.publishQuoteResponseView(a);assert.deepEqual(f.currentQuoteView.current,a);assert.equal(f.workspaceFocusSerial.current,3);f.flush();assert.equal(effects.length,0,"Identity equality after returning is not sufficient to revive the older intent");
    f.handlers.scheduleWorkspaceFocus((root:unknown)=>effects.push(root));f.flush();assert.deepEqual(effects,[f.root]);assert.deepEqual(f.renderRevisions,[1,2]);assert.ok(!f.calls.some(call=>call.name.startsWith("FORBIDDEN_")));
  }
});
test("publishing an identical view retains its current intent while normal quote render revisions still advance",()=>{
  const f=publishingEnvironment(),a={...f.currentQuoteView.current};f.handlers.openTransferChecks();const retained=f.technical();assert.equal(f.workspaceFocusSerial.current,1);
  f.handlers.publishQuoteResponseView({...a});assert.equal(f.workspaceFocusSerial.current,1);assert.equal(f.technical(),retained);assert.deepEqual(f.clearedWhile,[]);assert.deepEqual(f.renderRevisions,[1]);assert.equal(f.currentBrowserContext.current,quoteResponseContext(a));
  const effects:unknown[]=[];f.handlers.scheduleWorkspaceFocus((root:unknown)=>effects.push(root));assert.equal(f.technical(),undefined);const serial=f.workspaceFocusSerial.current,clearCount=f.clearedWhile.length;
  f.handlers.publishQuoteResponseView({...a});assert.equal(f.workspaceFocusSerial.current,serial);assert.equal(f.clearedWhile.length,clearCount);f.flush();assert.deepEqual(effects,[f.root]);assert.deepEqual(f.renderRevisions,[1,2]);assert.equal(f.quoteApplyRevision.current,2);
});
test("a removed workspace never receives scheduled focus",()=>{
  const f=focusEnvironment(),effects:unknown[]=[];f.handlers.scheduleWorkspaceFocus((root:unknown)=>effects.push(root));f.workspaceRef.current=null;f.flush();assert.deepEqual(effects,[]);
});
test("actual focusPanel delegates scoped reveal with a truthful fallback notice and never clicks controls",()=>{
  for(const[panel,selector,section]of[["agreement",".scope-approval button",".scope-panel"],["delivery","#deliveryFiles",".evidence-panel"],["payment",undefined,".payment-panel"]]as const){
    const f=focusEnvironment();f.handlers.focusPanel(panel,selector);assert.ok(!f.calls.some(call=>call.name==="reveal"));f.flush();
    assert.deepEqual(f.calls.filter(call=>call.name==="reveal"),[{name:"reveal",args:[f.root,selector??section,section]}]);assert.ok(!f.calls.some(call=>call.name==="notice"||call.name.startsWith("FORBIDDEN_")||call.name==="delivery-consent"));
  }
  const failed=focusEnvironment({revealGuidedTarget:()=>false});failed.handlers.focusPanel("delivery","#missing");failed.flush();assert.ok(failed.calls.some(call=>call.name==="notice"));
  const stale=focusEnvironment({revealGuidedTarget:()=>{throw Error("Stale focus must never reveal a target");}});stale.handlers.focusPanel("delivery","#deliveryFiles");stale.currentQuoteView.current={...stale.currentQuoteView.current,deliveryId:"new"};stale.flush();assert.ok(!stale.calls.some(call=>call.name==="notice"));
});
test("runtime, enquiry and model navigation share the guarded reveal path without starting a check",()=>{
  for(const[method,selector]of[["openRuntimeChecks",".runtime-check-panel"],["openEnquiryChecks",".enquiry-checks-panel"],["openModelChecks","#model-checks"]]as const){
    const f=focusEnvironment();f.handlers[method]();assert.deepEqual(f.calls.filter(call=>call.name==="tab"),[{name:"tab",args:["layout"]}]);assert.ok(!f.calls.some(call=>call.name==="reveal"));f.flush();assert.deepEqual(f.calls.filter(call=>call.name==="reveal"),[{name:"reveal",args:[f.root,selector,".evidence-panel"]}]);assert.ok(!f.calls.some(call=>call.name.startsWith("FORBIDDEN_")));
    const stale=focusEnvironment();stale.handlers[method]();stale.currentQuoteView.current={...stale.currentQuoteView.current,role:"seller"};stale.flush();assert.ok(!stale.calls.some(call=>call.name==="reveal"));
  }
});
test("technical navigation shares the monotonic intent serial and never reuses a cleared focus id",()=>{
  const f=focusEnvironment();f.handlers.openProjectJourney();const first=f.technical()as{kind:string;deliveryId:string;id:number};assert.deepEqual(first,{kind:"journey",deliveryId:"current-delivery",id:1});
  f.handlers.focusPanel("payment");assert.equal(f.technical(),undefined);assert.equal(f.workspaceFocusSerial.current,2);
  f.handlers.openTransferChecks();assert.deepEqual(f.technical(),{kind:"transfer",deliveryId:"current-delivery",id:3});f.flush();assert.ok(!f.calls.some(call=>call.name==="reveal"),"The newer technical intent cancels queued ordinary focus");
  f.handlers.focusPanel("delivery","#deliveryFiles");assert.equal(f.technical(),undefined);f.handlers.openProjectJourney();assert.deepEqual(f.technical(),{kind:"journey",deliveryId:"current-delivery",id:5});assert.ok(!f.calls.some(call=>call.name.startsWith("FORBIDDEN_")));
  const absent=focusEnvironment({delivery:undefined});absent.handlers.openTransferChecks();assert.equal(absent.technical(),undefined);assert.equal(absent.workspaceFocusSerial.current,1);
});
test("criterion and acceptance inspection cancel their delayed work after a delivery switch",()=>{
  for(const method of["openCriterion","beginDeliveryAcceptance"]){
    const f=focusEnvironment();method==="openCriterion"?f.handlers.openCriterion("current-criterion"):f.handlers.beginDeliveryAcceptance();assert.ok(!f.calls.some(call=>call.name.endsWith("-scroll")||call.name==="article-focus"));f.flush();assert.ok(f.calls.some(call=>call.name===(method==="openCriterion"?"article-focus":"acceptance-scroll")));assert.ok(!f.calls.some(call=>call.name.startsWith("FORBIDDEN_")));
    const stale=focusEnvironment();method==="openCriterion"?stale.handlers.openCriterion("current-criterion"):stale.handlers.beginDeliveryAcceptance();stale.currentQuoteView.current={...stale.currentQuoteView.current,deliveryId:"other"};stale.flush();assert.ok(!stale.calls.some(call=>call.name.endsWith("-scroll")||call.name==="article-focus"));
  }
  const unknown=focusEnvironment();unknown.handlers.openCriterion("not-agreed");assert.equal(unknown.queue.length,0);assert.deepEqual(unknown.calls,[]);
  const outside={scrollIntoView:()=>{throw Error("Cannot scroll outside current workspace");}},f=focusEnvironment({acceptanceRef:{current:outside}});f.handlers.beginDeliveryAcceptance();f.flush();
});
test("resuming an existing project performs one read and only schedules current-root focus",async()=>{
  const f=focusEnvironment(),item={id:"resume-project",language:"en",proof:{delivery:{id:"resume-delivery"}}};
  const env={...f.env,run:async(_name:string,task:()=>Promise<void>)=>task(),request:async(...args:unknown[])=>{f.calls.push({name:"read",args});return{quote:item,role:"buyer"};},apply:(quote:typeof item,role:"buyer"|"seller")=>{f.calls.push({name:"apply",args:[quote,role]});f.currentQuoteView.current={projectId:quote.id,deliveryId:quote.proof.delivery.id,role};},publishQuoteResponseView:(view:QuoteResponseView)=>{f.currentQuoteView.current=view;},setWorkspaceRole:()=>{},clearReturnContext:()=>{},showCaseAddress:()=>{},setLanguage:()=>{},setReconciliation:()=>{},workspaceRole:"buyer"};
  const handlers=actual(["scheduleWorkspaceFocus","openCase"],env);await handlers.openCase(item);assert.deepEqual(f.calls.filter(call=>call.name==="read"),[{name:"read",args:["/api/quotes/resume-project"]}]);assert.ok(!f.calls.some(call=>call.name==="root-focus"));f.flush();assert.ok(f.calls.some(call=>call.name==="root-focus"));assert.ok(!f.calls.some(call=>call.name.startsWith("FORBIDDEN_")));
  f.calls.length=0;await handlers.openCase(item);f.currentQuoteView.current={...f.currentQuoteView.current,projectId:"new-project"};f.flush();assert.ok(!f.calls.some(call=>call.name==="root-focus"));
});
