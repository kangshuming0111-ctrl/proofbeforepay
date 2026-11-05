import assert from "node:assert/strict";
import test from "node:test";
import {assessmentOutputTokenLimit} from "../lib/delivery-assessment.ts";

test("strict reports reserve headroom beyond the observed eight-item 1980-token truncation without removing the hard cap",()=>{
  assert.ok(assessmentOutputTokenLimit(8)>=4096);
  for(const count of [1,7,8,16,33])assert.ok(assessmentOutputTokenLimit(count)<=6400);
  assert.ok(assessmentOutputTokenLimit(16)>=assessmentOutputTokenLimit(8));
  for(const count of [0,-1,34,NaN])assert.throws(()=>assessmentOutputTokenLimit(count));
});
import {assessDeliveryLegacyReplay as assessDelivery} from "../lib/delivery-assessment.ts";
import {AssessmentResponseError} from "../lib/assessment-response.ts";
import {assessmentCompletionText, assessmentToolDefinition} from "../lib/assessment-completion.ts";
import {projectQuote, type EvaluationProject} from "../scripts/run-project-assessment-evaluation.ts";

const TOOL = "submit_source_assessment", env = {DEEPSEEK_API_KEY: "controlled-offline-no-network"};
function quote() {
  const source = "<!doctype html><html><head><title>Source fixture</title></head><body><p>Hours: Mon-Fri 9-5. Phone: 000</p></body></html>";
  const p: EvaluationProject = {id: "strict-report-fixture", stratum: "boundary", language: "en", title: "Strict report fixture", summary: "Inspect literal hours and contact copy only.",
    files: {"index.html": source, "about.html": source, "site.css": "p {font-family:sans-serif}"},
    criteria: ["The page copy must state opening hours.", "The page copy must state phone details."].map((text, i) => ({id: `manual-${i + 1}`, title: "Literal copy", source: text,
      reference: {expectedStatus: "supported", rationale: "Controlled response fixture, not a real model result.", relevantFiles: ["index.html"], requiresSemanticReview: true}}))};
  return projectQuote(p);
}
function output(q = quote()) {return {items: q.proof.criteria.map(c => ({criterionId: c.id, status: "supported", explanation: "The supplied source contains the requested literal copy.",
  citations: [{file: "index.html", excerpt: "<p>Hours: Mon-Fri 9-5. Phone: 000</p>"}]})), risks: [] as unknown[], limitations: ["Controlled source-only response; no execution or payment."]};}
function toolResponse(report: unknown, name = TOOL) {return {choices: [{finish_reason: "tool_calls", message: {content: null, tool_calls: [{id: "controlled-call", type: "function", function: {name, arguments: JSON.stringify(report)}}]}}]};}
function reason(expected: string) {return (error: unknown) => error instanceof AssessmentResponseError && error.reason === expected;}

test("one assessment requests the Beta strict report schema and a named data-only function", async () => {
  const q = quote(), before = structuredClone(q), requests: {url: string; body: Record<string, unknown>}[] = [];
  await assessDelivery(q, env, async (url, init) => {
    requests.push({url: String(url), body: JSON.parse(String(init?.body))});
    // Legacy response isolates request-schema assertions from the decoder.
    return Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify(output(q))}}]});
  });
  assert.equal(requests.length, 1); assert.equal(requests[0].url, "https://api.deepseek.com/beta/chat/completions");
  const body = requests[0].body;
  assert.deepEqual(body.thinking, {type: "disabled"}); assert.equal(body.stream, false);
  assert.deepEqual(body.tool_choice, {type: "function", function: {name: TOOL}});
  assert.equal(Object.hasOwn(body, "response_format"), false);
  const tools = body.tools as {type: string; function: {name: string; strict: boolean; parameters: Record<string, unknown>}}[];
  assert.equal(tools.length, 1); assert.equal(tools[0].type, "function"); assert.equal(tools[0].function.name, TOOL); assert.equal(tools[0].function.strict, true);
  function inspect(node: Record<string, unknown>) {
    for (const forbidden of ["minItems", "maxItems", "minLength", "maxLength"]) assert.equal(Object.hasOwn(node, forbidden), false, forbidden);
    if (node.type === "object") {
      const properties = node.properties as Record<string, Record<string, unknown>>;
      assert.equal(node.additionalProperties, false); assert.deepEqual([...(node.required as string[])].sort(), Object.keys(properties).sort());
      Object.values(properties).forEach(inspect);
    } else if (node.type === "array") inspect(node.items as Record<string, unknown>);
    else if (node.type === "string" && !node.enum) assert.equal(node.pattern, "\\S");
  }
  inspect(tools[0].function.parameters); assert.deepEqual(q, before);
});

test("a strict tool reply is read as report data without tool execution, retries or domain mutation", async () => {
  const q = quote(), before = structuredClone(q); let calls = 0;
  const report = await assessDelivery(q, env, async () => {calls++; return Response.json(toolResponse(output(q)));});
  assert.equal(calls, 1); assert.equal(report.items.length, 2); assert.ok(report.items.every(c => c.status === "supported"));
  assert.deepEqual(q, before); assert.equal(q.proof.paymentState, "unfunded");
});

