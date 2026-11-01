import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../lib/domain.ts";
import { assertStaticPath, decodeRasterDataUrl, encodeRasterDataUrl, resolveStaticReference, STATIC_RESOURCE_LIMITS, staticPreviewResponse } from "../lib/static-resources.ts";
import { createUploadedDelivery, inspectStaticResources, parseStaticProject, validateStaticFiles } from "../lib/static-project.ts";

// Original synthetic 2x2 solid-colour images generated locally, not downloaded photos.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWNIm1meNrOcAUIBACiyBdnemS6wAAAAAElFTkSuQmCC";
const JPEG = "/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAT/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCgAZFf/9k=";
const WEBP = "UklGRjAAAABXRUJQVlA4ICQAAABwAQCdASoCAAIAAUAmJYgCdAIHgAD9xxGE0k6P3R+9v45ZoAA=";
const bytes = (value: string) => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const html = (head = "", body = "<p>Sample shop</p>") => `<!doctype html><html><head><title>Shop</title>${head}</head><body>${body}</body></html>`;
const image = () => encodeRasterDataUrl("images/shop.png", bytes(PNG));
const invalid = (operation: () => unknown) => assert.throws(operation, DomainError);

test("canonical package paths support bounded directories and reject aliases, traversal and executable extensions", () => {
  assert.equal(assertStaticPath("pages/contact.html"), "pages/contact.html");
  assert.equal(assertStaticPath("assets/images/shop.jpg"), "assets/images/shop.jpg");
  for (const value of ["../a.png", "a/../b.png", "./index.html", "/index.html", "a//b.png", "a\\b.png", "a/%2e%2e/b.png", "a.png?x=1", "a.png#id", "a\n.png", "a/./b.png", "a/b/c/d/e/f.png", "a".repeat(65) + ".html", "a/.hidden.png"]) invalid(() => assertStaticPath(value));
  for (const path of ["app.js", "drawing.svg", "file.html.png.js", "font.woff2", "motion.gif", "file.php"]) invalid(() => validateStaticFiles({ "index.html": html(), [path]: "data" }));
  invalid(() => validateStaticFiles({ "index.html": html(), "assets.css": "a{}", "assets.css/logo.png": image() }));
  invalid(() => validateStaticFiles({ "index.html": html(), "images/shop.png": image(), "IMAGES/SHOP.PNG": image() }));
});

test("real synthetic PNG JPEG and WebP bytes survive canonical dataURL encoding and independent snapshots", () => {
  for (const [path, content, mime] of [["assets/a.png", PNG, "image/png"], ["assets/a.jpeg", JPEG, "image/jpeg"], ["assets/a.jpg", JPEG, "image/jpeg"], ["assets/a.webp", WEBP, "image/webp"]]) {
    const original = bytes(content), encoded = encodeRasterDataUrl(path, original), decoded = decodeRasterDataUrl(path, encoded);
    assert.equal(decoded.mime, mime); assert.deepEqual(decoded.bytes, original);
    assert.equal(encoded, `data:${mime};base64,${content}`);
    const files = { "index.html": html(), [path]: encoded }, snapshot = validateStaticFiles(files);
    assert.deepEqual(snapshot, files); files[path] = "changed later"; assert.equal(snapshot[path], encoded);
  }
});

