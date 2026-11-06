import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {parse} from "parse5";
import ts from "typescript";
import {projectIntakeBlocker,type ProjectIntakeBlockerInput} from "../lib/project-intake-blocker.ts";
import {sameQuoteResponseView} from "../lib/quote-response-fence.ts";

const ready=():ProjectIntakeBlockerInput=>({coverageReady:true,coverageConfirmed:true,coverageError:"",coverageRows:[{disposition:"include"}],hasRequirementsDraft:false,requirementsConfirmed:false,businessCount:0,businessReady:false,businessConfirmed:false,runtimeEnabled:false,runtimeReady:false,runtimeConfirmed:false});
const blocked=(input:ProjectIntakeBlockerInput)=>!input.coverageConfirmed||!input.coverageReady||input.hasRequirementsDraft&&!input.requirementsConfirmed||input.businessCount>0&&(!input.businessConfirmed||!input.businessReady)||input.runtimeEnabled&&(!input.runtimeConfirmed||!input.runtimeReady);

test("blocker presence matches the existing disabled prerequisites for all 512 boolean combinations",()=>{
  for(let flags=0;flags<512;flags++){
    const on=(bit:number)=>Boolean(flags&(1<<bit));
    const input:ProjectIntakeBlockerInput={...ready(),coverageReady:on(0),coverageConfirmed:on(1),hasRequirementsDraft:on(2),requirementsConfirmed:on(3),businessCount:on(4)?1:0,businessReady:on(5),businessConfirmed:on(6),runtimeEnabled:on(7),runtimeReady:on(8),runtimeConfirmed:false};
    for(const runtimeConfirmed of[false,true]){input.runtimeConfirmed=runtimeConfirmed;assert.equal(!!projectIntakeBlocker(input),blocked(input),JSON.stringify(input));}
  }
});
test("all explicitly excluded source rows with reasons remain valid without adding an included-row gate",()=>{
  const input=ready();input.coverageRows=[{disposition:"exclude",reason:"Handled in a later milestone"},{disposition:"exclude",reason:"Out of this delivery"}];
  assert.equal(projectIntakeBlocker(input),null);
});
test("source errors and missing rows return to the actual basics input",()=>{
  for(const extra of[{coverageError:"Too many source groups"},{coverageRows:[]}])assert.deepEqual(projectIntakeBlocker({...ready(),coverageReady:false,...extra}),{kind:"source",step:0,selector:"#projectSummary"});
});
test("pending and missing exclusion reasons choose one exact row without interpolating user content",()=>{
  const input:ProjectIntakeBlockerInput={...ready(),coverageReady:false,coverageConfirmed:false,coverageRows:[{disposition:"exclude",reason:" "},{disposition:"pending"},{disposition:"pending"}]};
  assert.deepEqual(projectIntakeBlocker(input),{kind:"pending",step:1,selector:".requirement-coverage-list > li:nth-child(2) select"});
  input.coverageRows=[{disposition:"include"},{disposition:"exclude",reason:" "},{disposition:"exclude",reason:""}];
  assert.deepEqual(projectIntakeBlocker(input),{kind:"exclusion",step:1,selector:".requirement-coverage-list > li:nth-child(2) textarea"});
});
test("confirmation blockers advance in source, adopted checklist, business, backend order",()=>{
  const input={...ready(),coverageConfirmed:false,hasRequirementsDraft:true,businessCount:1,runtimeEnabled:true};
  assert.equal(projectIntakeBlocker(input)?.kind,"coverage");input.coverageConfirmed=true;
  assert.equal(projectIntakeBlocker(input)?.kind,"requirements");input.requirementsConfirmed=true;
  assert.equal(projectIntakeBlocker(input)?.kind,"business-edit");input.businessReady=true;
  assert.equal(projectIntakeBlocker(input)?.kind,"business-confirm");input.businessConfirmed=true;
  assert.equal(projectIntakeBlocker(input)?.kind,"runtime-edit");input.runtimeReady=true;
  assert.equal(projectIntakeBlocker(input)?.kind,"runtime-confirm");input.runtimeConfirmed=true;
  assert.equal(projectIntakeBlocker(input),null);
});
test("projection does not mutate input or manufacture a success state for create-only server validation",()=>{
  const input=ready();Object.freeze(input.coverageRows);Object.freeze(input);
  assert.equal(projectIntakeBlocker(input),null);
  assert.equal(projectIntakeBlocker({...input,coverageReady:false})?.selector,".requirement-coverage");
});

