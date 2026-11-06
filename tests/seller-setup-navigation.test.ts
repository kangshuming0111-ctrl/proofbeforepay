import assert from "node:assert/strict";
import test from "node:test";
import {revealGuidedTarget} from "../app/components/reveal-guided-target.ts";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
import {createElement,isValidElement,type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {parse,type DefaultTreeAdapterTypes} from "parse5";
import ts from "typescript";
import type {ProofQuote} from "../lib/contracts.ts";
import {newProjectJourneyPlan} from "../lib/project-journey.ts";

/** Instrumented DOM contract model, not a browser/layout implementation. It
 * checks scoped lookup, disclosure/focus order and forbidden side effects.
 * Actual CSS, native toggle scheduling and focus/scroll need browser QA. */
type ModelRect={width:number;height:number};
class ModelDocument{
 activeElement:ModelElement|null=null;
 trace:string[]=[];
 defaultView={getComputedStyle:(node:ModelElement)=>({visibility:node.visibility})};
}
class ModelElement{
 tagName:string;id:string;ownerDocument:ModelDocument;parentElement:ModelElement|null=null;
 children:ModelElement[]=[];attributes=new Map<string,string>();visibility="visible";
 rects:ModelRect[]=[{width:100,height:20}];disabled=false;focusNoop=false;
 tabIndex:number;queries:string[]=[];focusOptions:unknown;scrollOptions:unknown;
 private storedValue="preserved manifest";private storedChecked=true;
 constructor(document:ModelDocument,tag:string,id:string){this.ownerDocument=document;this.tagName=tag.toUpperCase();this.id=id;this.tabIndex=["INPUT","BUTTON","SELECT","TEXTAREA","SUMMARY","IFRAME"].includes(this.tagName)?0:-1;}
 get open(){return this.hasAttribute("open");}
 get value(){return this.storedValue;}
 set value(value:string){this.ownerDocument.trace.push(`forbidden:value:${this.id}`);this.storedValue=value;}
 get checked(){return this.storedChecked;}
 set checked(value:boolean){this.ownerDocument.trace.push(`forbidden:checked:${this.id}`);this.storedChecked=value;}
 add(...nodes:ModelElement[]){for(const node of nodes){node.parentElement=this;this.children.push(node);}return this;}
 hasAttribute(name:string){return this.attributes.has(name);}
 getAttribute(name:string){return this.attributes.get(name)??null;}
 setAttribute(name:string,value:string){this.ownerDocument.trace.push(`set:${this.id}:${name}`);this.attributes.set(name,value);if(name==="tabindex")this.tabIndex=Number(value);}
 matches(selector:string){
  if(selector===":disabled,[aria-disabled=true]"){
   const formControl=["INPUT","BUTTON","SELECT","TEXTAREA"].includes(this.tagName);
   let nativeDisabled=this.disabled;
   if(formControl)for(let node=this.parentElement;node;node=node.parentElement)if(node.tagName==="FIELDSET"&&node.disabled)nativeDisabled=true;
   return nativeDisabled||this.getAttribute("aria-disabled")==="true";
  }
  if(!/^#[A-Za-z][A-Za-z0-9_-]*$/u.test(selector))throw new Error("model_invalid_selector");
  return this.id===selector.slice(1);
 }
 querySelectorAll(selector:string){
  this.queries.push(selector);const found:ModelElement[]=[];
  const visit=(node:ModelElement)=>{for(const child of node.children){if(child.matches(selector))found.push(child);visit(child);}};
  visit(this);return found;
 }
 getClientRects(){
  for(let node=this.parentElement;node;node=node.parentElement){
   if(node.tagName!=="DETAILS"||node.open)continue;
   const summary=node.children.find(child=>child.tagName==="SUMMARY");
   let under:ModelElement|null=this;while(under&&under!==summary&&under!==node)under=under.parentElement;
   if(under!==summary)return [];
  }
  return this.rects;
 }
 focus(options?:unknown){this.ownerDocument.trace.push(`focus:${this.id}`);this.focusOptions=options;if(!this.focusNoop)this.ownerDocument.activeElement=this;}
 scrollIntoView(options?:unknown){this.ownerDocument.trace.push(`scroll:${this.id}`);this.scrollOptions=options;}
 click(){this.ownerDocument.trace.push(`forbidden:click:${this.id}`);}
 dispatchEvent(event:{type:string}){this.ownerDocument.trace.push(`forbidden:event:${event.type}:${this.id}`);return true;}
}
function model(){const document=new ModelDocument(),node=(tag:string,id:string)=>new ModelElement(document,tag,id),root=node("section","root");return{document,node,root};}
function reveal(root:ModelElement|null,selector:string,fallback?:string){return revealGuidedTarget(root as unknown as HTMLElement|null,selector,fallback);}
const forbidden=(document:ModelDocument)=>document.trace.filter(entry=>entry.startsWith("forbidden:"));

test("guided reveal model: null, missing and invalid targets fail closed without global lookup",()=>{
 assert.equal(reveal(null,"#missing"),false);
 const f=model();assert.equal(reveal(f.root,"#missing"),false);assert.equal(reveal(f.root,"["),false);
 assert.deepEqual(f.document.trace,[]);assert.equal(f.document.activeElement,null);
});

test("guided reveal model: closed ancestors open outermost before focus, preserving input and iframe nodes",()=>{
 const f=model(),outer=f.node("details","outer"),outerSummary=f.node("summary","outer-summary"),inner=f.node("details","inner"),innerSummary=f.node("summary","inner-summary"),target=f.node("button","target"),consent=f.node("input","consent"),manifest=f.node("textarea","manifest"),frame=f.node("iframe","frame");
 frame.attributes.set("src","https://synthetic.invalid/staging.html");
 f.root.add(outer);outer.add(outerSummary,inner);inner.add(innerSummary,target,consent,manifest,frame);
 const originalChildren=[...inner.children],originalValue=manifest.value,originalChecked=consent.checked,frameSrc=frame.getAttribute("src");
 assert.equal(reveal(f.root,"#target"),true);
 assert.deepEqual(f.document.trace,["set:outer:open","set:inner:open","focus:target","scroll:target"]);
 assert.deepEqual(target.focusOptions,{preventScroll:true});assert.deepEqual(target.scrollOptions,{block:"nearest",inline:"nearest"});
 assert.equal(outer.open,true);assert.equal(inner.open,true);assert.equal(f.document.activeElement,target);
 assert.deepEqual(inner.children,originalChildren);assert.equal(manifest.value,originalValue);assert.equal(consent.checked,originalChecked);assert.equal(frame.getAttribute("src"),frameSrc);
 assert.deepEqual(forbidden(f.document),[]);
});

test("guided reveal model: details focus their direct summary rather than a nested summary",()=>{
 const f=model(),target=f.node("details","target"),nested=f.node("details","nested"),nestedSummary=f.node("summary","nested-summary"),directSummary=f.node("summary","direct-summary");
 nested.add(nestedSummary);target.add(nested,directSummary);f.root.add(target);
 assert.equal(reveal(f.root,"#target"),true);assert.equal(f.document.activeElement,directSummary);assert.equal(nested.open,false);
 assert.deepEqual(f.document.trace,["set:target:open","focus:direct-summary","scroll:direct-summary"]);
});

test("guided reveal model: details without a direct summary focus their container and preserve declared tabindex",()=>{
 for(const explicit of[false,true]){
  const f=model(),target=f.node("details","target"),nested=f.node("details","nested"),summary=f.node("summary","nested-summary");nested.add(summary);target.add(nested);f.root.add(target);
  if(explicit){target.attributes.set("tabindex","-1");target.tabIndex=-1;}
  assert.equal(reveal(f.root,"#target"),true);assert.equal(f.document.activeElement,target);assert.equal(nested.open,false);
  assert.equal(target.getAttribute("tabindex"),"-1");assert.equal(f.document.trace.includes("set:target:tabindex"),!explicit);
 }
});

test("guided reveal model: root itself can be the unique target and is not counted twice",()=>{
 const f=model();assert.equal(reveal(f.root,"#root"),true);assert.equal(f.document.activeElement,f.root);assert.equal(f.root.getAttribute("tabindex"),"-1");
 const g=model(),details=g.node("details","details-root"),summary=g.node("summary","root-summary");details.add(summary);
 assert.equal(reveal(details,"#details-root"),true);assert.equal(details.open,true);assert.equal(g.document.activeElement,summary);
});

test("guided reveal model: outside disclosures and targets are never opened or selected",()=>{
 const f=model(),outside=f.node("details","outside"),outsideSummary=f.node("summary","outside-summary"),target=f.node("button","target");outside.add(outsideSummary,f.root);f.root.add(target);
 assert.equal(reveal(f.root,"#outside"),false);assert.equal(reveal(f.root,"#target"),false);assert.equal(outside.open,false);assert.equal(f.document.activeElement,null);
 assert.deepEqual(f.document.trace,[]);
 outside.attributes.set("open","");outside.attributes.set("inert","");assert.equal(reveal(f.root,"#target"),false);assert.equal(f.document.activeElement,null);
});

test("guided reveal model: ambiguous descendant or root-plus-descendant targets never choose the first",()=>{
 for(const rootDuplicate of[false,true]){
  const f=model(),first=f.node("button",rootDuplicate?"root":"target"),second=f.node("button","target");f.root.add(first);if(!rootDuplicate)f.root.add(second);
  assert.equal(reveal(f.root,rootDuplicate?"#root":"#target"),false);assert.equal(f.document.activeElement,null);assert.deepEqual(f.document.trace,[]);
 }
});

test("guided reveal model: disabled controls, disabled fieldsets and aria-disabled targets never receive focus",()=>{
 for(const mode of["disabled","fieldset","aria-disabled"]){
  const f=model(),fieldset=f.node("fieldset","fieldset"),target=f.node("input","target");f.root.add(fieldset);fieldset.add(target);
  if(mode==="disabled")target.disabled=true;else if(mode==="fieldset")fieldset.disabled=true;else target.attributes.set("aria-disabled","true");
  assert.equal(reveal(f.root,"#target"),false,mode);assert.equal(f.document.activeElement,null);assert.deepEqual(f.document.trace,[]);assert.deepEqual(forbidden(f.document),[]);
 }
});

test("guided reveal model: hidden, inert and aria-hidden on targets or ancestors fail closed",()=>{
 for(const attribute of["hidden","inert","aria-hidden"])for(const location of["target","ancestor"]){
  const f=model(),ancestor=f.node("section","ancestor"),target=f.node("button","target");f.root.add(ancestor);ancestor.add(target);
  (location==="target"?target:ancestor).attributes.set(attribute,attribute==="aria-hidden"?"true":"");
  assert.equal(reveal(f.root,"#target"),false,`${attribute}:${location}`);assert.equal(f.document.activeElement,null);assert.deepEqual(f.document.trace,[]);
 }
});

test("guided reveal model: CSS visibility and empty or zero-area rects cannot establish a revealed target",()=>{
 for(const visibility of["hidden","collapse"])for(const location of["target","ancestor"]){
  const f=model(),ancestor=f.node("section","ancestor"),target=f.node("button","target");f.root.add(ancestor);ancestor.add(target);(location==="target"?target:ancestor).visibility=visibility;
  assert.equal(reveal(f.root,"#target"),false);assert.equal(f.document.activeElement,null);
 }
 for(const rects of[[],[{width:0,height:10}],[{width:10,height:0}],[{width:0,height:0},{width:20,height:0}]]){
  const f=model(),target=f.node("button","target");target.rects=rects;f.root.add(target);assert.equal(reveal(f.root,"#target"),false);assert.equal(f.document.activeElement,null);assert.deepEqual(f.document.trace,[]);
 }
 const f=model(),target=f.node("button","target");target.rects=[{width:0,height:0},{width:1,height:1}];f.root.add(target);assert.equal(reveal(f.root,"#target"),true);
});

test("guided reveal model: a focus no-op fails rather than claiming success or scrolling",()=>{
 const f=model(),target=f.node("button","target"),previous=f.node("button","previous");f.root.add(previous,target);f.document.activeElement=previous;target.focusNoop=true;
 assert.equal(reveal(f.root,"#target"),false);assert.equal(f.document.activeElement,previous);assert.deepEqual(f.document.trace,["focus:target"]);
});

test("guided reveal model: fallback may receive focus but always reports primary failure",()=>{
 for(const selector of["#missing","[","#disabled"]){
  const f=model(),target=f.node("button","disabled"),fallback=f.node("section","status");target.disabled=true;f.root.add(target,fallback);
  assert.equal(reveal(f.root,selector,"#status"),false);assert.equal(f.document.activeElement,fallback);assert.deepEqual(forbidden(f.document),[]);
  assert.equal(f.root.queries.filter(value=>value==="#status").length,1);
 }
 const f=model();assert.equal(reveal(f.root,"#missing","#missing"),false);assert.deepEqual(f.root.queries,["#missing"]);
});

test("guided reveal model: repeated navigation preserves existing form values, consent and node membership",()=>{
 const f=model(),scope=f.node("details","scope"),summary=f.node("summary","scope-summary"),consent=f.node("input","consent"),manifest=f.node("textarea","manifest"),frame=f.node("iframe","frame");scope.add(summary,consent,manifest,frame);f.root.add(scope);
 const children=[...scope.children];
 for(const selector of["#scope","#manifest","#consent","#scope"]){assert.equal(reveal(f.root,selector),true);assert.equal(consent.checked,true);assert.equal(manifest.value,"preserved manifest");assert.deepEqual(scope.children,children);}
 assert.equal(consent.hasAttribute("tabindex"),false);assert.equal(manifest.hasAttribute("tabindex"),false);assert.deepEqual(forbidden(f.document),[]);
});

const repo=path.resolve(import.meta.dirname,".."),require=createRequire(import.meta.url);
test("real navigation component invokes exactly its selected fixed callback and announces failure without declaring completion",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-setup-callback-"));
 try{
  const hook=path.join(dir,"state.mjs");await writeFile(hook,'export const notices=[]; export function useState(initial){return [initial,value=>notices.push(value)];}');
  let output=ts.transpileModule(await readFile(path.join(repo,"app/components/SellerSetupNavigation.tsx"),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
  output=output.replaceAll('"react"',JSON.stringify(pathToFileURL(hook).href)).replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve("react/jsx-runtime")).href));
  const file=path.join(dir,"navigation.mjs");await writeFile(file,output);
  const {SellerSetupNavigation,SELLER_SETUP_TARGETS}=await import(pathToFileURL(file).href),{notices}=await import(pathToFileURL(hook).href);
  const steps:string[]=[],element=SellerSetupNavigation({language:"en",onNavigate:(step:string)=>{steps.push(step);return step!=="application";}}),buttons:{onClick:()=>void;type:string}[]=[];
  const visit=(node:ReactNode)=>{if(Array.isArray(node)){node.forEach(visit);return;}if(!isValidElement<{children?:ReactNode;onClick?:()=>void;type?:string}>(node))return;if(node.type==="button")buttons.push(node.props as {onClick:()=>void;type:string});visit(node.props.children);};visit(element);
  assert.equal(buttons.length,4);for(const button of buttons){assert.equal(button.type,"button");button.onClick();}
  assert.deepEqual(steps,["scope","controls","application","run"]);
  assert.deepEqual(Object.values(SELLER_SETUP_TARGETS),["#journey-supported-scope","#seller-dom-setup","#seller-integration-applications","#journey-run-setup"]);
  assert.match(notices[2],/could not be located/u);assert.match(notices[2],/no test ran and no consent changed/u);
  assert.ok(notices.every((notice:string)=>!/completed|passed|connected successfully/iu.test(notice)));
 }finally{await rm(dir,{recursive:true,force:true});}
});

