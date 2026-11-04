import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
const old=["0000_flashy_master_chief","0001_low_chimera","0002_flawless_lake","0003_seller_integration_requests"],sql=(name:string)=>readFileSync(new URL(`../drizzle/${name}.sql`,import.meta.url),"utf8");
test("witness migration upgrades existing projects and operator staging decisions without rewriting evidence or consent",()=>{
 const db=new DatabaseSync(":memory:");try{for(const name of old)db.exec(sql(name));db.prepare("INSERT INTO quotes (id,owner_id,payload,version,updated_at) VALUES (?,?,?,?,?)").run("project","buyer",'{"frozen":"acceptance-A"}',7,"old");db.prepare("INSERT INTO seller_integration_requests VALUES (?,?,?,?,?,?,?,?,?)").run("approved","project","delivery","a".repeat(64),"seller",'{"approved":"original"}',2,"start","end");const before=["quotes","proof_versions","requirement_drafts","seller_integration_requests"].map(t=>db.prepare(`SELECT * FROM ${t}`).all());db.exec(sql("0004_browser_witness_sessions"));assert.deepEqual(["quotes","proof_versions","requirement_drafts","seller_integration_requests"].map(t=>db.prepare(`SELECT * FROM ${t}`).all()),before);assert.equal(db.prepare("SELECT count(*) n FROM browser_witness_sessions").get()!.n,0);assert.ok(db.prepare("PRAGMA index_list(browser_witness_sessions)").all().some(row=>row.name==="browser_witness_quote_idx"));}finally{db.close();}
});