const loadComponent=(async()=>{
  const source=await readFile(new URL("../app/components/ProjectIntakeBlocker.tsx",import.meta.url),"utf8");
  let js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText.replace('import "../project-intake-blocker.css";',"");
  js=js.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  return(await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)).ProjectIntakeBlocker;
})();
test("actual bilingual component displays each blocker and only invokes navigation on an explicit click",async()=>{
  const Component=await loadComponent;
  const states=[{coverageReady:false,coverageError:"source"},{coverageReady:false,coverageRows:[{disposition:"pending" as const}]},{coverageReady:false,coverageRows:[{disposition:"exclude" as const}]},{coverageConfirmed:false},{hasRequirementsDraft:true},{businessCount:1},{businessCount:1,businessReady:true},{runtimeEnabled:true},{runtimeEnabled:true,runtimeReady:true}];
  for(const language of["zh","en"]as const)for(const extra of states){
    const blocker=projectIntakeBlocker({...ready(),...extra})!,calls:unknown[]=[];
    const props={blocker,language,disabled:false,onGo:(value:unknown)=>calls.push(value)},tree=Component(props),children=tree.props.children;
    assert.deepEqual(calls,[]);assert.equal(children[1].props.type,"button");assert.equal(children[1].props.disabled,false);
    assert.ok(children[0].props.children.length>10);assert.ok(children[1].props.children.length>3);
    children[1].props.onClick();assert.deepEqual(calls,[blocker]);
    const html=renderToStaticMarkup(createElement(Component,props));assert.match(html,/role="status"/u);assert.match(html,/aria-describedby="project-intake-blocker-message"/u);
    assert.doesNotMatch(html,/type="submit"|checkbox|onSubmit/u);
  }
});
test("actual component has no ready claim or action when clear and disables navigation while unavailable",async()=>{
  const Component=await loadComponent;let calls=0;
  assert.equal(Component({blocker:null,language:"en",disabled:false,onGo:()=>calls++}),null);
  const html=renderToStaticMarkup(createElement(Component,{blocker:projectIntakeBlocker({...ready(),coverageConfirmed:false}),language:"en",disabled:true,onGo:()=>calls++}));
  assert.match(html,/<button\b[^>]*disabled=""/u);assert.equal(calls,0);
});

