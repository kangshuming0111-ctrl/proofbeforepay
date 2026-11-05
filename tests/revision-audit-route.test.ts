import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";
import {bundleFixture,bundleAt} from "./evidence-bundle-fixtures.ts";
import {snapshotVersion} from "../lib/proof-workflow.ts";
import {verifyRevisionAudit,type RevisionAudit} from "../lib/revision-audit.ts";

/** Actual new GET and export-store code over an isolated real SQLite database.
 * Existing platform membership/archive readers and current-bundle loader are
 * controlled adapters. This is not a Cloudflare D1 or hosted-account test. */
test("revision GET preserves participant authorization, retained old bytes and final SQL guards",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"pbp-revision-route-")),db=new DatabaseSync(":memory:");
 const old=await bundleFixture({deliverySequence:1}),fresh=await bundleFixture({deliverySequence:2}),archived=snapshotVersion(old.quote,bundleAt);
 db.exec("CREATE TABLE quotes(id TEXT PRIMARY KEY,version INTEGER,owner_id TEXT,seller_id TEXT,payload TEXT); CREATE TABLE proof_versions(id TEXT PRIMARY KEY,quote_id TEXT,payload TEXT); CREATE TABLE report_heads(quote_id TEXT,head INTEGER);");
 db.prepare("INSERT INTO quotes VALUES(?,?,?,?,?)").run(fresh.quote.id,7,"buyer-fixture","seller-fixture",JSON.stringify(fresh.quote));db.prepare("INSERT INTO proof_versions VALUES(?,?,?)").run(`${fresh.quote.id}:${archived.delivery.id}`,fresh.quote.id,JSON.stringify(archived));db.prepare("INSERT INTO report_heads VALUES(?,?)").run(fresh.quote.id,1);
 type State={db:DatabaseSync;change:"none"|"quote"|"member"|"report";reads:string[];signingKey:string|undefined;bundleLoads:number;};
 const state:State={db,change:"none",reads:[],signingKey:"controlled-test-config-present",bundleLoads:0};
 const globals=globalThis as typeof globalThis&{__pbpRevisionRouteState?:State};globals.__pbpRevisionRouteState=state;
 const modules={
  env:`export const env={get PBP_EVIDENCE_SIGNING_PKCS8(){return globalThis.__pbpRevisionRouteState.signingKey;},DB:{prepare(sql){return{bind(...values){return{async first(){return globalThis.__pbpRevisionRouteState.db.prepare(sql).get(...values)||null;}};}};}}};`,
  proof:`export function proofActor(request){const id=request.headers.get('x-local-test-actor')||'';return{id,email:'',authenticated:!!id};}
   export async function readProofCase(id,actor){const s=globalThis.__pbpRevisionRouteState,row=s.db.prepare('SELECT * FROM quotes WHERE id=? AND (owner_id=? OR seller_id=?)').get(id,actor.id,actor.id);if(!row)throw Object.assign(new Error('Project not found.'),{status:404});return{quote:JSON.parse(row.payload),version:row.version,buyerId:row.owner_id,sellerId:row.seller_id,role:row.owner_id===actor.id?'buyer':'seller',supplementalGuard:{sql:'(SELECT count(*) FROM report_heads WHERE quote_id = ?) = ?',bindings:[id,1]}};}
   export async function listProofVersions(record){const rows=globalThis.__pbpRevisionRouteState.db.prepare('SELECT payload FROM proof_versions WHERE quote_id=?').all(record.quote.id);return[...rows.map(r=>JSON.parse(r.payload)),{isCurrent:true,delivery:structuredClone(record.quote.proof.delivery),feedback:[],archivedAt:'${bundleAt}'}];}
   export async function readProofVersion(record,id){const s=globalThis.__pbpRevisionRouteState;s.reads.push(id);if(id===record.quote.proof.delivery.id)return{isCurrent:true,delivery:structuredClone(record.quote.proof.delivery),feedback:[],archivedAt:'${bundleAt}'};const row=s.db.prepare('SELECT payload FROM proof_versions WHERE id=? AND quote_id=?').get(record.quote.id+':'+id,record.quote.id);if(!row)throw Object.assign(new Error('Delivery version not found.'),{status:404});return JSON.parse(row.payload);}`,
  bundle:`import {createEvidenceBundle} from ${JSON.stringify(new URL("../lib/evidence-bundle.ts",import.meta.url).href)};import {createEvidenceExport} from ${JSON.stringify(new URL("../lib/evidence-export.ts",import.meta.url).href)};import {buildSupplementalEvidenceCatalog} from ${JSON.stringify(new URL("../lib/supplemental-evidence.ts",import.meta.url).href)};export async function exportEvidenceBundle(record){globalThis.__pbpRevisionRouteState.bundleLoads++;const core=await createEvidenceExport(record.quote),catalog=await buildSupplementalEvidenceCatalog(core.delivery.id,core.fileDigest,[]),bundle=await createEvidenceBundle(record.quote,{catalog,objects:[]}),s=globalThis.__pbpRevisionRouteState;if(s.change==='quote')s.db.prepare('UPDATE quotes SET version=version+1 WHERE id=?').run(record.quote.id);if(s.change==='member')s.db.prepare('UPDATE quotes SET owner_id=?,seller_id=? WHERE id=?').run('other','other',record.quote.id);if(s.change==='report')s.db.prepare('INSERT INTO report_heads VALUES(?,?)').run(record.quote.id,2);return bundle;}`,
  issuer:`export async function issueRevisionAudit(audit){return{schema:"controlled-test-issued-audit",audit,receipt:{controlled:true}};}`,
  server:`export class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}export async function handle(action){try{return await action();}catch(error){return Response.json({error:error.message},{status:error.status||500});}}export function json(value,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}`,
 };
 try{
  const urls:Record<string,string>={};for(const [name,source]of Object.entries(modules)){const filename=join(dir,`${name}.mjs`);await writeFile(filename,source);urls[name]=pathToFileURL(filename).href;}
  let store=ts.transpileModule(await readFile(new URL("../lib/revision-audit-store.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  store=store.replaceAll('"cloudflare:workers"',JSON.stringify(urls.env)).replaceAll('"./proof-store"',JSON.stringify(urls.proof)).replaceAll('"./evidence-bundle-store"',JSON.stringify(urls.bundle)).replace(/"\.\/([^"/]+\.ts)"/gu,(_all,name:string)=>JSON.stringify(new URL(`../lib/${name}`,import.meta.url).href));
  const storePath=join(dir,"store.mjs");await writeFile(storePath,store);
  let route=ts.transpileModule(await readFile(new URL("../app/api/proofs/[id]/revision-audit/route.ts",import.meta.url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  route=route.replaceAll('"@/lib/proof-store"',JSON.stringify(urls.proof)).replaceAll('"@/lib/revision-audit-store"',JSON.stringify(pathToFileURL(storePath).href)).replaceAll('"@/lib/server"',JSON.stringify(urls.server)).replaceAll('"cloudflare:workers"',JSON.stringify(urls.env)).replaceAll('"@/lib/issued-revision-audit"',JSON.stringify(urls.issuer));
  const routePath=join(dir,"route.mjs");await writeFile(routePath,route);const {GET}=await import(pathToFileURL(routePath).href)as{GET:(request:Request,context:{params:Promise<{id:string}>})=>Promise<Response>};
  const call=(actor:string|undefined,query="")=>GET(new Request(`https://local-test.invalid/api/proofs/${fresh.quote.id}/revision-audit${query}`,{headers:actor?{"x-local-test-actor":actor}:{}}),{params:Promise.resolve({id:fresh.quote.id})});
  assert.equal((await call(undefined)).status,401);assert.equal((await call("outsider-fixture")).status,404);
  for(const actor of ["buyer-fixture","seller-fixture"]){const response=await call(actor);assert.equal(response.status,200);assert.equal(response.headers.get("Cache-Control"),"no-store");const issued=await response.json()as{schema:string;audit:RevisionAudit},audit=issued.audit;assert.equal(issued.schema,"controlled-test-issued-audit");assert.equal((await verifyRevisionAudit(audit)).consistency,"consistent");const oldEvidence=audit.versions[0].evidence,newEvidence=audit.versions[1].evidence;assert.ok(oldEvidence.schema==="proofbeforepay-evidence-export-v1");assert.ok(newEvidence.schema==="proofbeforepay-evidence-bundle-v2");assert.deepEqual(oldEvidence.delivery.files,archived.delivery.files);assert.equal(newEvidence.core.delivery.id,fresh.quote.proof.delivery!.id);}
  assert.ok(state.reads.includes(archived.delivery.id));const loaded=state.bundleLoads;state.signingKey=undefined;assert.equal((await call("buyer-fixture")).status,503);assert.equal((await call("outsider-fixture")).status,404);assert.equal(state.bundleLoads,loaded);state.signingKey="controlled-test-config-present";
  assert.equal((await call("buyer-fixture",`?deliveryId=${archived.delivery.id}&deliveryId=${archived.delivery.id}`)).status,400);
  assert.equal((await call("buyer-fixture",`?deliveryId=unknown-version&deliveryId=${fresh.quote.proof.delivery!.id}`)).status,404);
  assert.equal((await call("buyer-fixture","?unknown=true")).status,400);
  const rowId=`${fresh.quote.id}:${archived.delivery.id}`,withoutFiles=structuredClone(archived);delete withoutFiles.delivery.files;db.prepare("UPDATE proof_versions SET payload=? WHERE id=?").run(JSON.stringify(withoutFiles),rowId);assert.equal((await call("buyer-fixture")).status,409);db.prepare("UPDATE proof_versions SET payload=? WHERE id=?").run(JSON.stringify(archived),rowId);
  for(const change of ["quote","member","report"]as const){state.change=change;assert.equal((await call("buyer-fixture")).status,409,change);db.prepare("UPDATE quotes SET version=?,owner_id=?,seller_id=? WHERE id=?").run(7,"buyer-fixture","seller-fixture",fresh.quote.id);db.prepare("DELETE FROM report_heads WHERE head=2").run();}state.change="none";
  db.prepare("DELETE FROM proof_versions").run();assert.equal((await call("buyer-fixture")).status,409);
 }finally{delete globals.__pbpRevisionRouteState;db.close();await rm(dir,{recursive:true,force:true});}
});
