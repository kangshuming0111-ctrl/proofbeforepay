import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import type {ProofAssessmentCitation, ProofCriterion} from "../lib/contracts.ts";
import {createUniversalSourceListEvidenceCheck} from "../lib/universal-source-list-evidence.ts";

const body = (content: string, head = "") => `<!doctype html><html><head><title>Source</title>${head}</head><body>${content}</body></html>`;
const nav = '<nav id="mainNav"><a>Home</a><a>About</a><a>Sample Post</a><a>Contact</a></nav>';
const criterion: ProofCriterion = {id: "coverage-1", title: "Source list", source: "Text content in mainNav on all four pages must include Home and About and Sample Post and Contact"};
const fourFiles = (content = nav) => Object.fromEntries(["index.html", "about.html", "post.html", "contact.html"].map(file => [file, body(content)]));
function cite(files: Record<string, string>, file: string, excerpt: string, start = files[file].indexOf(excerpt)): ProofAssessmentCitation {
  assert.ok(start >= 0); assert.equal(files[file].slice(start, start + excerpt.length), excerpt);
  return {file, start, end: start + excerpt.length, excerpt};
}
const navCitations = (files: Record<string, string>, excerpt = nav) => Object.keys(files).filter(file => file.endsWith(".html")).map(file => cite(files, file, excerpt));

test("four complete compact page citations witness all literal labels without a verdict or input mutation", () => {
  const files = fourFiles(), required = Object.keys(files), citations = navCitations(files), before = structuredClone({files, required, criterion, citations});
  const result = createUniversalSourceListEvidenceCheck(files, required)(criterion, citations);
  assert.deepEqual(result, {kind: "covered"}); assert.equal("status" in result, false); assert.equal("accepted" in result, false);
  assert.deepEqual({files, required, criterion, citations}, before);
  assert.equal(createUniversalSourceListEvidenceCheck({...files, "theme.css": "nav{display:flex}"}, required)(criterion, citations).kind, "covered");
});

test("every bound HTML page needs target-local evidence rather than another page or adjacent navigation", () => {
  const files = fourFiles(`${nav}<nav id="sideNav"><a>Home</a><a>About</a><a>Sample Post</a><a>Contact</a></nav>`), citations = navCitations(files);
  const check = createUniversalSourceListEvidenceCheck(files, Object.keys(files));
  assert.equal(check(criterion, citations.slice(0, 3)).kind, "unknown");
  const sideNav = nav.replace("mainNav", "sideNav");
  assert.equal(check(criterion, navCitations(files, sideNav)).kind, "unknown");
  const repeatedFirst = [citations[0], citations[0], citations[0], citations[0]];
  assert.equal(check(criterion, repeatedFirst).kind, "unknown");
});

test("inline text can form a label but missing fragments or unrelated link owners cannot", () => {
  const split = nav.replace("Sample Post", "<span>Sample </span><em>Post</em>"), files = fourFiles(split);
  assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files, split)).kind, "covered");
  for (const replacement of ['<a>Sample</a><a>Post</a>', '<a>Sample</a>', '<a>sample post</a>']) {
    const bad = nav.replace("<a>Sample Post</a>", replacement), changed = fourFiles(bad);
    assert.equal(createUniversalSourceListEvidenceCheck(changed)(criterion, navCitations(changed, bad)).kind, "unknown");
  }
  const missing = nav.replace("<a>Contact</a>", ""), changed = fourFiles(missing);
  assert.equal(createUniversalSourceListEvidenceCheck(changed)(criterion, navCitations(changed, missing)).kind, "unknown");
  const one = {"index.html": body('<nav id="mainNav"><a>Sample <span>Post</span></a></nav>')};
  const single = {...criterion, source: "Text content in mainNav on all one pages must include Sample Post"};
  assert.equal(createUniversalSourceListEvidenceCheck(one)(single, [cite(one, "index.html", "Sample ")]).kind, "unknown");
  assert.equal(createUniversalSourceListEvidenceCheck(one)(single, [cite(one, "index.html", "Sample "), cite(one, "index.html", "Post")]).kind, "covered");
});

test("complete entity source units and non-BMP UTF-16 positions are required even for split citations", () => {
  const text = '<nav id="mainNav"><a>Home</a><a>Research &amp; Development</a></nav>', files = {"index.html": body(`🍜${text}`)};
  const requirement = {...criterion, source: "Text content in mainNav on all 1 pages must include Home and Research & Development"};
  const check = createUniversalSourceListEvidenceCheck(files), complete = [cite(files, "index.html", "Home"), cite(files, "index.html", "Research &amp; Development")];
  assert.equal(check(requirement, complete).kind, "covered");
  assert.equal(complete[1].start, files["index.html"].indexOf("Research"));
  const truncated = [cite(files, "index.html", "Home"), cite(files, "index.html", "Research &amp"), cite(files, "index.html", " Development")];
  assert.equal(check(requirement, truncated).kind, "unknown");
  assert.equal(check(requirement, [{...complete[1], start: complete[1].start - 1}, complete[0]]).reason, "invalid_citation");
  const emoji = {"index.html": body('<nav id="mainNav"><a>About 🍜</a></nav>')}, emojiRequirement = {...criterion, source: "Text content in mainNav on all one pages must include About 🍜"};
  assert.equal(createUniversalSourceListEvidenceCheck(emoji)(emojiRequirement, [cite(emoji, "index.html", "About 🍜")]).kind, "covered");
  const start = emoji["index.html"].indexOf("🍜");
  assert.equal(createUniversalSourceListEvidenceCheck(emoji)(emojiRequirement, [cite(emoji, "index.html", "About "), {file: "index.html", start, end: start + 1, excerpt: emoji["index.html"].slice(start, start + 1)}]).kind, "unknown");
});

