// Local CUA fixture for the actual source-visibility browser probe. This server
// has no accounts/providers/customer data and serves only its fictional files.
import {createServer} from "node:http";
import {mkdtemp,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {build} from "vite";
import {sourceVisibilityPlan,createSourceVisibilityReport} from "../lib/source-visibility.ts";
const repo=fileURLToPath(new URL("../",import.meta.url)),temp=await mkdtemp(path.join(tmpdir(),"pbp-source-visibility-browser-"));
const html='<!doctype html><html><head><title>Fictional citation observations</title><link rel="stylesheet" href="style.css"></head><body><nav class="old"><p>Old hours ten to six</p></nav><main><p>Current hours eleven to eight</p><div class="inherited-hidden"><p class="revealed">Explicitly restored visibility</p><p>Inherited hidden text</p></div><div class="transparent"><p class="revealed">Opacity ancestor suppresses text</p></div><div class="scroller"><p class="lower">Clipped in inner scroll container</p></div><div class="clip"><p>Clipped by zero height container</p></div><div inert><p>Inert but visually present text</p></div><script>document.body.dataset.executed="yes"</script></main></body></html>';
const css='body{font:16px sans-serif;margin:16px}.inherited-hidden{visibility:hidden}.revealed{visibility:visible}.transparent{opacity:0}.scroller{height:40px;overflow:auto}.lower{margin-top:200px}.clip{height:0;overflow:hidden}@media(min-width:800px){.old{display:none}}';
const texts=["Old hours ten to six","Current hours eleven to eight","Explicitly restored visibility","Inherited hidden text","Opacity ancestor suppresses text","Clipped in inner scroll container","Clipped by zero height container","Inert but visually present text"];
const files={"index.html":html,"style.css":css},quote={id:"fictional-visibility-project",proof:{delivery:{id:"fictional-visibility-delivery",variant:"upload",files,assessment:{id:"synthetic-browser-fixture",deliveryId:"fictional-visibility-delivery",items:[],risks:texts.map(text=>{const attributes=text==="Explicitly restored visibility"||text==="Opacity ancestor suppresses text"?' class="revealed"':text==="Clipped in inner scroll container"?' class="lower"':"",excerpt=`<p${attributes}>${text}</p>`,start=html.indexOf(excerpt);return{title:text,citations:[{file:"index.html",start,end:start+excerpt.length,excerpt}]};})}}}};
const plan=await sourceVisibilityPlan(quote),entry=path.join(temp,"entry.js");
await writeFile(entry,`import {runSourceVisibility}from ${JSON.stringify(path.join(repo,"lib/source-visibility-probe.ts"))};const data=await(await fetch('/fixture.json')).json();document.querySelector('button').onclick=async()=>{const button=document.querySelector('button');button.disabled=true;try{const readings=await runSourceVisibility(data.quote,data.plan,new AbortController().signal,(done,total)=>document.querySelector('#progress').textContent=done+'/'+total);const response=await fetch('/result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({deliveryId:data.plan.deliveryId,assessmentId:data.plan.assessmentId,previousReportId:null,readings})});const report=await response.json();document.querySelector('pre').textContent=JSON.stringify(report,null,2);document.querySelector('#status').textContent=response.ok?'Saved fixture observation':'Fixture validation failed';}catch(error){document.querySelector('#status').textContent=String(error);}finally{button.disabled=false;}};`);
const built=await build({root:repo,configFile:false,logLevel:"error",build:{write:false,minify:false,target:"es2022",rollupOptions:{input:entry}}});
const js=built.output.find(asset=>asset.type==="chunk"&&asset.isEntry).code;
let result;
const server=createServer(async(req,res)=>{
 try{
  if(req.url==="/"){res.setHeader("Content-Type","text/html; charset=utf-8");res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Source visibility browser QA</title><style>body{font:15px system-ui;max-width:1000px;margin:30px auto;padding:0 15px}button{padding:12px}pre{white-space:pre-wrap;font-size:12px}#status{font-weight:600}</style></head><body><h1>Source quotation → real static layout</h1><p>Fictional local-only CUA fixture. No AI call, project acceptance, payment or deployment attestation.</p><p>Eight quotations at two widths. Expected: mobile old hours visible; desktop old hours hidden; restored child visibility visible; opacity and inherited visibility hidden; inner clipping unavailable; inert text visually present.</p><button>Run actual browser observations</button><span id="progress"></span><p id="status">Ready</p><pre></pre><script type="module" src="/probe.js"></script></body></html>');return;}
  if(req.url==="/probe.js"){res.setHeader("Content-Type","text/javascript; charset=utf-8");res.end(js);return;}
  if(req.url==="/fixture.json"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({quote,plan}));return;}
  if(req.url==="/result"&&req.method==="POST"){
   let body="";for await(const chunk of req){body+=chunk;if(body.length>20000)throw new Error("fixture request too large");}
   const saved=await createSourceVisibilityReport(quote,"buyer",JSON.parse(body));result={scope:{localFictionalFixture:true,actualBrowserProbe:true,liveModel:false,payment:false},...saved};await writeFile(path.join(temp,"result.json"),JSON.stringify(result,null,2));res.setHeader("Content-Type","application/json");res.end(JSON.stringify(result));return;
  }
  const prefix=`/deliveries/${quote.id}/${quote.proof.delivery.id}/`,name=req.url?.startsWith(prefix)?req.url.slice(prefix.length):undefined;
  if(name&&Object.hasOwn(files,name)){res.setHeader("Content-Type",name.endsWith(".css")?"text/css; charset=utf-8":"text/html; charset=utf-8");res.setHeader("X-ProofBeforePay-Delivery",quote.proof.delivery.id);res.setHeader("Content-Security-Policy","sandbox allow-same-origin; default-src 'none'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'; form-action 'none'; base-uri 'none'");res.end(files[name]);return;}
  res.statusCode=404;res.end("Not in fixture");
 }catch(error){res.statusCode=400;res.setHeader("Content-Type","application/json");res.end(JSON.stringify({error:String(error)}));}
});
server.listen(0,"127.0.0.1",()=>console.log(JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,resultPath:path.join(temp,"result.json"),ownedPid:process.pid})));
for(const signal of["SIGTERM","SIGINT"])process.once(signal,()=>server.close(()=>process.exit(0)));