test("spoofed MIME, active content, malformed structures, excess dimensions and oversized rasters are rejected", () => {
  const png = image();
  for (const [path, content] of [
    ["images/a.jpg", png], ["images/a.png", png.replace("image/png", "image/jpeg")],
    ["images/a.png", "data:image/png;base64," + btoa("<svg onload='alert(1)'></svg>")],
    ["images/a.png", "data:image/png;base64," + btoa("<html>active</html>")],
    ["images/a.png", png + "\n"], ["images/a.png", png.replace(";base64,", ";base64, ")],
    ["images/a.png", png.slice(0, -4)], ["images/a.png", "data:image/png;base64,AAAA="],
  ]) invalid(() => decodeRasterDataUrl(path, content));
  const corruptPng = bytes(PNG); corruptPng[20] ^= 1; invalid(() => encodeRasterDataUrl("a.png", corruptPng));
  const corruptJpeg = bytes(JPEG).slice(0, -2); invalid(() => encodeRasterDataUrl("a.jpg", corruptJpeg));
  const corruptWebp = bytes(WEBP); corruptWebp[4] ^= 1; invalid(() => encodeRasterDataUrl("a.webp", corruptWebp));
  const hugeWebp = bytes(WEBP); hugeWebp[26] = 0xff; hugeWebp[27] = 0x3f; invalid(() => encodeRasterDataUrl("a.webp", hugeWebp));
  invalid(() => encodeRasterDataUrl("a.png", new Uint8Array(STATIC_RESOURCE_LIMITS.rasterFileBytes + 1)));
  invalid(() => decodeRasterDataUrl("a.png", "data:image/png;base64," + "A".repeat(4 * Math.ceil(STATIC_RESOURCE_LIMITS.rasterFileBytes / 3) + 4)));
});

test("raster size limits use decoded bytes and retain exact per-file and package boundaries", () => {
  const original = bytes(JPEG), target = STATIC_RESOURCE_LIMITS.rasterFileBytes;
  const padded = new Uint8Array(target); padded.set(original.subarray(0, 2));
  let offset = 2, remaining = target - original.length;
  while (remaining) {
    let chunk = Math.min(65537, remaining);
    if (remaining > chunk && remaining - chunk < 4) chunk -= 4;
    padded[offset] = 0xff; padded[offset + 1] = 0xef;
    padded[offset + 2] = (chunk - 2) >>> 8; padded[offset + 3] = (chunk - 2) & 255;
    offset += chunk; remaining -= chunk;
  }
  padded.set(original.subarray(2), offset);
  const value = encodeRasterDataUrl("a.jpg", padded);
  assert.equal(decodeRasterDataUrl("a.jpg", value).bytes.byteLength, target);
  const files = { "index.html": html(), "a.jpg": value, "b.jpg": value, "c.jpg": value, "d.jpg": value };
  assert.ok(validateStaticFiles(files));
  invalid(() => validateStaticFiles({ ...files, "extra.png": image() }));
  const oversized = new Uint8Array(target + 1); oversized.set(padded);
  invalid(() => encodeRasterDataUrl("a.jpg", oversized));
});

