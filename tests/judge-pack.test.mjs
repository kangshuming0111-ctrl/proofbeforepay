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
