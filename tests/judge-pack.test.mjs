import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readdir, readFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { buildJudgePack, collectPublicSource } from "../scripts/build-judge-pack.mjs";

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), "proof-judge-pack-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = path.join(base, "repo");
  await mkdir(path.join(root, "lib"), { recursive: true });
  await writeFile(path.join(root, "package.json"), '{"name":"synthetic-test"}\n');
  await writeFile(path.join(root, "lib/flow.ts"), "export const synthetic = true;\n");
  return { base, root };
}

test("judge export uses an allowlist and never copies runtime state or pre-existing outputs", async t => {
  const { root } = await fixture(t);
  for (const name of [".git", ".wrangler", "outputs", "node_modules"]) {
    await mkdir(path.join(root, name));
    await writeFile(path.join(root, name, "private.txt"), "synthetic private state");
  }
  await writeFile(path.join(root, ".dev.vars"), "SYNTHETIC_SECRET=do-not-copy");
  await writeFile(path.join(root, "personal-notes.md"), "outside allowlist");
  assert.deepEqual((await collectPublicSource(root)).map(entry => entry.relative), ["lib/flow.ts", "package.json"]);
});

test("judge export preserves explicit TypeScript module sources needed by clean-checkout imports", async t => {
  const { root, base } = await fixture(t);
  await writeFile(path.join(root, "lib/connector-contract.mts"), "export const protocol = 'synthetic';\n");
  await writeFile(path.join(root, "lib/connector-errors.cts"), "export type ErrorCode = 'synthetic';\n");
  const result = await buildJudgePack(root, path.join(base, "export"));
  const manifest = JSON.parse(await readFile(result.manifest, "utf8"));
  const archive = spawnSync("tar", ["-tzf", result.archive], {encoding: "utf8"});
  assert.equal(archive.status, 0);
  for (const file of ["lib/connector-contract.mts", "lib/connector-errors.cts"]) {
    assert.ok(manifest.files.some(entry => entry.file === file));
    assert.ok(archive.stdout.split("\n").includes(`./${file}`));
    assert.equal(await readFile(path.join(result.sourceDirectory, file), "utf8"), await readFile(path.join(root, file), "utf8"));
  }
});

test("judge export includes the enquiry native-service modules and migration without broadly admitting other examples", async t => {
  const {root,base}=await fixture(t),directory="examples/seller-enquiry-staging";
  const sources=new Map([
    [`${directory}/worker/enquiry-service.mjs`,"export const syntheticEnquiryService = true;\n"],
    [`${directory}/worker/index.js`,"export {syntheticEnquiryService} from './enquiry-service.mjs';\n"],
    [`${directory}/migrations/0001_enquiries.sql`,"CREATE TABLE synthetic_enquiries (id TEXT PRIMARY KEY);\n"],
    [`${directory}/README.md`,"# Synthetic enquiry staging reference\n"],
  ]);
  for(const [name,text]of sources){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),text);}
  await mkdir(path.join(root,"examples/unrelated-private"),{recursive:true});await writeFile(path.join(root,"examples/unrelated-private/client-notes.md"),"outside the exact source allowlist\n");
  const result=await buildJudgePack(root,path.join(base,"enquiry-export")),manifest=JSON.parse(await readFile(result.manifest,"utf8")),archive=spawnSync("tar",["-tzf",result.archive],{encoding:"utf8"});
  assert.equal(archive.status,0);
  for(const [name,text]of sources){assert.ok(manifest.files.some(entry=>entry.file===name));assert.ok(archive.stdout.split("\n").includes(`./${name}`));assert.equal(await readFile(path.join(result.sourceDirectory,name),"utf8"),text);}
  assert.ok(!manifest.files.some(entry=>entry.file.includes("unrelated-private")));
  assert.ok(!archive.stdout.includes("unrelated-private"));
});

