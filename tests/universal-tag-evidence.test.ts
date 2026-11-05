import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import type {ProofAssessmentCitation,ProofCriterion} from "../lib/contracts.ts";
import {createUniversalTagEvidenceCheck} from "../lib/universal-tag-evidence.ts";
import {createAssessmentCitationCatalog} from "../lib/assessment-citation-catalog.ts";

const html=(body:string,head="")=>`<!doctype html><html><head>${head}</head><body>${body}</body></html>`;
const roleA:ProofCriterion={id:"coverage-3",title:"Original requirement 3",source:"The homepage and full menu source content must both attach the GF tag to Whipped cod roe"};
const roleB:ProofCriterion={id:"coverage-1",title:"Original requirement 1",source:"The homepage lunch menu and full menu source content must each pair Cacio e pepe with the V tag and advertised price £14"};
const a={...roleA,source:roleA.source.replace("homepage and full menu","index.html and menu.html")};
const b={...roleB,source:roleB.source.replace("homepage lunch menu and full menu","index.html and menu.html")};
const dish=(label="Whipped cod roe",tag="GF",price="£9")=>`<div class="dish"><span class="name">${label}</span>${tag?`<span class="tag">${tag}</span>`:""}${price?`<span class="price">${price}</span>`:""}</div>`;
function cite(file:string,source:string,excerpt:string):ProofAssessmentCitation{
 const start=source.indexOf(excerpt);assert.ok(start>=0);
 return{file,start,end:start+excerpt.length,excerpt};
}
function fixture(first=dish(),second=dish()){
 const files={"index.html":html(first),"menu.html":html(second)};
 const citations=[cite("index.html",files["index.html"],first),cite("menu.html",files["menu.html"],second)];
 return{files,citations,check:createUniversalTagEvidenceCheck(files,["index.html","menu.html"])};
}

test("universal tag witness needs a complete unique nearest owner on each confirmed page",()=>{
 const f=fixture(),before=structuredClone({files:f.files,citations:f.citations,criterion:a});
 assert.deepEqual(f.check(a,f.citations),{kind:"covered"});
 assert.deepEqual({files:f.files,citations:f.citations,criterion:a},before);
 assert.equal(f.check(a,f.citations.slice(0,1)).kind,"unknown");
});

test("tags on a neighbouring dish or an enclosing grandparent do not witness the target owner",()=>{
 const target=dish("Whipped cod roe",""),neighbour=dish("Olives","GF","£4");
 const f=fixture(dish(),target+neighbour);
 assert.equal(f.check(a,f.citations).kind,"unknown");
 const grouped=`<div class="menu">${target}${neighbour}</div>`,g=fixture(dish(),grouped);
 assert.equal(g.check(a,g.citations).kind,"unknown");
 const flat="<div><span>Whipped cod roe</span><span>Olives</span><span>GF</span></div>";
 assert.equal(fixture(flat,flat).check(a,fixture(flat,flat).citations).kind,"unknown");
});

test("one page cannot borrow a matching tag or a citation from another page",()=>{
 const f=fixture(dish(),dish("Whipped cod roe","V"));
 assert.equal(f.check(a,f.citations).kind,"unknown");
 const files={"index.html":html(dish())},check=createUniversalTagEvidenceCheck(files,["index.html","menu.html"]);
 assert.equal(check(a,[cite("index.html",files["index.html"],dish())]).kind,"unknown");
});

test("partial owner snippets and adjacent fixed windows are not a single complete-owner witness",()=>{
 const f=fixture(),owner=dish(),cut=owner.indexOf("GF")+2;
 const split=[cite("index.html",f.files["index.html"],owner.slice(0,cut)),cite("index.html",f.files["index.html"],owner.slice(cut)),f.citations[1]];
 assert.equal(f.check(a,split).kind,"unknown");
 assert.equal(f.check(a,[cite("index.html",f.files["index.html"],"<span class=\"name\">Whipped cod roe</span>"),f.citations[1]]).kind,"unknown");
 assert.equal(f.check(a,[{...f.citations[0],start:f.citations[0].start+1},f.citations[1]]).kind,"unknown");
});

