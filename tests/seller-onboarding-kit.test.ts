import test from "node:test";
import assert from "node:assert/strict";
import {readFile, writeFile, mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
import {defaultSellerOnboardingConfig} from "../lib/seller-onboarding.ts";
import {SELLER_KIT_DEPENDENCIES} from "../lib/seller-onboarding-dependencies.ts";
import {buildSellerOnboardingKit, readSellerKitZip, sellerKitSha256, verifySellerOnboardingKit, SELLER_KIT_LIMITS} from "../lib/seller-onboarding-kit.ts";

const root = new URL("../", import.meta.url), origin = "https://kit-proof.test", enc = new TextEncoder(), dec = new TextDecoder();
async function sources() {
  const entries = await Promise.all(SELLER_KIT_DEPENDENCIES.map(async pin => {
    const bytes = new Uint8Array(await readFile(new URL(pin.path.slice(1), new URL("public/", root))));
    return [pin.path, bytes] as const;
  }));
  return new Map<string, Uint8Array>(entries);
}
async function localFetcher(change?: (path: string, bytes: Uint8Array, init?: RequestInit) => Response | Promise<Response>, calls: {url: string; init?: RequestInit}[] = []): Promise<typeof fetch> {
  const files = await sources();
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url, parsed = new URL(url);
    calls.push({url, init}); const bytes = files.get(parsed.pathname); assert.ok(bytes); assert.equal(parsed.origin, origin);
    return change ? change(parsed.pathname, bytes, init) : new Response(new Uint8Array(bytes).buffer, {headers: {"content-type": "text/javascript; charset=utf-8", "content-length": String(bytes.length)}});
  }) as typeof fetch;
}
async function kit() {return buildSellerOnboardingKit(defaultSellerOnboardingConfig(), {origin, fetcher: await localFetcher()});}
function crc32(bytes: Uint8Array): number {let result = 0xffffffff; for (const byte of bytes) {result ^= byte; for (let i = 0; i < 8; i++) result = (result >>> 1) ^ (result & 1 ? 0xedb88320 : 0);} return (result ^ 0xffffffff) >>> 0;}
/** Adversarial edits also repair ZIP CRCs, so manifest/pin tests cross that guard. */
function editMember(zip: Uint8Array, wanted: string, edit: (bytes: Uint8Array) => Uint8Array): Uint8Array {
  const bytes = new Uint8Array(zip), v = new DataView(bytes.buffer), end = bytes.length - 22; let at = v.getUint32(end + 16, true);
  for (let i = 0; i < v.getUint16(end + 10, true); i++) {
    const length = v.getUint16(at + 28, true), name = dec.decode(bytes.subarray(at + 46, at + 46 + length)), local = v.getUint32(at + 42, true), size = v.getUint32(at + 24, true), start = local + 30 + length;
    if (name === wanted) {const changed = edit(bytes.slice(start, start + size)); assert.equal(changed.length, size); bytes.set(changed, start); const crc = crc32(changed); v.setUint32(local + 14, crc, true); v.setUint32(at + 16, crc, true); return bytes;}
    at += 46 + length;
  }
  throw new Error("Missing test member");
}

test("download pins match exact authored SDK and byte-identical public bridge mirror", async () => {
  for (const pin of SELLER_KIT_DEPENDENCIES) {
    const original = new Uint8Array(await readFile(new URL(pin.source, root))), mirror = new Uint8Array(await readFile(new URL(pin.path.slice(1), new URL("public/", root))));
    assert.equal(original.length, pin.bytes); assert.equal(await sellerKitSha256(original), pin.sha256); assert.deepEqual(mirror, original);
  }
});

