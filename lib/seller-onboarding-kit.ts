import {buildSellerOnboardingFiles, validateSellerOnboardingConfig} from "./seller-onboarding.ts";
import {SELLER_KIT_DEPENDENCIES} from "./seller-onboarding-dependencies.ts";

export const SELLER_KIT_SCHEMA = "pbp-seller-onboarding-kit-v1";
export const SELLER_KIT_LIMITS = {files: 7, fileBytes: 64 * 1024, zipBytes: 192 * 1024} as const;
export type SellerKitManifest = {schema: typeof SELLER_KIT_SCHEMA; scope: "preparation-only"; configurationSha256: string; files: {name: string; bytes: number; sha256: string; role: "generated" | "dependency"; source?: string; version?: string}[]};
export type SellerOnboardingKit = {name: "proofbeforepay-seller-kit.zip"; bytes: Uint8Array; sha256: string; manifest: SellerKitManifest};
type FileBytes = {name: string; bytes: Uint8Array};
const encoder = new TextEncoder(), decoder = new TextDecoder("utf-8", {fatal: true});
function fail(code: string): never {throw new Error(`seller_kit_${code}`);}
export async function sellerKitSha256(bytes: Uint8Array): Promise<string> {return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))].map(n => n.toString(16).padStart(2, "0")).join("");}
function crc32(bytes: Uint8Array): number {let crc = 0xffffffff; for (const b of bytes) {crc ^= b; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);} return (crc ^ 0xffffffff) >>> 0;}
function checkName(name: string): void {if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u.test(name) || name === "." || name === "..") fail("filename");}

/** Bounded, uncompressed ZIP with CRC32 and a central directory; no ZIP64,
 * paths, links, comments, encryption, data descriptors or extra fields. */
function zipFiles(files: FileBytes[]): Uint8Array {
  if (files.length !== SELLER_KIT_LIMITS.files || new Set(files.map(f => f.name)).size !== files.length) fail("file_count");
  const local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0, centralLength = 0;
  for (const file of files) {
    checkName(file.name); if (file.bytes.length > SELLER_KIT_LIMITS.fileBytes) fail("file_size");
    const name = encoder.encode(file.name), crc = crc32(file.bytes), head = new Uint8Array(30 + name.length), h = new DataView(head.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, file.bytes.length, true); h.setUint32(22, file.bytes.length, true); h.setUint16(26, name.length, true); head.set(name, 30);
    local.push(head, file.bytes);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 0x314, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint16(14, 0x21, true); d.setUint32(16, crc, true); d.setUint32(20, file.bytes.length, true); d.setUint32(24, file.bytes.length, true); d.setUint16(28, name.length, true); d.setUint32(38, 0x81a40000, true); d.setUint32(42, offset, true); directory.set(name, 46);
    central.push(directory); centralLength += directory.length; offset += head.length + file.bytes.length;
  }
  const total = offset + centralLength + 22; if (total > SELLER_KIT_LIMITS.zipBytes) fail("zip_size");
  const end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, centralLength, true); e.setUint32(16, offset, true);
  const zip = new Uint8Array(total); let at = 0; for (const part of [...local, ...central, end]) {zip.set(part, at); at += part.length;} return zip;
}

/** Strict local parser for our fixed stored-ZIP format. It never extracts paths
 * to disk or executes code, and checks central/local agreement and every CRC. */
