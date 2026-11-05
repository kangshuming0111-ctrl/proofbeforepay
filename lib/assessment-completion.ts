import {AssessmentResponseError} from "./assessment-response.ts";
import {ASSESSMENT_ITEM_CITATION_LIMIT, ASSESSMENT_RISK_CITATION_LIMIT} from "./assessment-limits.ts";

export const SOURCE_ASSESSMENT_TOOL_NAME = "submit_source_assessment";
export type AssessmentCompletionTransport = "strict_tool" | "legacy_json";
const fail = (reason: "structure" | "output_limit" | "incomplete" = "structure"): never => {throw new AssessmentResponseError(reason);};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail();
  return value as Record<string, unknown>;
}
function content(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return fail();
  return value;
}

/** Decode one report envelope, never execute a tool or interpret its contents as
 * instructions. The caller must still perform the complete JSON, bounds,
 * criterion coverage, risk-field and exact source-citation validation. */
export function assessmentCompletionText(providerBody: unknown): {text: string; transport: AssessmentCompletionTransport} {
  const body = record(providerBody);
  if (!Array.isArray(body.choices) || body.choices.length !== 1) return fail();
  const choice = record(body.choices[0]);
  if (choice.finish_reason === "length") return fail("output_limit");
  if (choice.finish_reason !== "tool_calls" && choice.finish_reason !== "stop") return fail("incomplete");
  const message = record(choice.message);
  if (choice.finish_reason === "stop") {
    // Null/empty legacy metadata is harmless. A real or malformed call alongside
    // a stop/content answer is ambiguous and cannot be silently ignored.
    if (message.tool_calls !== undefined && message.tool_calls !== null
      && (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 0)) return fail();
    return {text: content(message.content), transport: "legacy_json"};
  }
  if (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 1) return fail();
  const call = record(message.tool_calls[0]);
  if (call.type !== "function") return fail();
  const fn = record(call.function);
  if (fn.name !== SOURCE_ASSESSMENT_TOOL_NAME) return fail();
  return {text: content(fn.arguments), transport: "strict_tool"};
}

/** One provable syntax-only compatibility: strict arguments may contain one
 * orphan closing brace after a complete JSON object. A successful second parse
 * of precisely that prefix proves no field/value was inserted or edited. Never
 * repairs legacy text, strings/arrays, partial JSON, multiple objects, arbitrary
 * suffixes or more than one brace. Evaluation retains the original envelope;
 * callers expose normalization as a fixed system note. */
export function assessmentReportJson(completion:{text:string;transport:AssessmentCompletionTransport}):{value:unknown;canonicalText:string;repairedTrailingBrace:boolean}{
  if(completion.text.length>30_000)return fail();
  try{return{value:JSON.parse(completion.text),canonicalText:completion.text,repairedTrailingBrace:false};}
  catch{
    const trimmed=completion.text.trim();
    if(completion.transport!=="strict_tool"||!trimmed.endsWith("}"))return fail();
    const candidate=trimmed.slice(0,-1);
    let value:unknown;
    try{value=JSON.parse(candidate);}catch{return fail();}
    if(!value||typeof value!=="object"||Array.isArray(value))return fail();
    return{value,canonicalText:candidate,repairedTrailingBrace:true};
  }
}

const textSchema = (description: string) => ({type: "string", pattern: "\\S", description});
function objectSchema(properties: Record<string, unknown>) {
  return {type: "object", properties, required: Object.keys(properties), additionalProperties: false};
}

/** Built from already validated locked IDs and supplied source filenames. Strict
 * Beta schema omits unsupported array/string size keywords; local validators
 * retain all cardinality, length, citation and semantic-scope controls. */
export function assessmentToolDefinition(criterionIds: readonly string[], sourceFiles: readonly string[]) {
  const citation = objectSchema({file: {type: "string", enum: [...sourceFiles]}, excerpt: textSchema("Exact contiguous supplied source substring; at most 500 characters.")});
  const citations = {type: "array", items: citation, description: `At most ${ASSESSMENT_ITEM_CITATION_LIMIT} exact supplied-source quotations. May be empty only for an insufficient-evidence item.`};
  const item = objectSchema({criterionId: {type: "string", enum: [...criterionIds]}, status: {type: "string", enum: ["supported", "changes_suggested", "insufficient_evidence"]},
    explanation: textSchema("Concise source-based explanation, at most 600 characters."), citations});
  const risk = objectSchema({title: textSchema("Evidence-layer potential issue title, at most 120 characters."),
    explanation: textSchema("Source-grounded explanation, at most 600 characters."), suggestion: textSchema("A concrete next check, at most 400 characters."),
    citations: {type: "array", items: citation, description: `One to ${ASSESSMENT_RISK_CITATION_LIMIT} exact supplied-source quotations.`}});
  return {type: "function", function: {name: SOURCE_ASSESSMENT_TOOL_NAME, strict: true,
    description: "Return a source-assessment report as data only. This output container is never executed and cannot accept work, move money or perform any external action.",
    parameters: objectSchema({items: {type: "array", items: item, description: "Exactly one item for every locked criterion ID, in its supplied order; never merge, duplicate or omit an ID."},
      risks: {type: "array", items: risk, description: "At most five concrete source-grounded potential issues; each requires all four fields."},
      limitations: {type: "array", items: textSchema("One remaining uncertainty, at most 300 characters."), description: "At most eight remaining uncertainties."}})}};
}