test("single ZIP includes every connector dependency and exact per-file hashes with fixed bounded same-origin requests", async () => {
  const calls: {url: string; init?: RequestInit}[] = [], result = await buildSellerOnboardingKit(defaultSellerOnboardingConfig(), {origin, fetcher: await localFetcher(undefined, calls)}), files = readSellerKitZip(result.bytes);
  assert.equal(files.size, 7); assert.equal(result.name, "proofbeforepay-seller-kit.zip");
  assert.deepEqual(calls.map(call => new URL(call.url).pathname).sort(), SELLER_KIT_DEPENDENCIES.map(pin => pin.path).sort());
  for (const {init} of calls) {assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(init?.mode, "same-origin"); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.body, undefined);}
  const connector = dec.decode(files.get("pbp-connect.mjs"));
  const imports = [...connector.matchAll(/from "\.\/([A-Za-z0-9._-]+)"/gu)].map(match => match[1]);
  assert.deepEqual(imports.sort(), ["bridge.mjs", "seller-dom-adapter.mjs"]);
  assert.ok(imports.every(name => files.has(name)));
  for (const entry of result.manifest.files) {assert.equal(files.get(entry.name)!.length, entry.bytes); assert.equal(await sellerKitSha256(files.get(entry.name)!), entry.sha256);}
  assert.match(dec.decode(files.get("PBP-SETUP.md")), /already includes the exact pinned/u);
  assert.doesNotMatch(dec.decode(files.get("PBP-SETUP.md")), /Copy seller-dom-adapter\.mjs/u);
  assert.equal((await verifySellerOnboardingKit(result.bytes)).valid, true);
});

