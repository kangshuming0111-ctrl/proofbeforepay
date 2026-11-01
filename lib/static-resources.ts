import { DomainError } from "./domain.ts";

/** Shared browser/server limits. Raster strings are canonical data URLs in storage only. */
export const STATIC_RESOURCE_LIMITS = {
  maxFiles: 40, maxPathLength: 160, maxSegments: 5,
  textFileBytes: 64 * 1024, textTotalBytes: 256 * 1024,
  rasterFileBytes: 256 * 1024, rasterTotalBytes: 1024 * 1024,
  maxImageDimension: 4096, maxImagePixels: 16_777_216,
} as const;
export type StaticFileKind = "html" | "css" | "png" | "jpeg" | "webp";
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

/** Reject aliases rather than silently rewriting a saved delivery's filenames. */
export function assertStaticPath(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > STATIC_RESOURCE_LIMITS.maxPathLength
    || value.split("/").length > STATIC_RESOURCE_LIMITS.maxSegments
    || value.split("/").some(segment => !SEGMENT.test(segment))) {
    throw new DomainError("Use canonical relative file paths with at most 5 ASCII filename segments; no traversal, encoded paths or backslashes.");
  }
  return value;
}

export function staticFileKind(path: string): StaticFileKind | undefined {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension === "html" || extension === "css" || extension === "png" || extension === "webp" ? extension
    : extension === "jpg" || extension === "jpeg" ? "jpeg" : undefined;
}

function invalidRaster(): never { throw new DomainError("Raster files must pass bounded PNG, JPEG or non-animated WebP structure checks and match the filename."); }
function dimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > STATIC_RESOURCE_LIMITS.maxImageDimension || height > STATIC_RESOURCE_LIMITS.maxImageDimension
    || width * height > STATIC_RESOURCE_LIMITS.maxImagePixels) invalidRaster();
}
const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length));
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function checkPng(bytes: Uint8Array) {
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) invalidRaster();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8, header = false, data = false, ended = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), type = ascii(bytes, offset + 4, 4), end = offset + 12 + length;
    if (end > bytes.length || !/^[A-Za-z]{4}$/u.test(type) || ended) invalidRaster();
    let crc = 0xffffffff;
    for (let i = offset + 4; i < end - 4; i++) crc = crc >>> 8 ^ CRC_TABLE[(crc ^ bytes[i]) & 255];
    if ((crc ^ 0xffffffff) >>> 0 !== view.getUint32(end - 4)) invalidRaster();
    if (!header && type !== "IHDR") invalidRaster();
    if (type === "IHDR") {
      if (header || length !== 13) invalidRaster();
      dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      const depth = bytes[offset + 16], colour = bytes[offset + 17];
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[colour]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) invalidRaster();
      header = true;
    } else if (type === "IDAT") { if (!length) invalidRaster(); data = true; }
    else if (type === "IEND") { if (length || !data || end !== bytes.length) invalidRaster(); ended = true; }
    else if (type === "acTL" || type === "fcTL" || type === "fdAT") invalidRaster();
    offset = end;
  }
  if (!header || !data || !ended || offset !== bytes.length) invalidRaster();
}

function checkJpeg(bytes: Uint8Array) {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) invalidRaster();
  let offset = 2, frame = false, scan = false;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalidRaster();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) { if (!frame || !scan || offset !== bytes.length) invalidRaster(); return; }
    if (!marker || marker === 0xd8 || marker >= 0xd0 && marker <= 0xd7 || offset + 2 > bytes.length) invalidRaster();
    const length = bytes[offset] * 256 + bytes[offset + 1], end = offset + length;
    if (length < 2 || end > bytes.length) invalidRaster();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (length < 8 || bytes[offset + 2] !== 8) invalidRaster();
      dimensions(bytes[offset + 5] * 256 + bytes[offset + 6], bytes[offset + 3] * 256 + bytes[offset + 4]);
      frame = true;
    }
    offset = end;
    if (marker === 0xda) {
      if (!frame || length < 6) invalidRaster();
      scan = true;
      // Skip entropy bytes, stuffed FF00 and restart markers; resume at a real marker.
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0 || next >= 0xd0 && next <= 0xd7) { offset += 2; continue; }
        break;
      }
    }
  }
  invalidRaster();
}

