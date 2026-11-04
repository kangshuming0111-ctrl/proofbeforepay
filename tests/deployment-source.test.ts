import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {createDeploymentSourcePlan,readDeploymentSourceFile,validateDeploymentSourcePlan,validateDeploymentSourceSession,type DeploymentSourceSession} from "../lib/deployment-source.ts";
import type {JourneyRegistrationSnapshot} from "../lib/project-journey.ts";
const registration:JourneyRegistrationSnapshot={id:"seller-stage",label:"Approved test stage",projectId:"project-1",registrationRevision:"operator-2",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:"https://stage.example.org/site/workshop.html",backendBaseUrl:"https://stage.example.org/pbp/",deploymentRevision:"native-4",bridgeRevision:"lifecycle-fixed-v1",frontendBundleDigest:"a".repeat(64),scenario:"fixed",expiresAt:"2030-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
const files={"index.html":"<!doctype html><html><head><link rel=stylesheet href=style.css></head><body>Open 11–20</body></html>","style.css":"body{color:#123}"};
const plan=()=>createDeploymentSourcePlan({projectId:"project-1",deliveryId:"delivery-1",deliveryDigest:"a".repeat(64),entryFile:"index.html",registration,files});

test("deployment plan maps only saved files below the exact approved directory and detects entry collisions",async()=>{
 const p=await plan();assert.deepEqual(p.files.map(f=>[f.file,f.url]),[["index.html","https://stage.example.org/site/workshop.html"],["style.css","https://stage.example.org/site/style.css"]]);assert.equal(p.files[0].bytes,new TextEncoder().encode(files["index.html"]).length);await validateDeploymentSourcePlan(p);
 await assert.rejects(createDeploymentSourcePlan({projectId:"project-1",deliveryId:"delivery-1",deliveryDigest:"a".repeat(64),entryFile:"index.html",registration,files:{...files,"workshop.html":"other"}}),/same deployment URL/u);
 for(const name of ["../private.css","/private.css","%2e%2e/private.css","a\\b.css"]){await assert.rejects(createDeploymentSourcePlan({projectId:"project-1",deliveryId:"delivery-1",deliveryDigest:"a".repeat(64),entryFile:"index.html",registration,files:{...files,[name]:"x"}}));}
 const changed=structuredClone(p);changed.files[1].url="https://stage.example.org/admin";await assert.rejects(validateDeploymentSourcePlan(changed));
 const target=structuredClone(p);target.registration.frontendEntryUrl="https://other.example.org/site/workshop.html";await assert.rejects(validateDeploymentSourcePlan(target));
});

test("independent GETs distinguish exact UTF8 bytes, rewritten bytes, redirects and unavailable data without credentials or retries",async()=>{
 const p=await plan(),file=p.files[0],requests:{url:string;init:RequestInit}[]=[];
 const read=(body:string,headers:Record<string,string>={"content-type":"text/html"},status=200)=>readDeploymentSourceFile(file,{fetch:async(url,init)=>{requests.push({url,init});return new Response(body,{status,headers});}});
 const exact=await read(files["index.html"]);assert.equal(exact.outcome,"matched");assert.equal(exact.sha256,file.sha256);assert.equal((await read(files["index.html"]+"\n")).outcome,"mismatch");
 assert.equal((await read("redirect",{"location":"https://unapproved.example.org/","content-type":"text/html"},302)).reason,"redirect_blocked");assert.equal((await read("<html>no</html>",{"content-type":"text/plain"})).reason,"content_type");assert.equal((await read("missing",{"content-type":"text/html"},404)).reason,"http_status");
 for(const r of requests){assert.equal(r.url,file.url);assert.equal(r.init.method,"GET");assert.equal(r.init.redirect,"manual");assert.equal(r.init.credentials,"omit");assert.equal(r.init.body,undefined);assert.equal(new Headers(r.init.headers).has("Authorization"),false);}
 assert.equal(requests.length,5);
});

test("stream bounds and deadlines remain effective without content-length or cooperative fetch cancellation",async()=>{
 const f=(await plan()).files[0];let calls=0,cancelled=false;
 const huge=await readDeploymentSourceFile(f,{fetch:async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(65537));},cancel(){cancelled=true;}}),{headers:{"content-type":"text/html"}})});assert.equal(huge.reason,"response_too_large");assert.equal(cancelled,true);
 const timeout=await readDeploymentSourceFile(f,{timeoutMs:10,fetch:async()=>{calls++;return new Promise(()=>{});}});assert.equal(timeout.reason,"read_timeout");assert.equal(calls,1);
 const redirected=await readDeploymentSourceFile(f,{fetch:async()=>{const r=new Response(files["index.html"],{headers:{"content-type":"text/html"}});Object.defineProperty(r,"url",{value:"https://other.example.org/"});return r;}});assert.equal(redirected.reason,"redirect_blocked");
});

test("persisted result derivation refuses altered plan, invented match, omitted unknowns and cross-delivery metadata",async()=>{
 const p=await plan(),at="2026-11-04T10:00:00.000Z",readings=await Promise.all(p.files.map(f=>readDeploymentSourceFile(f,{now:()=>Date.parse(at),fetch:async()=>new Response(files[f.file as keyof typeof files],{headers:{"content-type":f.kind==="html"?"text/html":"text/css"}})})));
 const s:DeploymentSourceSession={id:crypto.randomUUID(),projectId:p.projectId,deliveryId:p.deliveryId,deliveryDigest:p.deliveryDigest,createdBy:"buyer-1",createdAt:at,updatedAt:at,expiresAt:"2026-11-04T10:00:30.000Z",version:4,status:"complete",plan:p,readings};await validateDeploymentSourceSession(s);
 for(const badStatus of [["complete"],{toString:"complete"},true,null]){const invalid:any=structuredClone(s);invalid.status=badStatus;await assert.rejects(validateDeploymentSourceSession(invalid));}
 for(const badOutcome of [["matched"],{toString:"matched"},true,null]){const invalid:any=structuredClone(s);invalid.readings[0].outcome=badOutcome;invalid.readings[0].sha256="b".repeat(64);await assert.rejects(validateDeploymentSourceSession(invalid));}
 const tampered=structuredClone(s);tampered.readings[0].sha256="b".repeat(64);await assert.rejects(validateDeploymentSourceSession(tampered));const omitted=structuredClone(s);omitted.readings.pop();await assert.rejects(validateDeploymentSourceSession(omitted));const other=structuredClone(s);other.deliveryId="delivery-2";await assert.rejects(validateDeploymentSourceSession(other));const expected=structuredClone(s);expected.plan.files[0].sha256="b".repeat(64);await assert.rejects(validateDeploymentSourceSession(expected));
});

test("actual finite HTTP transport returns one matching and one independently changed static asset",async()=>{
 const p=await plan(),seen:string[]=[];const server=createServer((req,res)=>{seen.push(req.url!);res.setHeader("content-type",req.url?.endsWith(".css")?"text/css":"text/html");res.end(req.url?.endsWith(".css")?"body{color:red}":files["index.html"]);});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
 try{const address=server.address() as {port:number};const transport=async(url:string,init:RequestInit)=>{const allowed=p.files.find(f=>f.url===url);assert.ok(allowed);const r=await fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}`,init);return new Response(r.body,{headers:r.headers,status:r.status});};const a=await readDeploymentSourceFile(p.files[0],{fetch:transport}),b=await readDeploymentSourceFile(p.files[1],{fetch:transport});assert.equal(a.outcome,"matched");assert.equal(b.outcome,"mismatch");assert.deepEqual(seen,["/site/workshop.html","/site/style.css"]);}finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});
