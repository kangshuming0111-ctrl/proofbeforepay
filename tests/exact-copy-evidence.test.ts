import assert from "node:assert/strict";
import test from "node:test";
import { createExactCopyEvidenceCheck } from "../lib/exact-copy-evidence.ts";

const criterion = { id: "manual-1", title: "Exact tagline copy", source: 'The page copy must include the exact wording "Families, in every season."' };
function check(body: string, css = "") { return createExactCopyEvidenceCheck({ "index.html": `<!doctype html><html><head><title>Studio</title></head><body>${body}</body></html>`, "theme.css": css })(criterion); }

test("an explicit exact-copy mismatch remains different in case, punctuation and words", () => {
  for (const body of ["<p>Every family, in every season.</p>", "<p>families, in every season.</p>", "<p>Families in every season.</p>", "<p>Families, in every season!</p>"]) assert.equal(check(body).kind, "missing");
});

test("HTML entities, inline elements and HTML whitespace preserve literal body-copy presence", () => {
  assert.equal(check("<p>Families,&nbsp;<em>in every</em> season.</p>").kind, "present");
  assert.equal(check("<p>Families,\n\t in <strong>every</strong> season.</p>").kind, "present");
  assert.equal(check("<p>Families,<br>in every season.</p>").kind, "present");
  assert.equal(check("<p>Fam<!-- an ignored comment -->ilies, in every season.</p>").kind, "present");
  assert.equal(check("<p>Families,&#32;in every season&#46;</p>").kind, "present");
  assert.equal(check("<p>Families,\u2003in every season.</p>").kind, "missing", "non-HTML whitespace is not silently folded");
});

test("independent blocks, comments, title, image alt and JSON data are not body-copy presence", () => {
  assert.equal(check("<p>Families,</p><p>in every season.</p>").kind, "unknown");
  assert.equal(check('<!-- Families, in every season. --><img alt="Families, in every season." src="x.png">').kind, "missing");
  assert.equal(check('<script type="application/ld+json">{"text":"Families, in every season."}</script>').kind, "missing");
  const titleOnly = createExactCopyEvidenceCheck({ "index.html": "<!doctype html><title>Families, in every season.</title><p>Another phrase.</p>" })(criterion);
  assert.equal(titleOnly.kind, "missing");
});

test("script/template/generated or unavailable CSS makes absent static copy unknown", () => {
  for (const body of [
    '<script>document.body.append("Families, in every season.")</script>',
    '<script src="client.js"></script>',
    '<template><p>Families, in every season.</p></template>',
    '<noscript><p>Families, in every season.</p></noscript>',
    '<style>p::before{content:"Families, in every season."}</style><p></p>',
    '<link rel="stylesheet" href="external.css"><p>Another phrase</p>',
    '<p onclick="changeCopy()">Another phrase</p>',
    '<svg><text>Families, in every season.</text></svg>',
    '<input type="submit" value="Families, in every season.">',
  ]) assert.equal(check(body).kind, "unknown", body);
  assert.equal(check("<p>Another phrase.</p>", 'p::after{content:"Families, in every season."}').kind, "unknown");
  assert.equal(check("<p>Another phrase.</p>", '@import "other.css";').kind, "unknown");
});

test("literal presence in hidden body text remains presence only, not a visibility result", () => {
  const result = check('<p hidden style="display:none">Families, in every season.</p>');
  assert.equal(result.kind, "present");
  assert.deepEqual(Object.keys(result).sort(), ["kind", "literal"]);
});

test("implicit body copy remains readable while legacy frames retain unsupported remote-content uncertainty",()=>{
 const literal={id:"manual-1",title:"Exact tagline copy",source:'The page copy must include the exact wording "Families, in every season."'};
 for(const source of['<canvas></canvas><div>Families, in every season.</div>','<b></b><p>Families, in every season.</p>'])assert.equal(createExactCopyEvidenceCheck({"index.html":source})(literal).kind,"present");
 assert.equal(createExactCopyEvidenceCheck({"index.html":'<!doctype html><html><head><title>Studio</title></head><frameset><frame src="copy.html"></frameset></html>'})(literal).kind,"unknown");
});

test("only a whole explicitly exact-quoted directive is recognised, in either language", () => {
  const inspect = createExactCopyEvidenceCheck({ "index.html": "<!doctype html><p>Another phrase.</p>" });
  for (const source of [
    'The page copy must include "Families, in every season."',
    'The page copy must include the exact wording "Families, in every season." and add a footer.',
    'Display a heading with the exact wording "Families, in every season."',
    'The page copy should be similar to "Families, in every season."',
  ]) assert.equal(inspect({ ...criterion, source }).kind, "not_applicable", source);
  assert.equal(inspect({ ...criterion, source: '页面文案必须逐字包含：“每个家庭，每个季节。”' }).kind, "missing");
  assert.equal(inspect({ ...criterion, source: '网页文字须包含完全一致的文字「每个家庭，每个季节。」' }).kind, "missing");
});

test("parsing ambiguity/limits stay unknown and a lazy checker snapshots its source without mutation", () => {
  assert.equal(check('<p id="one" id="two">Another phrase.</p>').kind, "unknown");
  const files = { "index.html": "<!doctype html><p>Another phrase.</p>" }, original = structuredClone(files);
  const inspect = createExactCopyEvidenceCheck(files); files["index.html"] = "<!doctype html><p>Families, in every season.</p>";
  assert.equal(inspect(criterion).kind, "missing", "uses the original snapshot rather than a later mutable map");
  assert.equal(original["index.html"], "<!doctype html><p>Another phrase.</p>");
  assert.equal(createExactCopyEvidenceCheck({ "index.html": "x".repeat(262_145) })(criterion).kind, "unknown");
});