export function readSellerKitZip(bytes: Uint8Array): Map<string, Uint8Array> {
  if (!(bytes instanceof Uint8Array) || bytes.length < 22 || bytes.length > SELLER_KIT_LIMITS.zipBytes) fail("zip_size");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
  if (v.getUint32(end, true) !== 0x06054b50 || v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || v.getUint16(end + 20, true)) fail("zip_directory");
  const count = v.getUint16(end + 10, true), centralSize = v.getUint32(end + 12, true), centralStart = v.getUint32(end + 16, true);
  if (count !== SELLER_KIT_LIMITS.files || v.getUint16(end + 8, true) !== count || centralStart + centralSize !== end) fail("zip_directory");
  const result = new Map<string, Uint8Array>(); let at = centralStart, nextLocal = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || v.getUint32(at, true) !== 0x02014b50 || v.getUint16(at + 8, true) !== 0x800 || v.getUint16(at + 10, true) !== 0 || v.getUint16(at + 30, true) || v.getUint16(at + 32, true) || v.getUint16(at + 34, true) || v.getUint32(at + 38, true) !== 0x81a40000) fail("zip_directory");
    const size = v.getUint32(at + 24, true), nameSize = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true), crc = v.getUint32(at + 16, true);
    if (size > SELLER_KIT_LIMITS.fileBytes || size !== v.getUint32(at + 20, true) || at + 46 + nameSize > end || local !== nextLocal || local + 30 > centralStart) fail("zip_member");
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameSize)); checkName(name);
    if (result.has(name) || v.getUint32(local, true) !== 0x04034b50 || v.getUint16(local + 6, true) !== 0x800 || v.getUint16(local + 8, true) !== 0 || v.getUint16(local + 28, true) !== 0 || v.getUint16(local + 26, true) !== nameSize || v.getUint32(local + 14, true) !== crc || v.getUint32(local + 18, true) !== size || v.getUint32(local + 22, true) !== size) fail("zip_member");
    const data = local + 30 + nameSize; nextLocal = data + size;
    if (nextLocal > centralStart || decoder.decode(bytes.subarray(local + 30, data)) !== name) fail("zip_member");
    const content = bytes.slice(data, nextLocal); if (crc32(content) !== crc) fail("zip_crc"); result.set(name, content); at += 46 + nameSize;
  }
  if (at !== end || nextLocal !== centralStart) fail("zip_directory");
  return result;
}

function generatedFiles(value: unknown): FileBytes[] {
  return buildSellerOnboardingFiles(value).map(file => {
    let content = file.content;
    if (file.name === "PBP-SETUP.md") {
      content = content.replace("1. Use a dedicated synthetic staging page with no real customer data. Copy seller-dom-adapter.mjs from public/sdk and bridge.mjs from examples/seller-lifecycle-staging/frontend in the ProofBeforePay source repository next to pbp-connect.mjs.", "1. Use a dedicated synthetic staging page with no real customer data. This ZIP already includes the exact pinned seller-dom-adapter.mjs and bridge.mjs next to pbp-connect.mjs. Keep all three together. SHA256SUMS.json records every payload file's byte length and SHA-256. It is a consistency manifest, not deployment or backend attestation.");
      content = content.replace("5. Run the local static check from the repository root:", "5. Optional additional checks require the complete ProofBeforePay source checkout (not included in this preparation ZIP). From that repository root, run the local static check:");
      content += "\nOffline package verification, from the complete source checkout:\n\n    node --experimental-strip-types scripts/verify-seller-kit.mjs /absolute/path/proofbeforepay-seller-kit.zip\n\nVerification checks ZIP structure, CRC32, generated configuration/connector consistency and pinned dependencies. It does not execute the seller website or backend.\n";
    }
    return {name: file.name, bytes: encoder.encode(content)};
  });
}
async function makeManifest(files: FileBytes[]): Promise<SellerKitManifest> {
  const config = files.find(file => file.name === "pbp-onboarding.json"); if (!config) fail("configuration_missing");
  return {schema: SELLER_KIT_SCHEMA, scope: "preparation-only", configurationSha256: await sellerKitSha256(config.bytes), files: await Promise.all(files.map(async file => {
    const pin = SELLER_KIT_DEPENDENCIES.find(pin => pin.name === file.name);
    return {name: file.name, bytes: file.bytes.length, sha256: await sellerKitSha256(file.bytes), role: pin ? "dependency" as const : "generated" as const, ...(pin ? {source: pin.source, version: pin.version} : {})};
  }))};
}
async function readDependency(pin: typeof SELLER_KIT_DEPENDENCIES[number], origin: string, fetcher: typeof fetch, signal: AbortSignal): Promise<FileBytes> {
  const url = new URL(pin.path, origin).href;
  const response = await fetcher(url, {method: "GET", mode: "same-origin", credentials: "same-origin", cache: "no-store", redirect: "error", signal});
  if (signal.aborted) fail("cancelled");
  if (!response.ok || response.status !== 200 || response.redirected || !["basic", "default"].includes(response.type) || response.url && response.url !== url) fail("dependency_response");
  const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (!type || !["application/javascript", "text/javascript", "application/ecmascript", "text/ecmascript", "application/x-javascript"].includes(type)) fail("dependency_type");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > SELLER_KIT_LIMITS.fileBytes)) fail("dependency_size");
  if (!response.body) fail("dependency_empty");
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {const part = await reader.read(); if (signal.aborted) fail("cancelled"); if (part.done) break; bytes += part.value.byteLength; if (bytes > pin.bytes || bytes > SELLER_KIT_LIMITS.fileBytes) fail("dependency_size"); chunks.push(part.value);}
  } catch (error) {await reader.cancel().catch(() => undefined); throw error;} finally {reader.releaseLock();}
  if (bytes !== pin.bytes) fail("dependency_size");
  const content = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) {content.set(chunk, offset); offset += chunk.length;}
  if (await sellerKitSha256(content) !== pin.sha256) fail("dependency_hash");
  return {name: pin.name, bytes: content};
}