test("pair witness compares the same money glyph and numeric amount without inferring ISO currency",()=>{
 const f=fixture(dish("Cacio e pepe","V","&pound;14"),dish("Cacio e pepe","V","£14.00"));
 assert.deepEqual(f.check(b,f.citations),{kind:"covered"});
 for(const price of ["£15","$14","EUR 14","£14 each","£14 and £15"]){
  const g=fixture(dish("Cacio e pepe","V","£14"),dish("Cacio e pepe","V",price));
  assert.equal(g.check(b,g.citations).kind,"unknown",price);
 }
});

test("tags must be separate literal text and label identity may not be duplicated or split",()=>{
 for(const row of [dish("Whipped cod roe","GF on request"),dish()+dish(),"<div><span>Whipped cod </span><em>roe</em><span>GF</span></div>",
  "<div><span>Whipped cod roe</span><span>G</span><span>F</span></div>"]){
  const f=fixture(row,row);assert.equal(f.check(a,f.citations).kind,"unknown");
 }
});

test("explicit filenames require every named file while role-only scope has no trusted mapping",()=>{
 const f=fixture();
 assert.equal(createUniversalTagEvidenceCheck(f.files,["index.html"])(a,f.citations).kind,"covered");
 for(const pages of [["index.html","menu.html"],["index.html","menu.html","contact.html"],["menu.html","contact.html"]])
  assert.deepEqual(createUniversalTagEvidenceCheck(f.files,pages)(roleA,f.citations),{kind:"unknown",reason:"unconfirmed_page_scope"});
 assert.equal(createUniversalTagEvidenceCheck(f.files,["index.html","menu.html"])( {...a,source:a.source.replace("menu.html","contact.html")},f.citations).kind,"unknown");
});

test("index plus terms cannot silently substitute for a delivered full-menu page lacking the tag",()=>{
 const row=dish(),files={"index.html":html(row),"terms.html":html(row),"menu.html":html(dish("Whipped cod roe",""))};
 const citations=[cite("index.html",files["index.html"],row),cite("terms.html",files["terms.html"],row)];
 const check=createUniversalTagEvidenceCheck(files,["index.html","terms.html"]);
 assert.deepEqual(check(roleA,citations),{kind:"unknown",reason:"unconfirmed_page_scope"});
 assert.deepEqual(check(roleB,citations),{kind:"unknown",reason:"unconfirmed_page_scope"});
});

test("hidden, inert, foreign, inline-style and dynamic owner contexts remain unknown",()=>{
 const row=dish();
 for(const wrapped of [row.replace('<div class="dish">','<div class="dish" hidden>'),`<div inert>${row}</div>`,`<div style="display:block">${row}</div>`,
  `<div aria-hidden="true">${row}</div>`,`<div class="d-none">${row}</div>`,`<div v-if="ready">${row}</div>`,`<template>${row}</template>`,
  `<svg><foreignObject>${row}</foreignObject></svg>`,row.replace('</div>','<script>void 0</script></div>')]){
  const f=fixture(wrapped,wrapped);assert.equal(f.check(a,f.citations).kind,"unknown",wrapped);
 }
 const headOnly={"index.html":html("<p>Other</p>",`<title>Whipped cod roe GF</title>`),"menu.html":html("<p>Other</p>")};
 assert.equal(createUniversalTagEvidenceCheck(headOnly,["index.html","menu.html"])(a,[]).kind,"unknown");
});

test("ordinary external scripts do not become execution or negate explicit raw source facts",()=>{
 const row=dish(),body=row+'<script src="uninspected.js"></script>';
 const f=fixture(body,body);
 const citations=[cite("index.html",f.files["index.html"],row),cite("menu.html",f.files["menu.html"],row)];
 assert.equal(f.check(a,citations).kind,"covered");
});

