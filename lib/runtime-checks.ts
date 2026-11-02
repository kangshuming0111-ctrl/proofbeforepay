import { DomainError } from "./domain.ts";
import {validateBookingPolicy,type BookingPartyPolicy} from "./booking-policy.ts";

type RuntimePlanSource = {
  criterionId: string;
  source: {start: number; end: number; excerpt: string};
};
export type RuntimeCheckPlan = RuntimePlanSource & ({protocol:"booking-http-v1"}|{protocol:"booking-http-v2";policy:BookingPartyPolicy});
/** Only an operator-owned registry may supply this target, never a user URL. */
export type RuntimeCheckTarget = {id: string; label: string; baseUrl: string; revision: string; testOnly: true;protocol?:RuntimeCheckPlan["protocol"]};
export type RuntimeCheckStep = {
  id: string; label: string; outcome: "observed" | "mismatch" | "unavailable";
  method: "GET" | "POST"; path: string; status?: number;
  expected: string; actual?: string; reason?: string;
};
export type RuntimeCheckReport = {
  id: string; deliveryId: string; deliveryDigest: string; runId: string; method: "server-booking-http-v1"|"server-booking-http-v2";
  startedAt: string; finishedAt: string;
  target: {id: string; label: string; origin: string; revision: string};
  plan: RuntimeCheckPlan; steps: RuntimeCheckStep[];
  summary: {steps: number; observed: number; issues: number; unavailable: number};
};

const CONTROL = /[\u0000-\u001f\u007f]/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/u;
function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new DomainError(`${name} must be a plain object.`);
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > max || CONTROL.test(value)) throw new DomainError(`${name} is invalid.`);
  return value;
}
export function runtimeIdentifier(value: unknown, name = "Runtime identifier"): string {
  const result = text(value,name,80);
  if (!ID.test(result)) throw new DomainError(`${name} is invalid.`);
  return result;
}

/** Network policy is defense in depth for a trusted operator registry. This is
 * not a DNS-rebinding-safe validator for arbitrary user-supplied hostnames. */