test("only a unique active body id and actual text can witness labels", () => {
  for (const replacement of [
    `${nav}${nav}`,
    nav.replace("<a>Contact</a>", "<template><a>Contact</a></template>"),
    nav.replace("<a>Contact</a>", '<script>const text="Contact"</script>'),
    nav.replace("<a>Contact</a>", '<a hidden>Contact</a>'),
    nav.replace("<a>Contact</a>", '<a inert>Contact</a>'),
    nav.replace("<a>Contact</a>", '<a aria-hidden="true">Contact</a>'),
    nav.replace("<a>Contact</a>", '<svg><text>Contact</text></svg>'),
    nav.replace("<a>Contact</a>", '<a title="Contact">Missing</a>'),
    nav.replace("mainNav", "mainnav"),
  ]) {
    const files = fourFiles(replacement);
    assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files, replacement)).kind, "unknown", replacement);
  }
  for (const duplicate of [
    '<div hidden id="mainNav">Home About Sample Post Contact</div>',
    '<div hidden><nav id="mainNav">Hidden owner</nav></div>',
    '<svg id="mainNav"><text>Foreign owner</text></svg>',
    '<script id="mainNav">const ignored="Home"</script>',
  ]) {
    const files = fourFiles(`${nav}${duplicate}`);
    assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files)).reason, "target_not_unique_or_missing");
  }
  const templateDuplicate = `${nav}<template><nav id="mainNav">Inert content owner</nav></template>`, files = fourFiles(templateDuplicate);
  assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files)).kind, "covered");
  const headDuplicate = Object.fromEntries(Object.keys(fourFiles()).map(file => [file, body(nav, '<meta id="mainNav" name="source" content="ignored">')]));
  assert.equal(createUniversalSourceListEvidenceCheck(headDuplicate)(criterion, navCitations(headDuplicate)).reason, "target_not_unique_or_missing");
});

test("only the complete finite list grammar can bind a universal scope", () => {
  const files = fourFiles(), check = createUniversalSourceListEvidenceCheck(files), citations = navCitations(files);
  for (const source of [
    criterion.source + " and actually send email",
    criterion.source + ". Then save a transaction record",
    criterion.source.replace("Contact", "Contact after a reload"),
    criterion.source.replace("four", "eleven"),
    criterion.source.replace("Home and About and Sample Post and Contact", "One and Two and Three and Four and Five and Six and Seven"),
  ]) assert.deepEqual(check({...criterion, source}, citations), {kind: "unknown", reason: "unsupported_list_requirement"}, source);
  assert.deepEqual(check({...criterion, source: "The menu must include a Home link."}, citations), {kind: "not_applicable"});
  for (const source of ["Text content in FAQ must include delivery times", "Text content in footer must state the address", criterion.source.replace("mainNav", "mainNav on another element")])
    assert.deepEqual(check({...criterion, source}, citations), {kind: "not_applicable"}, source);
  assert.equal(check({...criterion, source: criterion.source.replace("four", "4")}, citations).kind, "covered");
});