const page=await readFile(new URL("../app/page.tsx",import.meta.url),"utf8"),syntax=ts.createSourceFile("page.tsx",page,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function actualFunctions(names:string[]){const found=new Map<string,string>();const visit=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text))found.set(node.name.text,node.getText(syntax));ts.forEachChild(node,visit);};visit(syntax);for(const name of names)assert.ok(found.has(name));return names.map(name=>found.get(name)).join("\n");}
function focusHarness(overrides:Record<string,unknown>={}){
  const reveals:unknown[][]=[],notices:string[]=[],errors:string[]=[],steps:number[]=[];
  const state:Record<string,any>={pendingIntakeFocus:{current:null},currentQuoteView:{current:{projectId:null,deliveryId:null,role:"buyer"}},workspaceFocusSerial:{current:0},workspaceRole:"buyer",projectStep:0,projectMode:"custom",workspaceView:"workbench",intakeStarted:true,quote:null,busy:"",loading:false,operationLock:{current:false},workspaceRef:{current:{syntheticRoot:true}},sameQuoteResponseView,
    tr:(_zh:string,en:string)=>en,revealGuidedTarget:(...args:unknown[])=>{reveals.push(args);return true;},setNotice:(value:string)=>notices.push(value),setError:(value:string)=>errors.push(value),projectBasicsError:()=>"",setProjectStep:(value:number)=>{steps.push(value);state.projectStep=value;},run:()=>{throw Error("FORBIDDEN_BUSINESS_ACTION");},...overrides};
  const names=["moveIntakeStep","flushIntakeFocus","goToIntakeBlocker","create"],js=ts.transpileModule(actualFunctions(names),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  const handlers=new Function("state",`with(state){${js};return {${names.join(",")}};}`)(state)as Record<string,Function>;
  return{state,handlers,reveals,notices,errors,steps};
}
test("actual valid next-step handler requests post-commit coverage heading focus, and back targets basics",async()=>{
  const h=focusHarness();let prevented=false;await h.handlers.create({preventDefault:()=>{prevented=true;}});
  assert.equal(prevented,true);assert.deepEqual(h.errors,[""]);assert.deepEqual(h.steps,[1]);assert.deepEqual(h.reveals,[]);
  h.handlers.flushIntakeFocus();assert.equal(h.reveals[0][1],".requirement-coverage h3");assert.equal(h.state.pendingIntakeFocus.current,null);
  h.handlers.flushIntakeFocus();assert.equal(h.reveals.length,1);
  h.handlers.moveIntakeStep(0,"#projectTitle");h.handlers.flushIntakeFocus();assert.equal(h.reveals[1][1],"#projectTitle");
});
test("invalid basics never transition or focus and no create request is made",async()=>{
  const h=focusHarness({projectBasicsError:()=>"Invalid amount"});await h.handlers.create({preventDefault:()=>{}});h.handlers.flushIntakeFocus();
  assert.deepEqual(h.steps,[]);assert.deepEqual(h.reveals,[]);assert.deepEqual(h.errors,["Invalid amount"]);
});
test("actual post-commit focus consumes rejected mode, step, view, role, busy and context intents without later replay",()=>{
  for(const change of[{projectMode:"demo"},{projectStep:0},{workspaceView:"history"},{workspaceRole:"seller"},{intakeStarted:false},{busy:"requirements"},{loading:true},{quote:{id:"new-project"}},{operationLock:{current:true}},{currentQuoteView:{current:{projectId:"other",deliveryId:null,role:"buyer"}}},{workspaceFocusSerial:{current:2}}]){
    const h=focusHarness();h.handlers.moveIntakeStep(1,".requirement-coverage h3");const before={...h.state};Object.assign(h.state,change);h.handlers.flushIntakeFocus();assert.deepEqual(h.reveals,[],JSON.stringify(change));assert.equal(h.state.pendingIntakeFocus.current,null);
    Object.assign(h.state,before);h.handlers.flushIntakeFocus();assert.deepEqual(h.reveals,[],"Rejected intent must not replay after context returns");
  }
});
test("latest back/next intent replaces prior intent, and identity serial rejects context ABA",()=>{
  const h=focusHarness();h.handlers.moveIntakeStep(1,".requirement-coverage h3");h.handlers.moveIntakeStep(0,"#projectTitle");h.handlers.flushIntakeFocus();assert.equal(h.reveals.length,1);assert.equal(h.reveals[0][1],"#projectTitle");
  h.handlers.moveIntakeStep(1,".requirement-coverage h3");h.state.workspaceFocusSerial.current+=2;h.handlers.flushIntakeFocus();assert.equal(h.reveals.length,1);
});
test("actual blocker action reveals only the existing same-step control or explicitly changes to source step",()=>{
  const h=focusHarness({projectStep:1});const blocker=projectIntakeBlocker({...ready(),coverageConfirmed:false})!;
  h.handlers.goToIntakeBlocker(blocker);assert.equal(h.reveals[0][1],blocker.selector);assert.deepEqual(h.steps,[]);
  h.handlers.goToIntakeBlocker({kind:"source",step:0,selector:"#projectSummary"});assert.deepEqual(h.steps,[0]);assert.equal(h.reveals.length,1);h.handlers.flushIntakeFocus();assert.equal(h.reveals[1][1],"#projectSummary");
});
test("actual blocker navigation is unavailable during busy, loading, server project or non-intake view",()=>{
  const blocker=projectIntakeBlocker({...ready(),coverageConfirmed:false})!;
  for(const change of[{projectMode:"demo"},{projectStep:0},{workspaceView:"audit"},{intakeStarted:false},{busy:"requirements"},{loading:true},{quote:{id:"project"}},{operationLock:{current:true}}]){
    const h=focusHarness({projectStep:1,...change});h.handlers.goToIntakeBlocker(blocker);assert.deepEqual(h.steps,[]);assert.deepEqual(h.reveals,[]);
  }
});
test("missing real control produces a visible location notice; layout effect invokes the guarded consumer",()=>{
  const h=focusHarness({revealGuidedTarget:()=>false});h.handlers.moveIntakeStep(1,".requirement-coverage h3");h.handlers.flushIntakeFocus();assert.match(h.notices[0],/could not be focused/u);
  const effects:string[]=[];const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(syntax)==="useLayoutEffect"&&node.arguments[0]?.getText(syntax).includes("flushIntakeFocus"))effects.push(node.getText(syntax));ts.forEachChild(node,visit);};visit(syntax);assert.equal(effects.length,1);
  for(const dependency of["projectStep","projectMode","workspaceView","workspaceRole","intakeStarted","quote?.id","busy","loading"])assert.ok(effects[0].includes(dependency));
});

test("actual business and runtime editor wrappers keep navigation selectors disjoint",()=>{
  const wrappers:{id:string;component:string}[]=[];const visit=(node:ts.Node)=>{if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(syntax)==="div"){
    const id=node.openingElement.attributes.properties.find(a=>ts.isJsxAttribute(a)&&a.name.getText(syntax)==="id")as ts.JsxAttribute|undefined;
    if(id&&id.initializer&&ts.isStringLiteral(id.initializer)&&["intake-business-checks","intake-runtime-checks"].includes(id.initializer.text))wrappers.push({id:id.initializer.text,component:node.children.filter(ts.isJsxSelfClosingElement).map(n=>n.tagName.getText(syntax)).join(",")});
  }ts.forEachChild(node,visit);};visit(syntax);
  assert.deepEqual(wrappers,[{id:"intake-business-checks",component:"BusinessCheckEditor"},{id:"intake-runtime-checks",component:"RuntimePlanEditor"}]);
});