export function validateRuntimeTarget(value: unknown, options: {allowLoopback?: boolean} = {}): RuntimeCheckTarget {
  const input = record(value,"Runtime target");
  if (Object.keys(input).some(key => !["id","label","baseUrl","revision","testOnly","protocol"].includes(key)) || input.testOnly !== true || input.protocol!==undefined&&!["booking-http-v1","booking-http-v2"].includes(input.protocol as string)) throw new DomainError("Runtime targets must be explicitly test-only registry entries.");
  const id = runtimeIdentifier(input.id,"Runtime target ID");
  const label = text(input.label,"Runtime target label",100), revision = text(input.revision,"Runtime revision",120);
  const raw = text(input.baseUrl,"Runtime target URL",500);
  if (/[\\%]/u.test(raw) || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(raw)) throw new DomainError("Runtime target URL must use a canonical directory path.");
  let url: URL;
  try {url = new URL(raw);} catch {throw new DomainError("Runtime target URL is invalid.");}
  if (url.username || url.password || url.search || url.hash || url.pathname.includes("//")) throw new DomainError("Runtime target URL cannot carry credentials, query, fragments or ambiguous paths.");
  const hostname = url.hostname.toLowerCase();
  const loopback = ["localhost","127.0.0.1","[::1]"].includes(hostname);
  if (loopback) {
    if (!options.allowLoopback || !["https:","http:"].includes(url.protocol)) throw new DomainError("Loopback runtime targets are available only in explicit local tests.");
  } else {
    if (url.protocol !== "https:" || !hostname.includes(".") || /^[\d.]+$/u.test(hostname) || hostname.includes(":") || /(?:^|\.)(?:localhost|local|internal|test|invalid|localdomain)$/u.test(hostname)) throw new DomainError("Runtime targets require a public HTTPS registry hostname.");
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return {id,label,baseUrl:url.href,revision,testOnly:true,...(input.protocol?{protocol:input.protocol as RuntimeCheckPlan["protocol"]}:{})};
}

export function validateRuntimePlan(value: unknown, options: {sourceText?: string; criteria?: {id: string}[]} = {}): RuntimeCheckPlan {
  const input = record(value,"Runtime plan");
  if (Object.keys(input).some(key => !["protocol","criterionId","source",...(input.protocol==="booking-http-v2"?["policy"]:[])].includes(key)) || !["booking-http-v1","booking-http-v2"].includes(input.protocol as string)) throw new DomainError("Choose the supported booking HTTP test protocol.");
  const criterionId = runtimeIdentifier(input.criterionId,"Runtime criterion ID");
  if (options.criteria && !options.criteria.some(item => item.id === criterionId)) throw new DomainError("Runtime plan must use an agreed criterion.");
  const source = record(input.source,"Runtime source");
  if (Object.keys(source).some(key => !["start","end","excerpt"].includes(key)) || !Number.isInteger(source.start) || !Number.isInteger(source.end) || (source.start as number) < 0 || (source.end as number) <= (source.start as number)) throw new DomainError("Runtime source positions are invalid.");
  const excerpt = text(source.excerpt,"Runtime source excerpt",1000);
  if ((source.end as number) - (source.start as number) !== excerpt.length || options.sourceText !== undefined && options.sourceText.slice(source.start as number,source.end as number) !== excerpt) throw new DomainError("Runtime source must retain the exact original substring.");
  const exactSource={start:source.start as number,end:source.end as number,excerpt};
  return input.protocol==="booking-http-v2"?{protocol:"booking-http-v2",criterionId,source:exactSource,policy:validateBookingPolicy(input.policy,exactSource)}:{protocol:"booking-http-v1",criterionId,source:exactSource};
}

const BASIC_IDS=["revision","missing_slot","invalid_email","create","readback","replay","conflict","unchanged"];
const POLICY_IDS=["party_zero","party_fraction","party_below","party_below_readback","party_exact","party_exact_readback","party_above","concurrent_first","concurrent_second","concurrent_readback"];
export function runtimeProtocolStepIds(plan:RuntimeCheckPlan):string[]{return [...BASIC_IDS,...(plan.protocol==="booking-http-v2"?POLICY_IDS:[])];}
export function runtimeReportMethod(plan:RuntimeCheckPlan):RuntimeCheckReport["method"]{return plan.protocol==="booking-http-v2"?"server-booking-http-v2":"server-booking-http-v1";}

/** Counters are derived from individual protocol observations, never client totals. */
export function runtimeReportSummary(steps: RuntimeCheckStep[]): RuntimeCheckReport["summary"] {
  return {steps:steps.length,observed:steps.filter(step=>step.outcome==="observed").length,issues:steps.filter(step=>step.outcome==="mismatch").length,unavailable:steps.filter(step=>step.outcome==="unavailable").length};
}

export function runtimeDeliveryDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new DomainError("Runtime evidence needs the exact uploaded-file digest.");
  return value;
}

/** Validates stored identity, shape and summary. It does not independently replay
 * HTTP observations or cryptographically attest the target's declared revision. */
