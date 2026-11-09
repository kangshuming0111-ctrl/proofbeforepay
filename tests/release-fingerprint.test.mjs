import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fingerprintEntries, releaseFingerprint } from "../scripts/release-fingerprint.mjs";
import { collectPublicSource } from "../scripts/build-judge-pack.mjs";
import { fileURLToPath } from "node:url";
const entry = (relative, text) => ({relative, bytes: Buffer.from(text)});
test("release changes with application source, not credentials, docs or generated artifacts", () => {
  const base = [entry("app/page.tsx", "one\n"), entry("package.json", "{}")];
  const result = fingerprintEntries(base);
  assert.deepEqual(result, fingerprintEntries([...base].reverse()));
  assert.deepEqual(result, fingerprintEntries([entry("app/page.tsx", "one\r\n"), base[1]]));
  assert.deepEqual(result, fingerprintEntries([...base, entry(".dev.vars", "ignored"), entry("lib/.env", "ignored"), entry("docs/note.md", "ignored"), entry("dist/app.js", "ignored")]));
  assert.notEqual(result.sha256, fingerprintEntries([entry("app/page.tsx", "two\n"), base[1]]).sha256);
  assert.notEqual(result.sha256, fingerprintEntries([base[0], entry("package.json", '{"version":"2"}')]).sha256);
  assert.throws(() => fingerprintEntries([...base, base[0]]), /Duplicate/);
});
test("release covers deployable public text but skips benchmarks, credentials and site identity", () => {
  const app = entry("app/page.tsx", "app source");
  const assets = [entry("public/judge.html", "<h1>Judge start</h1>"), entry("public/ai-evidence-model.mjs", "export const ready = true;"), entry("public/sdk/client.mjs", "export const protocol = 1;")];
  const base = [app, ...assets];
  const result = fingerprintEntries(base);
  assert.equal(result.schema, "proofbeforepay-app-source-v2");
  assert.equal(result.files, base.length);
  for (const asset of assets) {
    assert.notEqual(fingerprintEntries(base.map(file => file === asset ? entry(file.relative, "changed") : file)).sha256, result.sha256);
  }
  assert.deepEqual(fingerprintEntries([...base, entry("public/benchmarks/result.json", "{}"), entry("public/.dev.vars", "synthetic"), entry("public/secrets/fixture.js", "synthetic"), entry("public/photo.png", "binary"), entry(".openai/hosting.json", "{}")]), result);
});
test("actual sanitized export and local build compute the same application-source fingerprint", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url));
  assert.deepEqual(fingerprintEntries(await collectPublicSource(root)), await releaseFingerprint(root));
});
test("the disk and export walks both skip private notes, benchmark data and the local readiness wrapper", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "pbp-release-scope-"));
  t.after(() => rm(root, {recursive:true, force:true}));
  await mkdir(path.join(root, "public", "benchmarks"), {recursive:true});
  await writeFile(path.join(root, "public", "judge.html"), "<h1>Judge guide</h1>");
  const expected = await releaseFingerprint(root);
  assert.equal(expected.files, 1);
  for (const name of ["public/private-notes.json", "public/Personal_Notes.json", "public/personal-notes.md", "public/benchmarks/cases.json", "vite.judge.config.ts"]) {
    await writeFile(path.join(root, name), "synthetic excluded source");
  }
  assert.deepEqual(await releaseFingerprint(root), expected);
  const exported = await collectPublicSource(root);
  assert.deepEqual(exported.filter(file => !file.relative.startsWith("public/benchmarks/")).map(file => file.relative), ["public/judge.html"]);
  assert.deepEqual(fingerprintEntries(exported), expected);
});
