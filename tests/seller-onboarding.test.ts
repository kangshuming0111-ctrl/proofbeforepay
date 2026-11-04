import assert from "node:assert/strict";
import test from "node:test";
import {mkdtemp,readFile,writeFile,copyFile,rm,symlink,realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {buildSellerOnboardingFiles,checkSellerOnboarding,defaultSellerOnboardingConfig,validateSellerOnboardingConfig,type SellerOnboardingConfig} from "../lib/seller-onboarding.ts";
const root=path.resolve(import.meta.dirname,".."),sample=()=>readFile(path.join(root,"examples/seller-onboarding/controls.html"),"utf8");
test("static preparation matches native-shaped controls without claiming execution or backend validation",async()=>{
 const report=checkSellerOnboarding(defaultSellerOnboardingConfig(),await sample());
 assert.equal(report.configurationValid,true);assert.equal(report.staticMarkupReady,true);assert.equal(report.runtimeVerified,false);assert.equal(report.backendVerified,false);
 assert.equal(report.checks.filter(c=>c.code==="selector_matches").length,13);assert.equal(report.checks.at(-1)?.status,"unknown");
 const absent=checkSellerOnboarding(defaultSellerOnboardingConfig());assert.equal(absent.configurationValid,true);assert.equal(absent.staticMarkupReady,false);assert.equal(absent.checks.at(-1)?.code,"html_not_supplied");
});
test("missing, ambiguous and structurally wrong controls are actionable failures, never guessed matches",async()=>{
 const html=await sample(),config=defaultSellerOnboardingConfig();
 const missing=checkSellerOnboarding(config,html.replace('name="guests"','name="different"'));assert.equal(missing.staticMarkupReady,false);assert.equal(missing.checks.find(c=>c.key==="create.partySize")?.code,"selector_missing");
 const duplicate=checkSellerOnboarding(config,html+'<input name="guests">');assert.equal(duplicate.checks.find(c=>c.key==="create.partySize")?.code,"selector_ambiguous");
 const wrong=checkSellerOnboarding({...config,result:"#retry",forms:{...config.forms,create:{...config.forms.create,partySize:"#retry"}}},html);assert.equal(wrong.checks.find(c=>c.key==="create.partySize")?.code,"control_type_invalid");
 const partial=checkSellerOnboarding(config,html.replace('<option value="loss-create">Response lost after saving</option>',""));assert.equal(partial.checks.find(c=>c.key==="create.requestOperation")?.code,"operation_options_missing");
});
test("initially disabled/hidden controls remain unknown; incompatible native inputs cannot silently normalize the fixed ISO values",async()=>{
 const config=defaultSellerOnboardingConfig(),html=await sample();
 for(const changed of[html.replace('id="retry"','id="retry" disabled'),html.replace('name="guests"','name="guests" readonly'),html.replace('name="guests"','name="guests" hidden')]){const r=checkSellerOnboarding(config,changed);assert.equal(r.staticMarkupReady,false);assert.ok(r.checks.some(c=>c.code==="control_statically_unavailable"&&c.status==="unknown"));}
 const altered=html.replace('name="guests" type="number"','name="guests" type="datetime-local"');assert.equal(checkSellerOnboarding(config,altered).checks.find(c=>c.key==="create.partySize")?.code,"input_type_not_compatible");
});
test("selector subset has exact child/descendant/attribute/class semantics and refuses unsupported syntax",()=>{
 const base=defaultSellerOnboardingConfig();
 for(const bad of["#x:hover","#x,#y","*","#x + #y","#x~#y","#\\31 x","[name^=x]","a b c d e","#x >",":root"]){const c=structuredClone(base);c.result=bad;assert.throws(()=>validateSellerOnboardingConfig(c),/selector_unsupported/);}
 const c=structuredClone(base);c.result="section.result > p[role='status']";const html='<section class="result"><p role="status">message</p></section>';assert.equal(checkSellerOnboarding(c,html).checks.find(x=>x.key==="result")?.matches,1);
 c.result="section.result > p[role='status']";assert.equal(checkSellerOnboarding(c,'<section class="result"><div><p role="status">message</p></div></section>').checks.find(x=>x.key==="result")?.matches,0);
 c.result="section.result p[role=status]";assert.equal(checkSellerOnboarding(c,'<section class="result"><div><p role="status">message</p></div></section>').checks.find(x=>x.key==="result")?.matches,1);
});
test("mixed three-part child/descendant selectors retain the immediate-parent relation at each recursion",()=>{
 const c=defaultSellerOnboardingConfig();
 const count=(selected:string,html:string)=>{c.result=selected;return checkSellerOnboarding(c,html).checks.find(x=>x.key==="result")?.matches;};
 assert.equal(count("section > form button",'<section><form><div><button>yes</button></div></form></section>'),1);
 assert.equal(count("section > form button",'<section><aside><form><div><button>no</button></div></form></aside></section>'),0);
 assert.equal(count("section form > button",'<section><aside><form><button>yes</button></form></aside></section>'),1);
 assert.equal(count("section form > button",'<section><form><div><button>no</button></div></form></section>'),0);
});
test("strict configuration rejects extra authority, external backend URLs, credentials and placeholder origins",()=>{
 const base=defaultSellerOnboardingConfig();for(const override of[{protocol:"arbitrary-v1"},{parentOrigin:"https://example.org"},{parentOrigin:"https://actual.example.org"},{parentOrigin:"http://127.0.0.1:3000"},{parentOrigin:"https://main.example.com"},{parentOrigin:"https://live.site/path"},{parentOrigin:"https://user:pass@live.site"},{parentOrigin:"https://live.site/"},{backendBasePath:"https://external.site/pbp/"},{backendBasePath:"//external.site/"},{backendBasePath:"/pbp/../private/"},{operator:true},{frontendRevision:""}])assert.throws(()=>validateSellerOnboardingConfig({...base,...override}));
 const c=structuredClone(base);(c.forms.create as Record<string,string>).foreign="[name=anything]";assert.throws(()=>validateSellerOnboardingConfig(c));
 assert.equal(checkSellerOnboarding(base,"x".repeat(256*1024+1)).checks.at(-1)?.code,"html_size_or_encoding");
});
test("generated four files use the shipped SDK interface and contain selected configuration, never the local HTML",()=>{
 const c=defaultSellerOnboardingConfig(),files=buildSellerOnboardingFiles(c);assert.deepEqual(files.map(f=>f.name),["pbp-onboarding.json","pbp-connect.mjs","PBP-SETUP.md","pbp-protocol-checklist.md"]);
 assert.deepEqual(JSON.parse(files[0].content),c);assert.match(files[1].content,/createSellerDomExecutor\(\{document,runId,forms:configuration.forms,result:configuration.result/u);assert.match(files[1].content,/allowLoopbackParent:false/u);assert.match(files[1].content,/installSellerBridge/u);assert.doesNotMatch(files[1].content,/\bfetch\s*\(|\beval\s*\(|new Function/u);assert.match(files[2].content,/not a working backend or a registered target/u);
});
test("generated connector drives one real SDK click and completion through the existing bridge; no fake network executor",async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),"pbp-onboarding-sdk-"));try{
  const c=defaultSellerOnboardingConfig();for(const[group,row]of Object.entries(c.forms))for(const key of Object.keys(row))(row as Record<string,string>)[key]="#"+group+"-"+key;c.result="#result";
  for(const f of buildSellerOnboardingFiles(c))await writeFile(path.join(dir,f.name),f.content);
  await copyFile(path.join(root,"public/sdk/seller-dom-adapter.mjs"),path.join(dir,"seller-dom-adapter.mjs"));await copyFile(path.join(root,"examples/seller-lifecycle-staging/frontend/bridge.mjs"),path.join(dir,"bridge.mjs"));
  const runner=`import assert from 'node:assert/strict';\nclass Field{tagName='INPUT';type='text';disabled=false;hidden=false;readOnly=false;internal='';dataset={};textContent='';parentElement=null;get value(){return this.internal;}set value(v){this.internal=v;}getClientRects(){return[{}];}dispatchEvent(){return true;}click(){this.onclick?.();}}\nclass Button extends Field{tagName='BUTTON';}\nconst config=${JSON.stringify(c)},nodes=new Map();for(const [group,row]of Object.entries(config.forms))for(const [name,selector]of Object.entries(row))nodes.set(selector,name==='submit'?new Button():new Field());const output=new Field();output.dataset={pbpSequence:'0',status:'unknown'};nodes.set('#result',output);let handler,clicks=0,network=0;const posted=[],parent={postMessage:(data,origin)=>posted.push({data,origin})};globalThis.location={search:'?run=12345678-1234-4234-8234-123456789abc',origin:'https://staging.seller.local'};globalThis.document={querySelectorAll:s=>nodes.has(s)?[nodes.get(s)]:[],defaultView:{HTMLInputElement:Field,Event:class{constructor(type){this.type=type;}}}};globalThis.window={location,parent,addEventListener(type,fn){if(type==='message')handler=fn;},removeEventListener(){}};globalThis.fetch=()=>{network++;throw new Error('network forbidden');};const connector=await import('./pbp-connect.mjs');assert.equal(connector.getPendingProofCommand(),undefined);assert.throws(()=>connector.completeProofOperation({requests:[],status:'success',message:'invented'}),/No ProofBeforePay/);nodes.get('#create-submit').onclick=()=>{clicks++;const command=connector.getPendingProofCommand();assert.equal(command.sequence,1);const receipt={id:'receipt-1'};assert.throws(()=>connector.completeProofOperation({command:{...command,sequence:2},requests:[],status:'success',message:'wrong command'}),/does not match/);connector.completeProofOperation({command,requests:[{method:'POST',path:'/pbp/bookings',key:'pbp-12345678-1234-4234-8234-123456789abc-lifecycle-cancel-create',request:{testRunId:'12345678-1234-4234-8234-123456789abc',marker:'PBP-12345678-1234-4234-8234-123456789abc',customer:'PBP synthetic',email:'pbp-test@example.invalid',partySize:5,slot:'2099-01-01T10:00:00Z'},status:201,response:receipt}],receipt,status:'success',message:'Native completed'});};const envelope={protocol:'pbp-seller-bridge-v1',runId:'12345678-1234-4234-8234-123456789abc',sessionNonce:'a'.repeat(64)};await handler({source:parent,origin:config.parentOrigin,data:{...envelope,type:'init',sequence:0}});assert.equal(posted[0].data.type,'ready');await handler({source:parent,origin:config.parentOrigin,data:{...envelope,type:'execute',sequence:1,actionId:'create',action:{type:'create',requestOperation:'cancel-create',partySize:5,slot:'2099-01-01T10:00:00Z'}}});assert.equal(clicks,1);assert.equal(network,0);assert.equal(posted[1].data.type,'observation');assert.equal(posted[1].data.ui.status,'success');assert.equal(posted[1].data.ui.fields.partySize,'5');assert.equal(connector.getPendingProofCommand(),undefined);assert.equal(posted[1].origin,config.parentOrigin);console.log('generated connector SDK/bridge smoke passed');`;
  await writeFile(path.join(dir,"runner.mjs"),runner);const run=spawnSync(process.execPath,[path.join(dir,"runner.mjs")],{encoding:"utf8",timeout:10000});assert.equal(run.status,0,run.stderr+run.stdout);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("CLI reads only explicit files, returns bounded diagnostics and rejects symlink inputs",async()=>{
 const dir=await mkdtemp(path.join(await realpath(tmpdir()),"pbp-onboarding-cli-"));try{const config=path.join(dir,"config.json"),html=path.join(dir,"index.html"),cli=path.join(root,"scripts/seller-onboarding-preflight.mjs");await writeFile(config,JSON.stringify(defaultSellerOnboardingConfig()));await writeFile(html,await sample());
 const run=(a:string[])=>spawnSync(process.execPath,["--experimental-strip-types",cli,...a],{encoding:"utf8",cwd:root,timeout:10000});const normal=run([config,html]);assert.equal(normal.status,0,normal.stderr);assert.equal(JSON.parse(normal.stdout).runtimeVerified,false);
 await symlink(html,path.join(dir,"linked.html"));const rejected=run([config,path.join(dir,"linked.html")]);assert.equal(rejected.status,2);assert.match(rejected.stderr,/symlink_input_rejected/u);
 await writeFile(html,'<p>No configured controls.</p>');const missing=run([config,html]);assert.equal(missing.status,1);assert.equal(JSON.parse(missing.stdout).staticMarkupReady,false);
 const wrong=run([config,html,"https://should-not-fetch.invalid"]);assert.equal(wrong.status,2);assert.match(wrong.stderr,/usage/u);
 }finally{await rm(dir,{recursive:true,force:true});}
});