test("the delivery-stage handoff includes both runnable examples and excludes their runtime state", async t => {
  const {root,base}=await fixture(t);
  const names=["examples/delivery-stage-staging/server.mjs","examples/delivery-stage-staging/adapter.mjs","examples/delivery-stage-staging/README.md","examples/delivery-stage-flask/adapter.mjs","examples/delivery-stage-flask/serve.py","examples/delivery-stage-flask/README.md"];
  for(const name of names){await mkdir(path.dirname(path.join(root,name)),{recursive:true});await writeFile(path.join(root,name),await readFile(new URL(`../${name}`,import.meta.url)));}
  for(const directory of ["examples/delivery-stage-staging/outputs","examples/delivery-stage-flask/.venv","examples/unlisted-private"]){await mkdir(path.join(root,directory),{recursive:true});await writeFile(path.join(root,directory,"private.md"),"excluded runtime state\n");}
  const result=await buildJudgePack(root,path.join(base,"stage-export")),manifest=JSON.parse(await readFile(result.manifest,"utf8")),archive=spawnSync("tar",["-tzf",result.archive],{encoding:"utf8"});
  assert.equal(archive.status,0);
  for(const name of names){assert.ok(manifest.files.some(entry=>entry.file===name));assert.ok(archive.stdout.split("\n").includes(`./${name}`));assert.deepEqual(await readFile(path.join(result.sourceDirectory,name)),await readFile(path.join(root,name)));}
  assert.ok(!archive.stdout.includes("private.md"));
});

test("the native FastAPI handoff retains its exact lock and licence without widening the text allowlist", async t => {
  const {root,base}=await fixture(t),relative="examples/delivery-stage-staging/fastapi-native",directory=path.join(root,relative);
  await mkdir(directory,{recursive:true});
  for(const name of ["requirements.txt","LICENSE"]){await writeFile(path.join(directory,name),await readFile(new URL(`../${relative}/${name}`,import.meta.url)));}
  for(const name of ["operator-notes.txt","requirements-private.txt","LICENSE-personal"]){await writeFile(path.join(directory,name),"not a source input\n");}
  const result=await buildJudgePack(root,path.join(base,"native-export")),manifest=JSON.parse(await readFile(result.manifest,"utf8")),archive=spawnSync("tar",["-tzf",result.archive],{encoding:"utf8"});
  assert.equal(archive.status,0);
  for(const name of ["requirements.txt","LICENSE"]){const file=`${relative}/${name}`;assert.ok(manifest.files.some(row=>row.file===file));assert.ok(archive.stdout.split("\n").includes(`./${file}`));assert.deepEqual(await readFile(path.join(result.sourceDirectory,file)),await readFile(path.join(directory,name)));}
  for(const name of ["operator-notes.txt","requirements-private.txt","LICENSE-personal"]){assert.ok(!manifest.files.some(row=>row.file.endsWith(name)));assert.ok(!archive.stdout.includes(name));}
  for(const name of ["requirements.txt","LICENSE"]){
    const original=await readFile(path.join(directory,name));
    await writeFile(path.join(directory,name),"Bearer "+"x".repeat(32));
    await assert.rejects(buildJudgePack(root,path.join(base,`blocked-${name}`)),/Source export needs manual review/u);
    await writeFile(path.join(directory,name),original);
  }
});

test("template licences are copied byte-for-byte without admitting other TXT or similarly named notes", async t => {
  const {root,base}=await fixture(t),directory=path.join(root,"docs/fixtures/assessment-transfer-2026-11-04");
  await mkdir(directory,{recursive:true});
  for(const name of["bootstrap","florist","html5up"])await writeFile(path.join(directory,`${name}-LICENSE.txt`),`Synthetic ${name} licence bytes.\n`);
  for(const name of["personal-notes.txt","private-LICENSE.txt","bootstrap-LICENSE.txt.bak"])await writeFile(path.join(directory,name),"not authorised by the source allowlist\n");
  const result=await buildJudgePack(root,path.join(base,"export")),manifest=JSON.parse(await readFile(result.manifest,"utf8"));
  const copied=manifest.files.map(item=>item.file).filter(name=>name.endsWith(".txt"));
  assert.deepEqual(copied,["bootstrap","florist","html5up"].map(name=>`docs/fixtures/assessment-transfer-2026-11-04/${name}-LICENSE.txt`));
  for(const file of copied)assert.deepEqual(await readFile(path.join(result.sourceDirectory,file)),await readFile(path.join(root,file)));
});