function checkWebp(bytes: Uint8Array) {
  if (bytes.length < 26 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") invalidRaster();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) + 8 !== bytes.length) invalidRaster();
  let offset = 12, images = 0, extended: [number, number] | undefined, actual: [number, number] | undefined;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4), length = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + length > bytes.length || length % 2 && bytes[start + length] !== 0 || ["ANIM", "ANMF"].includes(type)) invalidRaster();
    if (type === "VP8X") {
      if (extended || offset !== 12 || length !== 10 || bytes[start] & 0xc3 || bytes[start + 1] || bytes[start + 2] || bytes[start + 3]) invalidRaster();
      extended = [1 + bytes[start + 4] + bytes[start + 5] * 256 + bytes[start + 6] * 65536,
        1 + bytes[start + 7] + bytes[start + 8] * 256 + bytes[start + 9] * 65536];
    } else if (type === "VP8 ") {
      if (length < 10 || bytes[start] & 1 || ascii(bytes, start + 3, 3) !== "\x9d\x01\x2a") invalidRaster();
      actual = [view.getUint16(start + 6, true) & 0x3fff, view.getUint16(start + 8, true) & 0x3fff]; images++;
    } else if (type === "VP8L") {
      if (length <= 5 || bytes[start] !== 0x2f || bytes[start + 4] >> 5 !== 0) invalidRaster();
      const bits = view.getUint32(start + 1, true);
      actual = [(bits & 0x3fff) + 1, (bits >>> 14 & 0x3fff) + 1]; images++;
    }
    offset = start + length + length % 2;
  }
  if (offset !== bytes.length || images !== 1 || !actual || extended && (extended[0] !== actual[0] || extended[1] !== actual[1])) invalidRaster();
  dimensions(...actual);
}

function validateRaster(path: string, bytes: Uint8Array): keyof typeof MIME {
  assertStaticPath(path);
  const kind = staticFileKind(path);
  if (!kind || !(kind in MIME) || bytes.byteLength > STATIC_RESOURCE_LIMITS.rasterFileBytes) invalidRaster();
  if (kind === "png") checkPng(bytes);
  else if (kind === "jpeg") checkJpeg(bytes);
  else if (kind === "webp") checkWebp(bytes);
  return kind as keyof typeof MIME;
}

/** Browser-safe helper for seller uploads. This does not decode pixels or prove rendering. */
export function encodeRasterDataUrl(path: string, bytes: Uint8Array): string {
  const kind = validateRaster(path, bytes);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${MIME[kind]};base64,${btoa(binary)}`;
}

export function decodeRasterDataUrl(path: string, value: string): { mime: string; bytes: Uint8Array } {
  if (value.length > 4 * Math.ceil(STATIC_RESOURCE_LIMITS.rasterFileBytes / 3) + 32) invalidRaster();
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (!match || match[2].length % 4 !== 0) invalidRaster();
  let binary: string;
  try { binary = atob(match[2]); } catch { invalidRaster(); }
  if (btoa(binary!) !== match[2]) invalidRaster();
  const bytes = new Uint8Array(binary!.length);
  for (let i = 0; i < binary!.length; i++) bytes[i] = binary!.charCodeAt(i);
  const kind = validateRaster(path, bytes);
  if (match[1] !== MIME[kind]) invalidRaster();
  return { mime: MIME[kind], bytes };
}

/** Resolve references inside this package only; never fetch a URL or traverse above root. */
export function resolveStaticReference(from: string, reference: string): string | undefined {
  if (!reference || /[\\%\u0000-\u0020\u007f]/u.test(reference) || reference.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(reference)) return;
  const path = reference.split(/[?#]/u)[0];
  if (!path) return from;
  const segments = from.split("/").slice(0, -1);
  for (const segment of path.split("/")) {
    if (segment === ".") continue;
    if (segment === "..") { if (!segments.length) return; segments.pop(); }
    else if (!SEGMENT.test(segment)) return;
    else segments.push(segment);
  }
  try { return assertStaticPath(segments.join("/")); } catch { return; }
}

/** Common response boundary for current and archived exact-version previews. */
export function staticPreviewResponse(file: string, contents: string, baseUrl: string, deliveryId: string): Response {
  assertStaticPath(file);
  const kind = staticFileKind(file);
  let body: string | ArrayBuffer = contents;
  let mime = kind === "css" ? "text/css; charset=utf-8" : file === "delivery-manifest.json" ? "application/json; charset=utf-8" : "text/html; charset=utf-8";
  if (kind === "png" || kind === "jpeg" || kind === "webp") {
    const decoded = decodeRasterDataUrl(file, contents); mime = decoded.mime; body = new Uint8Array(decoded.bytes).buffer;
  } else if (!kind && file !== "delivery-manifest.json") throw new DomainError("Unsupported preview file.", 404);
  return new Response(body, { headers: {
    "Content-Type": mime,
    "Content-Security-Policy": `sandbox allow-same-origin; default-src 'none'; style-src ${baseUrl} 'unsafe-inline'; img-src ${baseUrl}; frame-ancestors 'self'; form-action 'none'; base-uri 'none'`,
    "Referrer-Policy": "no-referrer", "Cross-Origin-Opener-Policy": "same-origin", "X-Robots-Tag": "noindex, nofollow",
    "X-ProofBeforePay-Delivery": deliveryId, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
  } });
}