test("repeated matches and entity decoding have deterministic bounded work without partial acceptance", () => {
  const repeated = {"index.html": body(`<nav id="mainNav">${"Home ".repeat(11_000)}</nav><p>Other</p>`)}, requirement = {...criterion, source: "Text content in mainNav on all one pages must include Home"};
  assert.equal(createUniversalSourceListEvidenceCheck(repeated)(requirement, [cite(repeated, "index.html", "Other")]).kind, "unknown");
  const cached = {"index.html": body(`<nav id="mainNav">Home ${"&amp;".repeat(2_100)}</nav>`)}, citations = [cite(cached, "index.html", "Home")];
  assert.equal(createUniversalSourceListEvidenceCheck(cached)(requirement, citations).kind, "covered");
  const manyEntities = (count: number) => ({"index.html": body(`<nav id="mainNav">Home ${Array.from({length: count}, (_, index) => `&#x${(0x4e00 + index).toString(16)};`).join("")}</nav>`)});
  const atLimit = manyEntities(2_048), beyond = manyEntities(2_049);
  assert.equal(createUniversalSourceListEvidenceCheck(atLimit)(requirement, [cite(atLimit, "index.html", "Home")]).kind, "covered");
  assert.equal(createUniversalSourceListEvidenceCheck(beyond)(requirement, [cite(beyond, "index.html", "Home")]).reason, "parse_or_budget");
});

test("a count mismatch or missing required page prevents binding all supplied HTML files", () => {
  const files = fourFiles(), citations = navCitations(files);
  assert.equal(createUniversalSourceListEvidenceCheck(files, ["terms.html"])(criterion, citations).reason, "unconfirmed_page_scope");
  assert.equal(createUniversalSourceListEvidenceCheck(files)({...criterion, source: criterion.source.replace("four", "three")}, citations).reason, "unconfirmed_page_scope");
  assert.equal(createUniversalSourceListEvidenceCheck({...files, "extra.html": body(nav)})(criterion, citations).reason, "unconfirmed_page_scope");
});

test("uppercase HTML extensions belong to the complete page set without path alias rewriting", () => {
  const files = {"index.html": body(nav), "About.HTML": body(nav)}, citations = Object.keys(files).map(file => cite(files, file, nav));
  const two = {...criterion, source: criterion.source.replace("four", "two")}, one = {...criterion, source: criterion.source.replace("four", "one")};
  assert.equal(createUniversalSourceListEvidenceCheck(files, Object.keys(files))(two, citations).kind, "covered");
  assert.equal(createUniversalSourceListEvidenceCheck(files)(one, [citations[0]]).reason, "unconfirmed_page_scope");
  for (const required of [["./index.html", "About.HTML"], ["index.html", "about.html"], ["index.html", "./About.HTML"]])
    assert.equal(createUniversalSourceListEvidenceCheck(files, required)(two, citations).reason, "unconfirmed_page_scope");
});

test("known hiding, inline-style and dynamic-template hints conservatively prevent an active source witness", () => {
  for (const hint of [
    'style="color:red"', 'style="display:none"', 'contenteditable="false"', 'onclick="update()"',
    'v-if="ready"', 'x-text="label"', 'ng-bind="label"', ':class="state"', '@click="update"',
    'data-bind="text:label"', 'data-template="nav"', 'data-dynamic="true"', 'data-content="nav"',
    'class="d-none"', 'class="hidden"', 'class="sr-only"', 'class="visually-hidden"', 'class="invisible"', 'class="is-hidden"',
  ]) {
    const changed = nav.replace('<nav id="mainNav">', `<nav id="mainNav" ${hint}>`), files = fourFiles(changed);
    assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files, changed)).kind, "unknown", hint);
    const duplicate = fourFiles(`${nav}<div id="mainNav" ${hint}>Other source owner</div>`);
    assert.equal(createUniversalSourceListEvidenceCheck(duplicate)(criterion, navCitations(duplicate)).reason, "target_not_unique_or_missing", `duplicate ${hint}`);
  }
});

test("parse errors, unlocated closure, deep trees and oversized citations remain unknown", () => {
  for (const content of [nav.replace('<nav id="mainNav">', '<nav id="mainNav" id="again">'), nav.replace("</nav>", ""), `${"<div>".repeat(514)}${nav}${"</div>".repeat(514)}`]) {
    const files = fourFiles(content), excerpt = content.length <= 500 ? content : nav;
    assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files, excerpt)).kind, "unknown");
  }
  const text = `${nav}${" ".repeat(501)}`, files = fourFiles(text);
  assert.equal(createUniversalSourceListEvidenceCheck(files)(criterion, navCitations(files, text)).reason, "invalid_citation");
});

test("the retained Clean Blog eight-citation answer cannot be truncated into a six-citation success", async () => {
  const run = JSON.parse(await readFile(new URL("../public/benchmarks/citation-relations-2026-11-05/cycle-14-known-live.json", import.meta.url), "utf8"));
  const answer = run.results.find((row: {id: string}) => row.id === "real-holdout-clean-blog"), snapshot = run.snapshot.projects.find((row: {id: string}) => row.id === answer.id);
  const packet = JSON.parse(JSON.parse(snapshot.requestBody).messages[1].content), files = packet.files as Record<string, string>, original = answer.criteria[0].rawCitations as ProofAssessmentCitation[];
  assert.equal(original.length, 8); const before = JSON.stringify({answer, snapshot});
  const check = createUniversalSourceListEvidenceCheck(files, Object.keys(files)), requirement = packet.criteria.find((row: {id: string}) => row.id === "coverage-1") as ProofCriterion;
  assert.equal(check(requirement, original).reason, "citation_limit");
  let checked = 0;
  for (let first = 0; first < original.length; first++) for (let second = first + 1; second < original.length; second++) {
    const subset = original.filter((_, index) => index !== first && index !== second), result = check(requirement, subset);
    assert.equal(result.kind, "unknown"); assert.equal(result.reason, "literal_not_witnessed"); checked++;
  }
  assert.equal(checked, 28); assert.equal(JSON.stringify({answer, snapshot}), before);
});