test("relative references resolve inside a package without fetching or silently admitting encoded/external targets", () => {
  for (const [from, reference, expected] of [
    ["index.html", "./assets/shop.png?v=1#image", "assets/shop.png"],
    ["pages/contact.html", "../assets/shop.png", "assets/shop.png"],
    ["assets/css/main.css", "../images/shop.webp", "assets/images/shop.webp"],
    ["pages/contact.html", "#booking", "pages/contact.html"],
  ]) assert.equal(resolveStaticReference(from, reference), expected);
  for (const reference of ["../../outside.png", "/assets/a.png", "//example.test/a.png", "https://example.test/a.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "a%2f..%2fb.png", "a\\b.png"]) assert.equal(resolveStaticReference("index.html", reference), undefined, reference);
});

test("resource findings cover HTML, CSS imports, nested URLs and responsive images deterministically", () => {
  const files = validateStaticFiles({
    "index.html": html('<link rel="stylesheet" href="assets/css/main.css">', '<img src="assets/shop.png"><img srcset="assets/shop.png 1x, assets/missing.webp 2x"><a href="pages/contact.html#booking">Contact</a>'),
    "pages/contact.html": html('<link rel="stylesheet" href="../assets/css/main.css">', '<div id="booking" style="background:url(../assets/missing.jpg)">Contact</div>'),
    "assets/css/main.css": '@import "theme.css"; body{background:url(../shop.png)} .remote{background:url(https://example.test/photo.jpg)}',
    "assets/css/theme.css": "body { color: #123 }",
    "assets/shop.png": image(),
  });
  const report = inspectStaticResources(files);
  assert.equal(report.method, "static-resources-v1"); assert.equal(report.checked, 10);
  assert.deepEqual(report.findings, [
    { from: "assets/css/main.css", reference: "https://example.test/photo.jpg", kind: "blocked" },
    { from: "index.html", reference: "assets/missing.webp", target: "assets/missing.webp", kind: "missing" },
    { from: "pages/contact.html", reference: "../assets/missing.jpg", target: "assets/missing.jpg", kind: "missing" },
  ]);
  assert.deepEqual(inspectStaticResources(Object.fromEntries(Object.entries(files).reverse())), report);
  const ignored = inspectStaticResources({ "index.html": html("", '<!--<img src="comment.png">--><template><img src="template.png"></template><script>"<img src=script.png>"</script>') });
  assert.equal(ignored.checked, 0); assert.deepEqual(ignored.findings, []);
  const uncertain = inspectStaticResources({ "index.html": html('<style>body{background:url( "bad path.png" )}</style>') });
  assert.ok(uncertain.findings.some(entry => entry.kind === "blocked" || entry.kind === "uninspectable"));
  const many = inspectStaticResources({ "index.html": html("", Array.from({ length: 1000 }, (_, i) => `<img src="missing${i}.png">`).join("")) });
  assert.equal(many.checked, 400); assert.ok(many.findings.length <= 401);
  assert.ok(many.findings.some(entry => entry.kind === "uninspectable"));
  const long = inspectStaticResources({ "index.html": html("", `<img src="https://example.test/${"x".repeat(2000)}.png">`) });
  assert.equal(long.findings[0].reference.length, 500);
});

test("directory page/link requirements and resource reports are saved on each independent delivery version", () => {
  const parsed = parseStaticProject({ title: "Shop", summary: "Static pages", amount: "15.00", requiredPages: ["index.html", "pages/contact.html"], link: { from: "pages/contact.html", text: "Home", to: "index.html#top" } }, "en");
  const files = { "index.html": html("", '<h1 id="top">Home</h1><img src="assets/shop.png">'), "pages/contact.html": html("", '<a href="../index.html#top">Home</a>'), "assets/shop.png": image() };
  const first = createUploadedDelivery(files, parsed.project, "en", 1);
  assert.equal(first.evidence.find(entry => entry.criterionId === "link")!.finding, "pass");
  assert.deepEqual(first.resources?.findings, []);
  const replacement = createUploadedDelivery({ ...files, "index.html": html("", '<h1 id="top">Home</h1><img src="assets/absent.png">') }, parsed.project, "en", 2);
  assert.notEqual(first.id, replacement.id);
  assert.deepEqual(first.resources?.findings, []);
  assert.equal(replacement.resources!.findings[0].target, "assets/absent.png");
  assert.deepEqual(first.files, files);
});

test("preview returns decoded raster bytes, exact text and same-version-only asset CSP", async () => {
  const base = "https://example.test/proof-versions/case/version-one/";
  const raster = staticPreviewResponse("images/shop.png", image(), base, "version-one");
  assert.equal(raster.headers.get("content-type"), "image/png");
  assert.deepEqual(new Uint8Array(await raster.arrayBuffer()), bytes(PNG));
  const source = html("", '<form action="https://example.test/send"><button>Send</button></form><script>alert(1)</script>');
  const preview = staticPreviewResponse("index.html", source, base, "version-one");
  assert.equal(await preview.text(), source);
  const csp = preview.headers.get("content-security-policy")!;
  assert.ok(csp.includes(`style-src ${base} 'unsafe-inline'`)); assert.ok(csp.includes(`img-src ${base}`));
  assert.ok(csp.includes("default-src 'none'")); assert.ok(csp.includes("form-action 'none'")); assert.ok(csp.includes("base-uri 'none'"));
  assert.ok(csp.includes("sandbox allow-same-origin")); assert.ok(!csp.includes("allow-scripts")); assert.ok(!csp.includes("data:"));
  assert.equal(preview.headers.get("x-proofbeforepay-delivery"), "version-one");
  assert.equal(preview.headers.get("cache-control"), "no-store"); assert.equal(preview.headers.get("x-content-type-options"), "nosniff");
  invalid(() => staticPreviewResponse("app.js", "alert(1)", base, "version-one"));
});