test("nearby negative, exact, runtime and conditional clauses never inherit the finite allowance",()=>{
 const f=fixture();
 for(const source of [a.source+" if available",a.source+" and also show V",a.source.replace("must both","must not both"),
  a.source.replace("the GF tag","the exact GF tag"),a.source.replace("the GF tag","the gf tag"),b.source+" and actually accept payment"])
  assert.equal(f.check({...a,source},f.citations).kind,"unknown",source);
 assert.equal(f.check({...a,title:"Actual mobile experience"},f.citations).kind,"unknown");
 assert.equal(f.check({...a,source:"The page copy must include the restaurant name"},f.citations).kind,"not_applicable");
});

test("oversized, malformed or unlocated owner evidence stays unknown without changing source",()=>{
 const long=dish().replace('</div>',"x".repeat(500)+"</div>"),f=fixture(long,long);
 assert.equal(f.check(a,[]).kind,"unknown");
 const malformed=html('<div class="dish" class="other"><span>Whipped cod roe</span><span>GF</span></div>');
 assert.equal(createUniversalTagEvidenceCheck({"index.html":malformed,"menu.html":malformed},["index.html","menu.html"])(a,[]).kind,"unknown");
});

// Exact saved source-citation witnesses from the original cycle-13 first reply.
// Original report SHA-256: 62bcb6da58a6ef93d2cdea3081d6d14fd04ae892c013c3e75416f43fe8d6fe9b
// This fixture replays saved evidence only; it performs no provider call and
// leaves the original report and authored references unchanged.
const retainedFirstReply={
  "coverage-1": {
    "originalStatus": "supported",
    "citations": [
      {
        "file": "index.html",
        "start": 6800,
        "end": 7200,
        "excerpt": "v class=\"dish\"><span class=\"dish-name\">Cacio e pepe<span class=\"dish-tags\"><span class=\"dish-tag\">V</span></span></span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;14</span></div>\n                <p class=\"dish-note\">Tonnarelli rolled this morning, Pecorino Romano.</p>\n                <div class=\"dish\"><span class=\"dish-name\">Hake, brown butter</span><span class=\"dish-leader\">"
      },
      {
        "file": "menu.html",
        "start": 6400,
        "end": 6800,
        "excerpt": "n class=\"dish-tag\">V</span></span></span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;14</span></div>\n            <p class=\"dish-note\">Tonnarelli rolled this morning, Pecorino Romano, a lot of pepper.</p>\n            <div class=\"dish\"><span class=\"dish-name\">Pappardelle, ox cheek</span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;19</span></div>\n            "
      },
      {
        "file": "menu.html",
        "start": 6272,
        "end": 6305,
        "excerpt": "<p class=\"course-label\">Pasta</p>"
      },
      {
        "file": "index.html",
        "start": 5600,
        "end": 6000,
        "excerpt": "ctive\" id=\"svcLunch\" role=\"tabpanel\">\n          <div class=\"menu-card\">\n            <div class=\"row g-7\">\n              <div class=\"md:col-6\">\n                <p class=\"course-label\">To start</p>\n                <div class=\"dish\"><span class=\"dish-name\">Focaccia, new oil</span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;5</span></div>\n                <p class=\"dish-note\">Rosem"
      }
    ]
  },
  "coverage-3": {
    "originalStatus": "supported",
    "citations": [
      {
        "file": "index.html",
        "start": 6000,
        "end": 6400,
        "excerpt": "ary, coarse salt. Baked at eleven.</p>\n                <div class=\"dish\"><span class=\"dish-name\">Whipped cod roe<span class=\"dish-tags\"><span class=\"dish-tag\">GF</span></span></span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;9</span></div>\n                <p class=\"dish-note\">Grilled sourdough, pickled fennel.</p>\n                <div class=\"dish\"><span class=\"dish-name\">Toma"
      },
      {
        "file": "menu.html",
        "start": 4800,
        "end": 5200,
        "excerpt": "=\"dish-name\">Castelvetrano olives<span class=\"dish-tags\"><span class=\"dish-tag\">VG</span><span class=\"dish-tag\">GF</span></span></span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;4</span></div>\n            <p class=\"dish-note\">Warmed with orange peel and fennel seed.</p>\n            <div class=\"dish\"><span class=\"dish-name\">Whipped cod roe</span><span class=\"dish-leader\"></spa"
      },
      {
        "file": "menu.html",
        "start": 5200,
        "end": 5600,
        "excerpt": "n><span class=\"dish-price\">&pound;9</span></div>\n            <p class=\"dish-note\">Grilled sourdough, pickled fennel.</p>\n            <div class=\"dish\"><span class=\"dish-name\">Veal tonnato</span><span class=\"dish-leader\"></span><span class=\"dish-price\">&pound;13</span></div>\n            <p class=\"dish-note\">Rose veal from Somerset, tuna emulsion, capers.</p>\n            <div class=\"dish\"><span clas"
      }
    ]
  }
};