/** Fetch only fixed same-origin pinned dependencies, then return one complete ZIP.
 * No partial artifact, account grant, browser execution or target approval. */
export async function buildSellerOnboardingKit(value: unknown, options: {origin: string; fetcher?: typeof fetch; signal?: AbortSignal; timeoutMs?: number}): Promise<SellerOnboardingKit> {
  const config = validateSellerOnboardingConfig(value), origin = new URL(options.origin);
  if (origin.origin !== options.origin || origin.username || origin.password || !["https:", "http:"].includes(origin.protocol)) fail("origin");
  const timeout = options.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1 || timeout > 30_000) fail("timeout");
  const controller = new AbortController(), cancel = () => controller.abort();
  if (options.signal?.aborted) fail("cancelled");
  options.signal?.addEventListener("abort", cancel, {once: true});
  const timer = setTimeout(cancel, timeout);
  try {
    const dependencies = await Promise.all(SELLER_KIT_DEPENDENCIES.map(pin => readDependency(pin, origin.origin, options.fetcher ?? fetch, controller.signal)));
    if (controller.signal.aborted) fail("cancelled");
    const files = [...generatedFiles(config), ...dependencies].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    const manifest = await makeManifest(files); files.push({name: "SHA256SUMS.json", bytes: encoder.encode(JSON.stringify(manifest, null, 2) + "\n")});
    const bytes = zipFiles(files), sha256 = await sellerKitSha256(bytes);
    if (controller.signal.aborted) fail("cancelled");
    return {name: "proofbeforepay-seller-kit.zip", bytes, sha256, manifest};
  } finally {clearTimeout(timer); controller.abort(); options.signal?.removeEventListener("abort", cancel);}
}

export async function verifySellerOnboardingKit(bytes: Uint8Array): Promise<{valid: true; scope: "preparation-only"; files: number; bytes: number; sha256: string; configurationSha256: string}> {
  const files = readSellerKitZip(bytes), configBytes = files.get("pbp-onboarding.json"), manifestBytes = files.get("SHA256SUMS.json");
  if (!configBytes || !manifestBytes) fail("manifest_missing");
  const config = validateSellerOnboardingConfig(JSON.parse(decoder.decode(configBytes)));
  const generated = generatedFiles(config), dependencyFiles = SELLER_KIT_DEPENDENCIES.map(pin => {
    const content = files.get(pin.name); if (!content || content.length !== pin.bytes) fail("dependency_missing"); return {name: pin.name, bytes: content};
  });
  for (const file of generated) {const content = files.get(file.name); if (!content || content.length !== file.bytes.length || await sellerKitSha256(content) !== await sellerKitSha256(file.bytes)) fail("generated_mismatch");}
  for (const pin of SELLER_KIT_DEPENDENCIES) if (await sellerKitSha256(files.get(pin.name)!) !== pin.sha256) fail("dependency_hash");
  const payload = [...generated, ...dependencyFiles].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0), expected = await makeManifest(payload);
  if (decoder.decode(manifestBytes) !== JSON.stringify(expected, null, 2) + "\n") fail("manifest_mismatch");
  if (files.size !== payload.length + 1 || payload.some(file => !files.has(file.name))) fail("manifest_inventory");
  return {valid: true, scope: "preparation-only", files: files.size, bytes: bytes.length, sha256: await sellerKitSha256(bytes), configurationSha256: expected.configurationSha256};
}
