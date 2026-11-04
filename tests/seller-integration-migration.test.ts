import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
const migration=(name:string)=>readFileSync(new URL(`../drizzle/${name}`,import.meta.url),"utf8");
const earlier=["0000_flashy_master_chief.sql","0001_low_chimera.sql","0002_flawless_lake.sql"];
test("staging application migration upgrades an existing database without changing projects, versions or original requirement drafts",()=>{
 const db=new DatabaseSync(":memory:");try{
  for(const name of earlier)db.exec(migration(name));
  db.prepare("INSERT INTO quotes (id,owner_id,seller_id,payload,version,updated_at) VALUES (?,?,?,?,?,?)").run("existing-project","buyer","seller",'{"retained":"frozen-evidence"}',17,"2026-11-03");
  db.prepare("INSERT INTO proof_versions (id,quote_id,payload,archived_at) VALUES (?,?,?,?)").run("old-delivery","existing-project",'{"exact":"old bytes"}',"2026-11-02");
  db.prepare("INSERT INTO requirement_drafts (id,owner_id,payload,created_at) VALUES (?,?,?,?)").run("original-source","buyer",'{"source":"original requirements"}',"2026-11-01");
  const before=["quotes","proof_versions","requirement_drafts"].map(table=>db.prepare(`SELECT * FROM ${table}`).all());
  db.exec(migration("0003_seller_integration_requests.sql"));
  assert.deepEqual(["quotes","proof_versions","requirement_drafts"].map(table=>db.prepare(`SELECT * FROM ${table}`).all()),before);
  assert.equal(db.prepare("SELECT count(*) AS count FROM seller_integration_requests").get()!.count,0);
  assert.ok(db.prepare("PRAGMA index_list(seller_integration_requests)").all().some(item=>item.name==="seller_integration_quote_idx"));
 }finally{db.close();}
});
test("fresh schema keeps operational staging requests outside acceptance and financial project records",()=>{
 const db=new DatabaseSync(":memory:");try{
  for(const name of[...earlier,"0003_seller_integration_requests.sql"])db.exec(migration(name));
  const columns=db.prepare("PRAGMA table_info(seller_integration_requests)").all().map(item=>item.name);assert.deepEqual(columns,["id","quote_id","delivery_id","delivery_digest","submitted_by","payload","version","created_at","updated_at"]);
  db.prepare("INSERT INTO seller_integration_requests VALUES (?,?,?,?,?,?,?,?,?)").run("application","project","delivery","a".repeat(64),"seller",'{"status":"requested"}',1,"start","start");
  assert.equal(db.prepare("SELECT count(*) AS count FROM quotes").get()!.count,0);assert.throws(()=>db.prepare("INSERT INTO seller_integration_requests VALUES (?,?,?,?,?,?,?,?,?)").run("application","project","delivery","a".repeat(64),"seller","{}",1,"start","start"),/UNIQUE/);
 }finally{db.close();}
});