test("real-project source exports retain the six exact upstream licences and exclude neighbouring owner notes", async t => {
  const {root,base}=await fixture(t),relative="public/benchmarks/real-projects-2026-11-05/source-provenance",directory=path.join(root,relative);
  await mkdir(directory,{recursive:true});
  const projects=["business-casual","modern-business","corona-admin","personal","clean-blog","html5-boilerplate"];
  for(const name of projects)await writeFile(path.join(directory,`${name}-LICENSE.txt`),`Synthetic exact attribution: ${name}\r\n`);
  for(const name of["owner-notes.txt","other-LICENSE.txt","personal-LICENSE.txt.bak"])await writeFile(path.join(directory,name),"not in exact allowlist\n");
  const result=await buildJudgePack(root,path.join(base,"real-source-export")),manifest=JSON.parse(await readFile(result.manifest,"utf8"));
  const copied=manifest.files.map(row=>row.file).filter(file=>file.endsWith(".txt"));
  assert.deepEqual(copied,projects.map(name=>`${relative}/${name}-LICENSE.txt`).sort());
  const archive=spawnSync("tar",["-tzf",result.archive],{encoding:"utf8"});assert.equal(archive.status,0);
  for(const file of copied){assert.deepEqual(await readFile(path.join(result.sourceDirectory,file)),await readFile(path.join(root,file)));assert.ok(archive.stdout.split("\n").includes(`./${file}`));}
  assert.ok(!archive.stdout.includes("owner-notes"));assert.ok(!archive.stdout.includes("other-LICENSE"));
});

test("the single pinned benchmark source archive exports byte-for-byte with all frozen member hashes validated", async t => {
  const {root,base}=await fixture(t),relative="public/benchmarks/five-remediation-2026-11-05",actual=new URL(`../${relative}/`,import.meta.url);
  await mkdir(path.join(root,relative),{recursive:true});
  const archiveBytes=await readFile(new URL("first-implementation.tar.gz",actual)),freezeBytes=await readFile(new URL("first-freeze.json",actual));
  await writeFile(path.join(root,relative,"first-implementation.tar.gz"),archiveBytes);await writeFile(path.join(root,relative,"first-freeze.json"),freezeBytes);
  for(const name of["arbitrary.tar.gz","first-implementation.tar.gz.bak","private.bin"])await writeFile(path.join(root,relative,name),"not a permitted binary source\n");
  const result=await buildJudgePack(root,path.join(base,"archive-export")),manifest=JSON.parse(await readFile(result.manifest,"utf8")),entry=manifest.files.find(item=>item.file===`${relative}/first-implementation.tar.gz`);
  assert.equal(entry.bytes,175703);assert.equal(entry.sha256,"08b9d92412311119119bea36d86ee4e403087d83fe535e33719f432269617139");
  assert.deepEqual(await readFile(path.join(result.sourceDirectory,entry.file)),archiveBytes);
  assert.deepEqual(manifest.files.filter(item=>/\.(?:gz|bin)$/u.test(item.file)).map(item=>item.file),[`${relative}/first-implementation.tar.gz`]);
  const listed=spawnSync("tar",["-tzf",result.archive],{encoding:"utf8"});assert.equal(listed.status,0);assert.ok(listed.stdout.split("\n").includes(`./${entry.file}`));
});