export function validateRuntimeReport(value: unknown, expected: {deliveryId: string; deliveryDigest: string; runId?: string; plan: RuntimeCheckPlan; target?: Pick<RuntimeCheckTarget,"id"|"label"|"baseUrl"|"revision">}): RuntimeCheckReport {
  const report=record(value,"Runtime report");
  if(Object.keys(report).some(key=>!["id","deliveryId","deliveryDigest","runId","method","startedAt","finishedAt","target","plan","steps","summary"].includes(key))
    || report.method!==runtimeReportMethod(expected.plan) || report.deliveryId!==expected.deliveryId || report.deliveryDigest!==runtimeDeliveryDigest(expected.deliveryDigest)) throw new DomainError("Runtime report does not match this exact delivery.",409);
  const runId=runtimeIdentifier(report.runId,"Runtime run ID");
  if(report.id!==runId||expected.runId!==undefined&&runId!==expected.runId)throw new DomainError("Runtime report does not match the saved run.",409);
  const plan=validateRuntimePlan(report.plan);
  if(JSON.stringify(plan)!==JSON.stringify(validateRuntimePlan(expected.plan)))throw new DomainError("Runtime report does not match the locked test plan.",409);
  if(typeof report.startedAt!=="string"||typeof report.finishedAt!=="string"||!Number.isFinite(Date.parse(report.startedAt))||!Number.isFinite(Date.parse(report.finishedAt))||Date.parse(report.finishedAt)<Date.parse(report.startedAt))throw new DomainError("Runtime report timestamps are invalid.",409);
  const target=record(report.target,"Runtime report target");
  if(Object.keys(target).some(key=>!["id","label","origin","revision"].includes(key)))throw new DomainError("Runtime report target is invalid.",409);
  runtimeIdentifier(target.id,"Runtime target ID");text(target.label,"Runtime target label",100);text(target.revision,"Runtime revision",120);
  let origin:URL;try{origin=new URL(text(target.origin,"Runtime target origin",500));}catch{throw new DomainError("Runtime target origin is invalid.",409);}
  if(origin.origin!==target.origin||origin.username||origin.password)throw new DomainError("Runtime target origin must be an origin without authentication.",409);
  if(expected.target&&(target.id!==expected.target.id||target.label!==expected.target.label||target.origin!==new URL(expected.target.baseUrl).origin||target.revision!==expected.target.revision))throw new DomainError("Runtime report target changed.",409);
  const ids=runtimeProtocolStepIds(plan);
  if(!Array.isArray(report.steps)||report.steps.length!==ids.length)throw new DomainError("Runtime report must retain every protocol step.",409);
  const steps=report.steps.map((value,index)=>{
    const step=record(value,"Runtime step");
    const readback=["readback","unchanged","party_below_readback","party_exact_readback","concurrent_readback"].includes(ids[index]);
    const method=index===0||readback?"GET":"POST";
    if(Object.keys(step).some(key=>!["id","label","outcome","method","path","status","expected","actual","reason"].includes(key))||step.id!==ids[index]||step.method!==method||!["observed","mismatch","unavailable"].includes(step.outcome as string))throw new DomainError("Runtime protocol step is invalid.",409);
    text(step.label,"Runtime step label",160);text(step.expected,"Runtime expected description",500);
    const path=text(step.path,"Runtime request path",140);
    if(index===0?path!=="meta":readback?!/^bookings\/(?:[A-Za-z0-9][A-Za-z0-9_-]{0,99}|:id)$/u.test(path):path!=="bookings")throw new DomainError("Runtime report contains an unsupported path.",409);
    if(step.status!==undefined&&(!Number.isInteger(step.status)||(step.status as number)<100||(step.status as number)>599))throw new DomainError("Runtime HTTP status is invalid.",409);
    if(step.actual!==undefined)text(step.actual,"Runtime observed description",2000);
    if(step.reason!==undefined)text(step.reason,"Runtime unavailable reason",80);
    if(step.outcome==="unavailable"?!step.reason:step.status===undefined||typeof step.actual!=="string"||step.reason!==undefined)throw new DomainError("Runtime observation fields are inconsistent.",409);
    const observedStatus=index===0||readback?[200]:["missing_slot","invalid_email","party_zero","party_fraction","party_above"].includes(ids[index])?[400,422]:ids[index]==="create"?[201]:ids[index]==="conflict"?[409]:[200,201];
    if(step.outcome==="observed"&&(!observedStatus.includes(step.status as number)||readback&&path==="bookings/:id"))throw new DomainError("Runtime observation cannot claim the expected outcome.",409);
    return step as RuntimeCheckStep;
  });
  const summary=runtimeReportSummary(steps);
  const saved=record(report.summary,"Runtime summary");
  if(Object.keys(saved).length!==4||Object.entries(summary).some(([key,count])=>saved[key]!==count))throw new DomainError("Runtime summary differs from its saved steps.",409);
  return structuredClone({...report,plan,steps,summary} as RuntimeCheckReport);
}