function descendants(node:DefaultTreeAdapterTypes.Node):DefaultTreeAdapterTypes.Element[]{
 const children="childNodes"in node?node.childNodes:[];
 return [...("tagName"in node?[node]:[]),...children.flatMap(descendants)];
}
function textContent(node:DefaultTreeAdapterTypes.Node):string{return "value"in node?node.value:("childNodes"in node?node.childNodes.map(textContent).join(""):"");}
test("real complete journey subtree keeps four meaningful preparation targets across roles and plan state; SSR makes no requests",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-setup-real-ssr-"));let requests=0;
 try{
  // Use the build tool already pinned by Wrangler; package imports point at
  // this installed workspace. No mock replaces any production child panel.
  const wranglerRequire=createRequire(require.resolve("wrangler/package.json")),esbuild=wranglerRequire("esbuild") as {build(options:Record<string,unknown>):Promise<unknown>},file=path.join(dir,"journey.mjs");
  type Build={onResolve(options:{filter:RegExp},callback:(args:{path:string})=>{path:string;external:boolean}|undefined):void};
  await esbuild.build({absWorkingDir:repo,entryPoints:["app/components/ProjectJourneyPanel.tsx"],outfile:file,bundle:true,format:"esm",platform:"node",loader:{".css":"empty"},plugins:[{name:"workspace-package-urls",setup(build:Build){build.onResolve({filter:/^[^./]/},args=>{if(args.path.startsWith("@/"))return;if(args.path.startsWith("node:"))return{path:args.path,external:true};return{path:pathToFileURL(require.resolve(args.path)).href,external:true};});}}]});
  const {ProjectJourneyPanel}=await import(pathToFileURL(file).href);
  for(const role of["buyer","seller"]as const)for(const language of["en","zh"]as const)for(const adopted of[false,true]){
   const quote={id:"synthetic-setup-project",summary:"Fictional booking website",language,status:"approved",proof:{project:{requiredPages:["index.html"],manualRequirements:[]},criteria:[],delivery:{id:"synthetic-setup-delivery",variant:"upload",label:"Synthetic website",submittedAt:"2026-11-06T00:00:00.000Z",files:{"index.html":"<p>Fictional</p>"},evidence:[],...(adopted?{journeyPlan:newProjectJourneyPlan("2026-11-06T00:00:00.000Z")}: {})},paymentState:"unfunded",audit:[]}} as unknown as ProofQuote;
   const before=structuredClone(quote),html=renderToStaticMarkup(createElement(ProjectJourneyPanel,{quote,role,language,enabled:true,request:async()=>{requests++;throw Error("Unexpected SSR request");},onApply(){throw Error("Unexpected apply");},onBusy(){throw Error("Unexpected busy");},onDecision(){throw Error("Unexpected decision");}})),nodes=descendants(parse(html));
   for(const id of["journey-supported-scope","seller-dom-setup","seller-integration-applications","journey-run-setup"]){
    const found=nodes.filter(node=>node.attrs.some(attr=>attr.name==="id"&&attr.value===id));assert.equal(found.length,1,`${id}: ${role}/${language}/${adopted}`);assert.ok(textContent(found[0]).trim().length>60,`${id} must contain real instructions, not an empty anchor`);assert.ok(!found[0].attrs.some(attr=>attr.name==="hidden"));
   }
   const run=nodes.find(node=>node.attrs.some(attr=>attr.name==="id"&&attr.value==="journey-run-setup"))!;
   if(!adopted){assert.match(textContent(run),language==="en"?/buyer can explicitly confirm/iu:/买家可在此明确确认/u);assert.equal(descendants(run).filter(node=>node.tagName==="iframe").length,0);}
   else{assert.match(textContent(run),language==="en"?/not yet known/iu:/尚不能确定/u);const frames=descendants(run).filter(node=>node.tagName==="iframe");assert.equal(frames.length,1);assert.ok(frames[0].attrs.some(attr=>attr.name==="hidden"));}
   assert.equal(nodes.filter(node=>node.tagName==="nav"&&node.attrs.some(attr=>attr.name==="aria-label"&&attr.value===(language==="en"?"Booking backend preparation":"预约后台接入准备"))).length,1);
   assert.deepEqual(quote,before);
  }
  assert.equal(requests,0,"SSR does not execute effects; actual focus, preservation across actions and layout remain browser QA");
 }finally{await rm(dir,{recursive:true,force:true});}
});
