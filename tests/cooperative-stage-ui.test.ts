import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createDeliveryStageReport} from '../lib/delivery-stage-evidence.ts';
import {createCooperativeStagePlan} from '../lib/cooperative-stage-evidence.ts';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
type Node={type?:unknown;props?:{children?:unknown;[key:string]:unknown}};
function all(tree:unknown):Node[]{if(Array.isArray(tree))return tree.flatMap(all);if(!tree||typeof tree!=='object')return[];const node=tree as Node;return[node,...all(node.props?.children)];}
function text(node:unknown):string{if(Array.isArray(node))return node.map(text).join('');if(typeof node==='string'||typeof node==='number')return String(node);return node&&typeof node==='object'?text((node as Node).props?.children):'';}
function button(tree:unknown,label:string){const result=all(tree).find(n=>n.type==='button'&&text(n.props?.children)===label);assert.ok(result,label);return result.props!;}
const fixture=()=>({id:'ui-project',proof:{criteria:[{id:'manual-1',title:'Original requirement',source:'Retain the synthetic native record.'}],paymentState:'unfunded',delivery:{id:'ui-delivery',variant:'upload',files:{'index.html':'<p>Synthetic</p>'},evidence:[]}}});
async function payload(q:ReturnType<typeof fixture>){const plan=await createCooperativeStagePlan(q as never,{criterionId:'manual-1',runId:'stage-ui',sourceRevision:'native-v1',payloadDigest:'a'.repeat(64),emailCoverage:'unsupported'}),base={outcome:'observed',runId:plan.runId,sourceRevision:plan.scope.sourceRevision},record={recordId:'native-1',payloadDigest:plan.payloadDigest};return createDeliveryStageReport(plan,[{...base,stage:'submit',accepted:true,operationId:'native-create',record},{...base,stage:'stored_record',reader:'native_store',connectionId:'before',record},{...base,stage:'fresh_readback',reader:'fresh_connection',connectionId:'after',record},{outcome:'unsupported'}]);}
async function harness(){
 const dir=await mkdtemp(path.join(tmpdir(),'pbp-cooperative-ui-'));
 const hooks=`export const states=[],refs=[];let s=0,r=0,effects=[],mounted=false;export function begin(){s=0;r=0;}export function unmount(){effects.forEach(f=>f?.());}export function useState(initial){const i=s++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];}export function useRef(initial){const i=r++;if(!(i in refs))refs[i]={current:initial};return refs[i];}export function useEffect(fn){if(!mounted){effects.push(fn());}}export function end(){mounted=true;}`;
 await writeFile(path.join(dir,'hooks.mjs'),hooks);
 let source=ts.transpileModule(await readFile(path.join(root,'app/components/DeliveryStageEvidence.tsx'),'utf8')+'\nexport {BoundStageEvidence};',{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 source=source.replaceAll('"react"','"./hooks.mjs"').replaceAll('"react/jsx-runtime"',JSON.stringify(pathToFileURL(require.resolve('react/jsx-runtime')).href));
 for(const file of ['delivery-stage-evidence','cooperative-stage-evidence'])source=source.replaceAll(JSON.stringify('@/lib/'+file),JSON.stringify(pathToFileURL(path.join(root,'lib',file+'.ts')).href));
 await writeFile(path.join(dir,'component.mjs'),source);
 const component=await import(pathToFileURL(path.join(dir,'component.mjs')).href),state=await import(pathToFileURL(path.join(dir,'hooks.mjs')).href);
 return{state,render(props:unknown){state.begin();const tree=component.BoundStageEvidence(props);state.end();return tree;},async close(){state.unmount();await rm(dir,{recursive:true,force:true});}};
}
async function settle(predicate:()=>boolean){for(let i=0;i<100&&!predicate();i++)await new Promise(resolve=>setTimeout(resolve,2));assert.ok(predicate(),'actual handler settled');}
function fileInput(tree:unknown){const input=all(tree).find(n=>n.type==='input'&&n.props?.type==='file');assert.ok(input);return input.props!;}
test('actual file-read completion cannot populate another project or role view',async()=>{
 const h=await harness();try{const q=fixture(),report=await payload(q);let writes=0,resolve!:(v:ArrayBuffer)=>void;
 const props={quote:q,role:'seller',language:'en',request:async()=>{writes++;},onApply(){}};
 let tree=h.render(props);const pending=new Promise<ArrayBuffer>(r=>{resolve=r;});(fileInput(tree).onChange as Function)({target:{files:[{size:100,arrayBuffer:()=>pending}],value:'file'}});
 h.render({...props,quote:{...q,id:'another-project'},role:'buyer'});resolve(new TextEncoder().encode(JSON.stringify(report)).buffer);
 await settle(()=>!h.state.states[0]);assert.equal(h.state.states[1],undefined);assert.equal(h.state.states[2],false);assert.equal(writes,0);
 }finally{await h.close();}
});
test('actual save is single-flight, keeps preview on failure, and ignores a stale POST result',async()=>{
 const h=await harness();try{const q=fixture(),report=await payload(q);let calls=0,applied=0,reject!:(e:Error)=>void,resolve!:(v:unknown)=>void;
 const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 const props={quote:q,role:'seller',language:'en',enabled:true,request:async()=>{calls++;return pending;},onApply(){applied++;}};
 let tree=h.render(props);(fileInput(tree).onChange as Function)({target:{files:[{size:JSON.stringify(report).length,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(report)).buffer}],value:'file'}});
 await settle(()=>!h.state.states[0]);tree=h.render(props);assert.equal(button(tree,'Share and save supplemental record').disabled,false);
 const save=button(tree,'Share and save supplemental record').onClick as Function;save();save();await settle(()=>calls===1);reject(Error('Synthetic failed save'));await settle(()=>!h.state.states[0]);assert.equal(h.state.states[1].digest,report.digest);assert.match(h.state.states[3],/Preview retained/);assert.equal(applied,0);
 let resolveSecond!:(v:unknown)=>void;const second=new Promise(yes=>{resolveSecond=yes;});const props2={...props,request:async()=>{calls++;return second;}};
 tree=h.render(props2);(button(tree,'Share and save supplemental record').onClick as Function)();await settle(()=>calls===2);h.render({...props2,role:'buyer'});resolveSecond({quote:q,role:'seller'});await settle(()=>!h.state.states[0]);assert.equal(applied,0);assert.equal(calls,2);
 void resolve;
 }finally{await h.close();}
});
test('missing current files preserve a valid preview and request refresh rather than alleging wrong report scope',async()=>{
 const h=await harness();try{const q=fixture(),report=await payload(q),partial=structuredClone(q);delete(partial.proof.delivery as {files?:unknown}).files;let calls=0;
 const props={quote:partial,role:'buyer',language:'en',enabled:true,request:async()=>{calls++;},onApply(){}};
 let tree=h.render(props);(fileInput(tree).onChange as Function)({target:{files:[{size:JSON.stringify(report).length,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(report)).buffer}],value:'file'}});
 await settle(()=>!h.state.states[0]);tree=h.render(props);assert.equal(h.state.states[1].digest,report.digest);assert.equal(h.state.states[2],false);assert.match(h.state.states[3],/Current delivery files could not be loaded.*Refresh/);assert.doesNotMatch(h.state.states[3],/another project/);assert.equal(button(tree,'Share and save supplemental record').disabled,true);assert.equal(calls,0);
 }finally{await h.close();}
});