test("wrong function, extra call and stop-plus-tool envelopes fail closed with no fallback request", async () => {
  const q = quote(), valid = toolResponse(output(q));
  const multiple = structuredClone(valid); multiple.choices[0].message.tool_calls.push(structuredClone(multiple.choices[0].message.tool_calls[0]));
  const wrongType = structuredClone(valid); wrongType.choices[0].message.tool_calls[0].type = "other";
  const mixed = {choices: [{finish_reason: "stop", message: {content: JSON.stringify(output(q)), tool_calls: valid.choices[0].message.tool_calls}}]};
  for (const body of [toolResponse(output(q), "capture_payment"), multiple, wrongType, mixed]) {
    let calls = 0;
    await assert.rejects(assessDelivery(q, env, async () => {calls++; return Response.json(body);}), reason("structure"));
    assert.equal(calls, 1);
  }
});

test("strict transport does not bypass missing-item, risk-field or citation validation", async () => {
  const q = quote(), missing = output(q); missing.items.pop();
  const risk = output(q); risk.risks.push({title: "Incomplete detail", explanation: "Deliberately missing suggestion.", citations: [{file: "index.html", excerpt: "<p>Hours: Mon-Fri 9-5. Phone: 000</p>"}]});
  const citation = output(q); citation.items[0].citations[0].excerpt = "ABSENT CONTROLLED SOURCE";
  for (const [body, expected] of [[missing, "missing_items"], [risk, "risk_fields"], [citation, "citation"]] as const) {
    let calls = 0;
    await assert.rejects(assessDelivery(q, env, async () => {calls++; return Response.json(toolResponse(body));}), reason(expected));
    assert.equal(calls, 1);
  }
});

test("legacy reports retain the same full risk validation and strict output-limit failures remain typed", async () => {
  const q = quote(), risk = output(q); risk.risks.push({title: "Incomplete detail", explanation: "Missing suggestion.", citations: [{file: "index.html", excerpt: "<p>Hours: Mon-Fri 9-5. Phone: 000</p>"}]});
  await assert.rejects(assessDelivery(q, env, async () => Response.json({choices: [{finish_reason: "stop", message: {content: JSON.stringify(risk)}}]})), reason("risk_fields"));
  const limited = toolResponse(output(q)); limited.choices[0].finish_reason = "length";
  await assert.rejects(assessDelivery(q, env, async () => Response.json(limited)), reason("output_limit"));
});

test("the shared decoder validates its transport envelope while preserving exact argument text as data", () => {
  const payload = JSON.stringify(output()), strict = toolResponse(output());
  assert.deepEqual(assessmentCompletionText(strict), {text: payload, transport: "strict_tool"});
  for (const metadata of [{}, {tool_calls: null}, {tool_calls: []}])
    assert.deepEqual(assessmentCompletionText({choices: [{finish_reason: "stop", message: {content: payload, ...metadata}}]}), {text: payload, transport: "legacy_json"});
  const invalid: unknown[] = [
    null, {choices: []}, {choices: [strict.choices[0], strict.choices[0]]},
    {choices: [{finish_reason: "tool_calls", message: {tool_calls: []}}]},
    {choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: TOOL, arguments: {items: []}}}]}}]},
    {choices: [{finish_reason: "tool_calls", message: {tool_calls: [{type: "function", function: {name: TOOL, arguments: " "}}]}}]},
    {choices: [{finish_reason: "stop", message: {content: payload, tool_calls: {function: TOOL}}}]},
  ];
  for (const body of invalid) assert.throws(() => assessmentCompletionText(body), reason("structure"));
  assert.throws(() => assessmentCompletionText({choices: [{finish_reason: "length", message: null}]}), reason("output_limit"));
  assert.throws(() => assessmentCompletionText({choices: [{finish_reason: "content_filter", message: {content: "PRIVATE upstream detail"}}]}), error => reason("incomplete")(error) && !String(error).includes("PRIVATE"));
});

test("strict schema enums retain exact locked IDs and source filenames rather than model-generated scope", () => {
  const ids = ["manual-1", "coverage-12"], files = ["index.html", "nested/policy.html"];
  const tool = assessmentToolDefinition(ids, files), properties = tool.function.parameters.properties;
  const item = properties.items as {items: {properties: {criterionId: {enum: string[]}; citations: {items: {properties: {file: {enum: string[]}}}}}}};
  assert.deepEqual(item.items.properties.criterionId.enum, ids);
  assert.deepEqual(item.items.properties.citations.items.properties.file.enum, files);
  ids.push("not-locked"); files.push("not-supplied.html");
  assert.deepEqual(item.items.properties.criterionId.enum, ["manual-1", "coverage-12"]);
  assert.deepEqual(item.items.properties.citations.items.properties.file.enum, ["index.html", "nested/policy.html"]);
});

test("schema-constrained transport still enforces local string and citation-array limits", async () => {
  const q = quote(), long = output(q); long.items[0].explanation = "x".repeat(601);
  const citations = output(q); citations.items[0].citations = Array.from({length: 7}, () => ({file: "index.html", excerpt: "<p>Hours: Mon-Fri 9-5. Phone: 000</p>"}));
  for (const body of [long, citations]) {
    let calls = 0;
    await assert.rejects(assessDelivery(q, env, async () => {calls++; return Response.json(toolResponse(body));}), reason("structure"));
    assert.equal(calls, 1);
  }
});