test("retained Tavola first-reply evidence loses neither original source nor the universal-page boundary",async()=>{
 const corpusText=readFileSync(new URL("../scripts/project-assessment-corpus-citation-relations-holdout.json",import.meta.url),"utf8");
 assert.equal(createHash("sha256").update(corpusText).digest("hex"),"96a4f7b18a2440d9c589f2ad8d3583ea7c98aecc9eee00292db31098e036d900");
 const corpus=JSON.parse(corpusText) as {projects:{id:string;files:Record<string,string>;requiredPages:string[];criteria:ProofCriterion[]}[]};
 const p=corpus.projects.find(p=>p.id==="citation-relations-holdout-tavola")!,check=createUniversalTagEvidenceCheck(p.files,p.requiredPages);
 const before=structuredClone(retainedFirstReply);
 assert.equal(retainedFirstReply["coverage-3"].originalStatus,"supported");
 assert.deepEqual(check(p.criteria.find(c=>c.id==="coverage-3")!,retainedFirstReply["coverage-3"].citations),{kind:"unknown",reason:"unconfirmed_page_scope"});
 assert.deepEqual(check(p.criteria.find(c=>c.id==="coverage-1")!,retainedFirstReply["coverage-1"].citations),{kind:"unknown",reason:"unconfirmed_page_scope"});
 // These test-only counterfactual scopes exercise the owner layer. They do not
 // edit the original role requirements, references, first replies or scores.
 const explicitA={...p.criteria.find(c=>c.id==="coverage-3")!,source:a.source};
 const explicitB={...p.criteria.find(c=>c.id==="coverage-1")!,source:b.source};
 assert.equal(check(explicitA,retainedFirstReply["coverage-3"].citations).kind,"unknown");
 assert.equal(check(explicitB,retainedFirstReply["coverage-1"].citations).kind,"unknown");
 const catalog=await createAssessmentCitationCatalog(p.files,{fixture:"retained-tavola-complete-dish-owners"});
 const complete=p.requiredPages.map(file=>{
  const owner=catalog.entries.find(e=>e.file===file&&e.excerpt.startsWith('<div class="dish">')&&e.excerpt.includes("Cacio e pepe"));
  assert.ok(owner);const {id,...citation}=owner;assert.ok(id);return citation;
 });
 assert.equal(check(explicitB,complete).kind,"covered");
 assert.deepEqual(check(p.criteria.find(c=>c.id==="coverage-1")!,complete),{kind:"unknown",reason:"unconfirmed_page_scope"});
 assert.deepEqual(retainedFirstReply,before);
 assert.equal(createHash("sha256").update(readFileSync(new URL("../scripts/project-assessment-corpus-citation-relations-holdout.json",import.meta.url))).digest("hex"),"96a4f7b18a2440d9c589f2ad8d3583ea7c98aecc9eee00292db31098e036d900");
});

test("radio label/value pairing is not a universal-tag candidate",()=>{
 const c:ProofCriterion={id:"coverage-2",title:"Static radio source relationship",source:"The forms.html source content must pair Fulltime Part time and Remote radio labels with values 1 2 and 3 under the same employment name"};
 assert.equal(createUniversalTagEvidenceCheck({},[])(c,[]).kind,"not_applicable");
});