test("configuration changes change connector/config/manifest/package hashes without mutating the config", async () => {
  const a = defaultSellerOnboardingConfig(), before = structuredClone(a), b = {...structuredClone(a), frontendRevision: "different-staging-v2"}; b.forms.create.submit = "#my-submit";
  const first = await buildSellerOnboardingKit(a, {origin, fetcher: await localFetcher()}), second = await buildSellerOnboardingKit(b, {origin, fetcher: await localFetcher()});
  assert.deepEqual(a, before); assert.notEqual(first.sha256, second.sha256); assert.notEqual(first.manifest.configurationSha256, second.manifest.configurationSha256);
  const files = readSellerKitZip(second.bytes); assert.match(dec.decode(files.get("pbp-connect.mjs")), /different-staging-v2/u); assert.match(dec.decode(files.get("pbp-connect.mjs")), /#my-submit/u);
  assert.equal((await verifySellerOnboardingKit(second.bytes)).valid, true);
  assert.equal(first.sha256, (await kit()).sha256, "same config/source produces the same complete archive");
});

test("dependency failure, redirect, unexpected MIME, truncated length and hash mismatch never return a partial artifact", async () => {
  const changes: ((path: string, bytes: Uint8Array) => Response)[] = [
    () => new Response("Unavailable", {status: 503, headers: {"content-type": "text/javascript"}}),
    (_, bytes) => {const r = new Response(new Uint8Array(bytes).buffer, {headers: {"content-type": "text/javascript"}}); Object.defineProperty(r, "redirected", {value: true}); return r;},
    (_, bytes) => {const r = new Response(new Uint8Array(bytes).buffer, {headers: {"content-type": "text/javascript"}}); Object.defineProperty(r, "url", {value: "https://another.test/sdk.mjs"}); return r;},
    (_, bytes) => new Response(new Uint8Array(bytes).buffer, {headers: {"content-type": "text/html"}}),
    (_, bytes) => new Response(new Uint8Array(bytes.subarray(0, bytes.length - 1)).buffer, {headers: {"content-type": "text/javascript"}}),
    (_, bytes) => {const changed = new Uint8Array(bytes); changed[0] ^= 1; return new Response(changed.buffer, {headers: {"content-type": "text/javascript"}});},
    (_, bytes) => new Response(new Uint8Array(bytes).buffer, {headers: {"content-type": "text/javascript", "content-length": "999999"}}),
  ];
  for (const change of changes) await assert.rejects(buildSellerOnboardingKit(defaultSellerOnboardingConfig(), {origin, fetcher: await localFetcher(change)}), /seller_kit_/u);
  const calls: {url: string; init?: RequestInit}[] = [];
  await assert.rejects(buildSellerOnboardingKit(defaultSellerOnboardingConfig(), {origin, fetcher: await localFetcher((path, bytes) => {if (path.endsWith("seller-lifecycle-bridge.mjs")) throw new Error("controlled network loss"); return new Response(new Uint8Array(bytes).buffer, {headers: {"content-type": "text/javascript"}});}, calls)}), /controlled network loss/u);
  assert.equal(calls.length, 2);
});

test("streamed oversize is cancelled at the exact dependency bound even without content-length", async () => {
  let cancelled = 0;
  const fetcher = await localFetcher((_, bytes) => new Response(new ReadableStream<Uint8Array>({start(controller) {controller.enqueue(new Uint8Array(bytes)); controller.enqueue(new Uint8Array([1]));}, cancel() {cancelled++;}}), {headers: {"content-type": "text/javascript"}}));
  await assert.rejects(buildSellerOnboardingKit(defaultSellerOnboardingConfig(), {origin, fetcher}), /seller_kit_dependency_size/u);
  assert.ok(cancelled >= 1);
});

test("aborting obsolete preparation prevents any kit from being returned; a subsequent config can generate normally", async () => {
  const controller = new AbortController(); let entered = 0;
  const fetcher = (async (_: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {entered++; init!.signal!.addEventListener("abort", () => reject(new DOMException("Controlled cancellation", "AbortError")), {once: true});})) as typeof fetch;
  const first = buildSellerOnboardingKit(defaultSellerOnboardingConfig(), {origin, fetcher, signal: controller.signal}); controller.abort();
  await assert.rejects(first); assert.equal(entered, 2);
  assert.equal((await verifySellerOnboardingKit((await kit()).bytes)).valid, true);
});

test("ZIP corruption, unsupported flags and repaired-CRC malicious payloads fail independent package verification", async () => {
  const archive = await kit(), corrupt = new Uint8Array(archive.bytes); corrupt[70] ^= 1;
  await assert.rejects(verifySellerOnboardingKit(corrupt));
  const flag = new Uint8Array(archive.bytes); new DataView(flag.buffer).setUint16(6, 1, true); assert.throws(() => readSellerKitZip(flag));
  await assert.rejects(verifySellerOnboardingKit(editMember(archive.bytes, "seller-dom-adapter.mjs", bytes => {bytes[0] ^= 1; return bytes;})), /dependency_hash/u);
  await assert.rejects(verifySellerOnboardingKit(editMember(archive.bytes, "pbp-connect.mjs", bytes => {bytes[0] ^= 1; return bytes;})), /generated_mismatch/u);
  await assert.rejects(verifySellerOnboardingKit(editMember(archive.bytes, "SHA256SUMS.json", bytes => enc.encode(dec.decode(bytes).replace("preparation-only", "preparation-fake")))), /manifest_mismatch/u);
  assert.throws(() => readSellerKitZip(new Uint8Array(SELLER_KIT_LIMITS.zipBytes + 1)), /zip_size/u);
});

test("generated ZIP is readable by Python zipfile and extracted connector resolves both modules under native Node ESM", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pbp-seller-kit-")), archive = await kit(), path = join(dir, archive.name), descriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  try {
    await writeFile(path, archive.bytes);
    const verified = JSON.parse(execFileSync("python3", ["-c", "import json,sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nassert len(z.namelist())==7\nassert all(i.compress_type==zipfile.ZIP_STORED for i in z.infolist())\nprint(json.dumps({'files':z.namelist()}))", path], {encoding: "utf8"}));
    assert.equal(verified.files.length, 7);
    const files = readSellerKitZip(archive.bytes); for (const [name, bytes] of files) await writeFile(join(dir, name), bytes);
    Object.defineProperty(globalThis, "location", {configurable: true, value: new URL("https://kit-proof.test/")});
    const connector = await import(pathToFileURL(join(dir, "pbp-connect.mjs")).href);
    assert.equal(typeof connector.getPendingProofCommand, "function"); assert.equal(typeof connector.completeProofOperation, "function"); assert.equal(connector.getPendingProofCommand(), undefined);
    const report = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", new URL("scripts/verify-seller-kit.mjs", root).pathname, path], {encoding: "utf8"})); assert.equal(report.valid, true); assert.equal(report.scope, "preparation-only");
  } finally {if (descriptor) Object.defineProperty(globalThis, "location", descriptor); else Reflect.deleteProperty(globalThis, "location"); await rm(dir, {recursive: true, force: true});}
});
