import assert from "node:assert/strict";
import test from "node:test";
import type { ProofBrowserCheckReading, ProofQuote } from "../lib/contracts.ts";
import { DomainError } from "../lib/domain.ts";
import { createBrowserCheckReport, getBrowserCheckPlan, recordBrowserChecks } from "../lib/browser-check-report.ts";
import { savedBrowserFile } from "../lib/browser-check-probe.ts";
import { createUploadedDelivery, parseStaticProject } from "../lib/static-project.ts";

const html = '<!doctype html><html><head><title>Fixture</title></head><body><a href="contact.html#booking">Book a call</a><section id="booking">Consultation</section></body></html>';
const now = "2026-11-02T00:00:00.000Z";
function agreement(): ProofQuote {
  const parsed = parseStaticProject({title: "Browser test", summary: "Local static link and images", amount: "1.00", requiredPages: ["index.html", "contact.html"], link: {from: "index.html", text: "Book a call", to: "contact.html#booking"}, manualRequirements: []}, "en");
  const delivery = createUploadedDelivery({"index.html": html, "contact.html": html}, parsed.project, "en", 1);
  return {id: "browser-test", reference: "PBP-BROWSER", title: parsed.title, summary: parsed.summary, brief: parsed.summary, clientName: "Synthetic", currency: "AUD", language: "en", hourlyRateCents: 100, totalCents: 100,
    lineItems: [{id: "test", description: "Synthetic", quantity: 1, unitPriceCents: 100}], assumptions: [], questions: [], timelineDays: 1, status: "approved", aiMode: "demo", paymentMode: "demo", createdAt: now, workflow: "proof-v1",
    proof: {project: parsed.project, criteria: parsed.criteria, delivery, paymentState: "unfunded", audit: [], review: {deliveryId: delivery.id, reviewedAt: now, mode: "demo", summary: "Controlled"}}};
}
function input(quote: ProofQuote) {
  const readings: ProofBrowserCheckReading[] = getBrowserCheckPlan(quote).map(step => step.kind === "page"
    ? {stepId: step.stepId, status: "observed", kind: "page", stylesExpected: 1, stylesLoaded: 1, imagesExpected: 2, imagesLoaded: 2}
    : {stepId: step.stepId, status: "observed", kind: "link", sourceVisible: true, sourceHitTarget: true, activated: true, destinationMatched: true, targetVisible: true});
  return {deliveryId: quote.proof.delivery!.id, previousReportId: quote.proof.delivery!.browserChecks?.id ?? null, readings};
}
const invalid = (operation: () => unknown) => assert.throws(operation, DomainError);
test("browser plan covers actual/required pages at both widths and only the saved agreed link", () => {
  const quote = agreement(), before = structuredClone(quote);
  const plan = getBrowserCheckPlan(quote);
  assert.equal(plan.length, 6);
  assert.deepEqual(plan.filter(step => step.kind === "link").map(step => [step.viewportWidth, step.file, step.label, step.target]), [[375,"index.html","Book a call","contact.html#booking"],[900,"index.html","Book a call","contact.html#booking"]]);
  assert.deepEqual(quote,before);
  quote.proof.project!.link = undefined;
  assert.equal(getBrowserCheckPlan(quote).filter(step => step.kind === "link").length, 0);
});
test("multiple agreed navigation steps cover whole-page language changes and section targets independently", () => {
  const quote = agreement(); delete quote.proof.project!.link;
  quote.proof.project!.links = [
    {from:"index.html",text:"Menu",to:"contact.html"},
    {from:"contact.html",text:"中文",to:"index.html#booking"},
    {from:"index.html",text:"Visit",to:"contact.html#booking"},
  ];
  const plan = getBrowserCheckPlan(quote);
  assert.equal(plan.length,10);
  assert.deepEqual(plan.filter(row=>row.kind==="link").map(row=>[row.stepId,row.file,row.target]),[
    ["link:375","index.html","contact.html"],["link:900","index.html","contact.html"],
    ["link:375:2","contact.html","index.html#booking"],["link:900:2","contact.html","index.html#booking"],
    ["link:375:3","index.html","contact.html#booking"],["link:900:3","index.html","contact.html#booking"],
  ]);
  assert.equal(createBrowserCheckReport(quote,input(quote),now).summary.steps,10);
  const incomplete=input(quote);incomplete.readings=incomplete.readings.slice(0,-1);
  invalid(()=>createBrowserCheckReport(quote,incomplete,now));
  quote.proof.project!.links.push({from:"index.html",text:"Menu",to:"index.html"});
  invalid(()=>getBrowserCheckPlan(quote));
});
test("valid digit/underscore/punctuation fragment identifiers remain checkable and unsafe links are rejected", () => {
  for (const fragment of ["1booking", "_booking", "book.now:please-test"]) {
    const quote = agreement(); quote.proof.project!.link!.to = `contact.html#${fragment}`;
    assert.ok(getBrowserCheckPlan(quote).some(step => step.target === `contact.html#${fragment}`));
  }
  for (const to of ["https://other.test/x.html#booking", "../x.html#booking", "contact.html?x=1#booking", "contact.html#book#other"]) {
    const quote = agreement(); quote.proof.project!.link!.to = to; invalid(() => getBrowserCheckPlan(quote));
  }
});
test("the server derives summary and step labels from the saved plan, without modifying source or accepting work", () => {
  const quote = agreement(), value = input(quote), before = structuredClone(quote), original = structuredClone(value);
  const report = createBrowserCheckReport(quote,value,now);
  assert.deepEqual(report.summary,{steps:6,observed:6,issues:0,unavailable:0});
  assert.equal(report.deliveryId,quote.proof.delivery!.id); assert.equal(report.method,"client-browser-checks-v1");
  assert.equal(report.readings.at(-1)!.target,"contact.html#booking");
  assert.deepEqual(quote,before); assert.deepEqual(value,original);
  assert.equal(quote.proof.acceptedAt,undefined); assert.equal(quote.proof.paymentState,"unfunded");
});
test("hidden/covered source, wrong target visibility and resource load shortfalls do not count as matching observations", () => {
  const quote=agreement(), value=input(quote);
  value.readings[0]={...value.readings[0],kind:"page",status:"observed",stylesExpected:2,stylesLoaded:1,imagesExpected:2,imagesLoaded:0};
  value.readings[4]={stepId:"link:375",kind:"link",status:"observed",sourceVisible:false,sourceHitTarget:false,activated:false,destinationMatched:false,targetVisible:false};
  value.readings[5]={stepId:"link:900",kind:"link",status:"observed",sourceVisible:true,sourceHitTarget:true,activated:true,destinationMatched:true,targetVisible:false};
  assert.deepEqual(createBrowserCheckReport(quote,value,now).summary,{steps:6,observed:6,issues:3,unavailable:0});
});
test("unavailability is preserved and never counted as expected observation", () => {
  const quote=agreement(),value=input(quote);
  value.readings=value.readings.map(row=>({stepId:row.stepId,status:"unavailable",reason:"timeout"}));
  const report=createBrowserCheckReport(quote,value,now);
  assert.deepEqual(report.summary,{steps:6,observed:0,issues:0,unavailable:6});
  assert.ok(report.readings.every(row=>row.outcome==="unavailable"));
});
test("stale versions, lost update guards, missing observations, duplicates and injected outcome fields are rejected", () => {
  const quote=agreement();
  invalid(()=>createBrowserCheckReport(quote,{...input(quote),deliveryId:"old"}));
  invalid(()=>createBrowserCheckReport(quote,{...input(quote),previousReportId:"old"}));
  const missing={...input(quote)} as Record<string,unknown>;delete missing.previousReportId;invalid(()=>createBrowserCheckReport(quote,missing));
  const values=input(quote).readings;
  invalid(()=>createBrowserCheckReport(quote,{...input(quote),readings:values.slice(1)}));
  invalid(()=>createBrowserCheckReport(quote,{...input(quote),readings:[values[0],...values.slice(0,-1)]}));
  invalid(()=>createBrowserCheckReport(quote,{...input(quote),readings:[{...values[0],outcome:"expected_observation"},...values.slice(1)]}));
});
test("counts and booleans require exact types, bounded ranges and possible operation sequences", () => {
  const quote=agreement();
  for(const bad of ["1",[1],null,NaN,Infinity,-1,1.5,101]){
    const value=input(quote);value.readings[0]={...value.readings[0],stylesExpected:bad} as unknown as ProofBrowserCheckReading;
    invalid(()=>createBrowserCheckReport(quote,value));
  }
  const excess=input(quote);excess.readings[0]={stepId:excess.readings[0].stepId,status:"observed",kind:"page",stylesExpected:0,stylesLoaded:1,imagesExpected:0,imagesLoaded:0};invalid(()=>createBrowserCheckReport(quote,excess));
  for(const bad of ["true",[true],1,null]){const value=input(quote);value.readings[4]={...value.readings[4],activated:bad} as unknown as ProofBrowserCheckReading;invalid(()=>createBrowserCheckReport(quote,value));}
  const impossible=input(quote);impossible.readings[4]={...impossible.readings[4],activated:false} as ProofBrowserCheckReading;invalid(()=>createBrowserCheckReport(quote,impossible));
});
test("missing source pages cannot be reported as observed", () => {
  const quote=agreement(),value=input(quote);delete quote.proof.delivery!.files!["contact.html"];
  invalid(()=>createBrowserCheckReport(quote,value));
  value.readings=value.readings.map(row=>row.stepId.includes("contact.html") || row.stepId.startsWith("link:")?{stepId:row.stepId,status:"unavailable",reason:"missing_file"}:row);
  assert.equal(createBrowserCheckReport(quote,value,now).summary.unavailable,4);
});
test("member observations preserve current acceptance/payment and original reports; pending operations and drafts reject writes", () => {
  const quote=agreement();quote.status="paid";quote.proof.paymentState="captured";quote.proof.acceptedDeliveryId=quote.proof.delivery!.id;quote.proof.acceptedAt=now;quote.proof.manualChecks=["mobile"];
  const before=structuredClone(quote);
  for(const role of ["buyer","seller"] as const){const saved=recordBrowserChecks(quote,role,input(quote),now);assert.deepEqual(saved.proof.review,before.proof.review);assert.equal(saved.proof.acceptedAt,now);assert.equal(saved.proof.paymentState,"captured");assert.deepEqual(saved.proof.manualChecks,["mobile"]);assert.equal(saved.proof.audit.at(-1)?.kind,"browser_checked");assert.equal(saved.proof.delivery!.browserChecks!.reportedByRole,role);}
  assert.deepEqual(quote,before);
  invalid(()=>recordBrowserChecks(quote,"other" as "buyer",input(quote)));
  quote.proof.paymentOperation="capture";invalid(()=>recordBrowserChecks(quote,"buyer",input(quote)));
  quote.proof.paymentOperation=undefined;quote.status="draft";invalid(()=>recordBrowserChecks(quote,"buyer",input(quote)));
});
test("report IDs provide a compare-and-swap guard for repeated browser runs", () => {
  const quote=agreement(),value=input(quote),first=recordBrowserChecks(quote,"buyer",value,now);
  invalid(()=>recordBrowserChecks(first,"buyer",value,now));
  const second=recordBrowserChecks(first,"seller",input(first),now);
  assert.notEqual(second.proof.delivery!.browserChecks!.id,first.proof.delivery!.browserChecks!.id);
  assert.equal(first.proof.delivery!.browserChecks!.summary.steps,6);
});
test("fetch/navigation URL resolution stays within the exact protected saved snapshot", () => {
  const quote=agreement(),root=`https://example.test/deliveries/${quote.id}/${quote.proof.delivery!.id}/`;
  assert.equal(savedBrowserFile(quote,new URL(root+"index.html#booking"),"https://example.test"),"index.html");
  for(const value of [root+"index.html?x=1",root+"other.html",root.replace(quote.id,"other")+"index.html",root.replace("example.test","external.test")+"index.html","https://user:pass@example.test"+new URL(root).pathname+"index.html"]){assert.equal(savedBrowserFile(quote,new URL(value),"https://example.test"),undefined);}
});
