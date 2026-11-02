import assert from "node:assert/strict";
import test from "node:test";
import {spawnSync} from "node:child_process";
import {link,mkdir,mkdtemp,readFile,realpath,rm,stat,symlink,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {encodeRasterDataUrl} from "../lib/static-resources.ts";
import {validateStaticFiles} from "../lib/static-project.ts";
import {validateRuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

const root=fileURLToPath(new URL("../",import.meta.url)),cli=path.join(root,"scripts/create-runtime-registration.mjs");
const HTML="<!doctype html><html><head><title>Owned staging handoff</title></head><body>Fictional test frontend.</body></html>";
const CSS="body { color: #294b3b; }\n";
const PNG="iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNIm1meNrOcAUIBACiyBdnemS6wAAAAAElFTkSuQmCC";
async function fixture(){const dir=await realpath(await mkdtemp(path.join(tmpdir(),"pbp-registration-"))),folder=path.join(dir,"frontend");await mkdir(folder);await writeFile(path.join(folder,"index.html"),HTML);return{dir,folder};}
function args(folder:string,extra:Record<string,string>={}){
 const values={"project-id":"owned-project-1","target-id":"owned-booking-1",label:"Owned fictional staging","base-url":"https://staging.example.org/pbp-test/","deployment-revision":"build-01","registration-revision":"approval-01","expires-at":new Date(Date.now()+3600_000).toISOString(),"frontend-folder":folder,...extra};
 return Object.entries(values).flatMap(([k,v])=>[`--${k}`,v]);
}
function run(input:string[]){return spawnSync(process.execPath,["--experimental-strip-types",cli,...input],{cwd:root,encoding:"utf8",timeout:15000,env:{NODE_ENV:"test",NODE_NO_WARNINGS:"1",SYNTHETIC_PRIVATE_KEY:"DO_NOT_EXPORT_ENV"}});}
test("CLI hashes the exact browser HTML/CSS/raster map and returns an uninstalled local proposal",async()=>{
 const f=await fixture();try{
  await mkdir(path.join(f.folder,"assets"));await writeFile(path.join(f.folder,"assets/site.css"),CSS);const image=Buffer.from(PNG,"base64");await writeFile(path.join(f.folder,"assets/shop.png"),image);
  const result=run(args(f.folder,{"backend-artifact-digest":"b".repeat(64),"backend-source-commit":"c".repeat(40)}));assert.equal(result.status,0,result.stderr);
  const proposal=JSON.parse(result.stdout),expected=await runtimeDeliveryDigest(validateStaticFiles({"index.html":HTML,"assets/site.css":CSS,"assets/shop.png":encodeRasterDataUrl("assets/shop.png",image)}));
  assert.equal(proposal.status,"proposal-awaiting-operator-review");assert.equal(proposal.operatorApprovalRecorded,false);assert.equal(proposal.installed,false);assert.equal(proposal.candidate.protocol,"booking-http-v2");assert.equal(proposal.candidate.frontendBundleDigest,expected);assert.equal(proposal.candidate.backendArtifactDigest,"b".repeat(64));assert.equal(proposal.candidate.backendSourceCommit,"c".repeat(40));
  assert.deepEqual(validateRuntimeRegistrationSnapshot(proposal.candidate),proposal.candidate);assert.deepEqual(proposal.frontend.files,["assets/shop.png","assets/site.css","index.html"]);assert.equal(proposal.frontend.fileCount,3);
  assert.ok(!result.stdout.includes(HTML));assert.ok(!result.stdout.includes(PNG));assert.ok(!result.stdout.includes("DO_NOT_EXPORT_ENV"));assert.equal(await readFile(path.join(f.folder,"index.html"),"utf8"),HTML);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test("CLI creates owner-only new output and never overwrites an existing file or symlink",async()=>{
 const f=await fixture();try{
  const output=path.join(f.dir,"proposal.json"),request=args(f.folder,{output,protocol:"booking-http-v1"});const first=run(request);assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(await readFile(output,"utf8")).candidate.protocol,"booking-http-v1");assert.equal((await stat(output)).mode&0o777,0o600);
  const previous=await readFile(output,"utf8");assert.notEqual(run(request).status,0);assert.equal(await readFile(output,"utf8"),previous);
  const external=path.join(f.dir,"external.txt"),alias=path.join(f.dir,"alias.json");await writeFile(external,"KEEP_ORIGINAL");await symlink(external,alias);assert.notEqual(run(args(f.folder,{output:alias})).status,0);assert.equal(await readFile(external,"utf8"),"KEEP_ORIGINAL");
  assert.notEqual(run(args(f.folder,{output:path.join(f.folder,"proposal.json")})).status,0);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test("private/hidden entries and symbolic or hard links are rejected without exposing outside content",async()=>{
 for(const kind of ["env","private-html","git","file-symlink","folder-symlink","hard-link"]){
  const f=await fixture();try{
   const outside=path.join(f.dir,"outside.html");await writeFile(outside,"DO_NOT_READ_OR_PRINT_OUTSIDE_CANARY");
   if(kind==="env")await writeFile(path.join(f.folder,".env"),"DO_NOT_READ_OR_PRINT_ENV_CANARY");
   if(kind==="private-html")await writeFile(path.join(f.folder,"secret.html"),"DO_NOT_READ_OR_PRINT_SECRET_CANARY");
   if(kind==="git")await mkdir(path.join(f.folder,".git"));
   if(kind==="file-symlink")await symlink(outside,path.join(f.folder,"alias.html"));
   if(kind==="folder-symlink")await symlink(f.dir,path.join(f.folder,"linked"));
   if(kind==="hard-link")await link(outside,path.join(f.folder,"linked.html"));
   const result=run(args(f.folder));assert.notEqual(result.status,0,kind);assert.equal(result.stdout,"");assert.ok(!(result.stderr+result.stdout).includes("DO_NOT_READ_OR_PRINT"));assert.equal(await readFile(outside,"utf8"),"DO_NOT_READ_OR_PRINT_OUTSIDE_CANARY");
  }finally{await rm(f.dir,{recursive:true,force:true});}
 }
 const f=await fixture();try{const alias=path.join(f.dir,"frontend-alias");await symlink(f.folder,alias);assert.notEqual(run(args(alias)).status,0);}finally{await rm(f.dir,{recursive:true,force:true});}
});
test("unsupported, malformed and oversized inputs reject rather than silently hashing a partial export",async()=>{
 for(const kind of ["script","oversize","invalid-utf8","raster","missing-index","too-many"]){
  const f=await fixture();try{
   if(kind==="script")await writeFile(path.join(f.folder,"app.js"),"throw new Error('THIS_MUST_NEVER_EXECUTE')");
   if(kind==="oversize")await writeFile(path.join(f.folder,"large.css"),"x".repeat(65537));
   if(kind==="invalid-utf8")await writeFile(path.join(f.folder,"bad.html"),Buffer.from([0xff,0xfe]));
   if(kind==="raster")await writeFile(path.join(f.folder,"bad.png"),"not an image");
   if(kind==="missing-index")await rm(path.join(f.folder,"index.html"));
   if(kind==="too-many")for(let i=0;i<40;i++)await writeFile(path.join(f.folder,`file-${i}.css`),"body{}");
   const result=run(args(f.folder));assert.notEqual(result.status,0,kind);assert.equal(result.stdout,"");assert.ok(!result.stderr.includes("THIS_MUST_NEVER_EXECUTE"));
  }finally{await rm(f.dir,{recursive:true,force:true});}
 }
});
test("invalid metadata, expiry, URL or duplicate flags fail without reading the named folder",async()=>{
 const absent=path.join(await realpath(tmpdir()),"frontend-folder-does-not-exist");
 const patches:Record<string,string>[]=[{"project-id":"../other"},{"target-id":"lab-shadow"},{"base-url":"http://staging.example.org/pbp-test/"},{"base-url":"https://127.0.0.1/pbp-test/"},{"base-url":"https://user:password@staging.example.org/pbp-test/"},{"base-url":"https://staging.example.org/pbp-test/?token=private"},{"base-url":"https://staging.example.org/pbp-test"},{"expires-at":"2026-01-01T00:00:00.000Z"},{"expires-at":"2099-01-01T00:00:00Z"},{protocol:"arbitrary-script"},{"backend-artifact-digest":"invalid"}];
 for(const patch of patches){const result=run(args(absent,patch));assert.notEqual(result.status,0);assert.equal(result.stdout,"");assert.ok(!result.stderr.includes("ENOENT"),result.stderr);assert.ok(!result.stderr.includes("user:password"));}
 assert.notEqual(run([...args(absent),"--project-id","duplicate"]).status,0);assert.notEqual(run([...args(absent),"--unknown","value"]).status,0);
});