test("tampered, oversized or frozen-source-mismatched baseline archives block export before output creation", async t => {
  const {root,base}=await fixture(t),relative="public/benchmarks/five-remediation-2026-11-05",actual=new URL(`../${relative}/`,import.meta.url);
  await mkdir(path.join(root,relative),{recursive:true});
  const original=await readFile(new URL("first-implementation.tar.gz",actual)),freeze=JSON.parse(await readFile(new URL("first-freeze.json",actual),"utf8"));
  await writeFile(path.join(root,relative,"first-freeze.json"),JSON.stringify(freeze));
  for(const [name,bytes]of[["tampered",Buffer.from(original)],["oversized",Buffer.alloc(256*1024+1)]]){
    if(name==="tampered")bytes[20]^=1;
    await writeFile(path.join(root,relative,"first-implementation.tar.gz"),bytes);
    const output=path.join(base,`reject-${name}`);await assert.rejects(buildJudgePack(root,output),/Pinned benchmark archive validation failed/u);assert.ok(!(await readdir(base)).includes(`reject-${name}`));
  }
  await writeFile(path.join(root,relative,"first-implementation.tar.gz"),original);freeze.snapshot.implementation[0].sha256="0".repeat(64);await writeFile(path.join(root,relative,"first-freeze.json"),JSON.stringify(freeze));
  await assert.rejects(buildJudgePack(root,path.join(base,"reject-frozen-mismatch")),/Pinned benchmark archive validation failed/u);assert.ok(!(await readdir(base)).includes("reject-frozen-mismatch"));
  await writeFile(path.join(root,relative,"first-freeze.json"),Buffer.alloc(4*1024*1024+1,32));
  await assert.rejects(buildJudgePack(root,path.join(base,"reject-frozen-size")),/Pinned (?:benchmark archive validation failed|archive input exceeds its bounded read allowance)/u);assert.ok(!(await readdir(base)).includes("reject-frozen-size"));
});

test("judge export refuses a source symlink instead of following it outside the source tree", async t => {
  const { root, base } = await fixture(t);
  await writeFile(path.join(base, "outside.ts"), "synthetic external file");
  await symlink(path.join(base, "outside.ts"), path.join(root, "lib/linked.ts"));
  await assert.rejects(collectPublicSource(root), /Symlink source rejected/u);
});

test("an allowlisted root document symlink is rejected before its external contents can be copied", async t => {
  const { root, base } = await fixture(t);
  await writeFile(path.join(base, "outside.md"), "synthetic external notes");
  await symlink(path.join(base, "outside.md"), path.join(root, "AGENTS.md"));
  await assert.rejects(collectPublicSource(root), /Symlink source rejected: AGENTS\.md/u);
});

test("a credential-like value in otherwise allowed source blocks export before writing output", async t => {
  const { root, base } = await fixture(t);
  await writeFile(path.join(root, "lib/accidental.ts"), 'export const example = "sk-' + "x".repeat(32) + '";');
  const output = path.join(base, "export");
  await assert.rejects(buildJudgePack(root, output), /Source export needs manual review/u);
  assert.ok(!(await readdir(base)).includes("export"));
});

test("judge export strips owner Site identity, emits placeholders and refuses overwriting an existing package", async t => {
  const { root, base } = await fixture(t);
  await mkdir(path.join(root, ".openai"));
  await writeFile(path.join(root, ".openai/hosting.json"), '{"project_id":"synthetic-private-site","d1":"DB"}');
  const output = path.join(base, "export");
  const result = await buildJudgePack(root, output);
  assert.deepEqual(JSON.parse(await readFile(path.join(result.sourceDirectory, ".openai/hosting.json"), "utf8")), { d1: "DB", r2: null });
  assert.match(await readFile(path.join(result.sourceDirectory, ".env.example"), "utf8"), /PAYPAL_CLIENT_SECRET=\n/u);
  const manifest = JSON.parse(await readFile(result.manifest, "utf8"));
  assert.equal(manifest.files.find(file => file.file === "lib/flow.ts").sha256.length, 64);
  const archiveNames = spawnSync("tar", ["-tzf", result.archive], { encoding: "utf8" });
  assert.equal(archiveNames.status, 0);
  assert.ok(archiveNames.stdout.split("\n").includes("./SOURCE-MANIFEST.json"));
  assert.ok(!archiveNames.stdout.split("\n").some(name => /(?:^|\/)\._/u.test(name)));
  await assert.rejects(buildJudgePack(root, output), /Output already exists/u);
});
