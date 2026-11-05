/** Bounded cooperative execution records. This verifier never calls an adapter,
 * executes code, proves identity/authenticity or changes acceptance/payment. */
export const DELIVERY_STAGES = ["submit", "stored_record", "fresh_readback", "email_receipt"] as const;
export type DeliveryStage = typeof DELIVERY_STAGES[number];
export type DeliveryStageStatus = "matched" | "mismatch" | "unknown" | "unsupported";
export type DeliveryStagePlan = {
  schema: "pbp-delivery-stage-plan-v1"; runId: string; syntheticOnly: true;
  scope: {projectId: string; deliveryId: string; criterionId: string; sourceRevision: string; requirement: string};
  payloadDigest: string;
  stages: {stage: DeliveryStage; coverage: "adapter" | "manual" | "unsupported"}[];
};
type NativeRecord = {recordId: string; payloadDigest: string};
type Base = {outcome: "observed"; runId: string; sourceRevision: string};
export type DeliveryStageObservation =
  | {outcome: "unsupported"}
  | {outcome: "unknown"; reason: "adapter_error" | "timeout" | "manual_required" | "prior_result_unknown"}
  | (Base & {stage: "submit"; accepted: boolean; operationId: string; record: NativeRecord | null})
  | (Base & {stage: "stored_record"; reader: "native_store"; connectionId: string; record: NativeRecord | null})
  | (Base & {stage: "fresh_readback"; reader: "fresh_connection"; connectionId: string; record: NativeRecord | null})
  | (Base & {stage: "email_receipt"; transport: "test_sink" | "test_inbox"; receipt: (NativeRecord & {receiptId: string}) | null});
export type DeliveryStageRow = {stage: DeliveryStage; observation: DeliveryStageObservation; status: DeliveryStageStatus; reason: string};
export type DeliveryStageReport = {
  schema: "pbp-delivery-stage-report-v1"; evidenceLevel: "cooperative_adapter_observations";
  plan: DeliveryStagePlan; rows: DeliveryStageRow[]; summary: Record<DeliveryStageStatus, number>; digest: string;
};
export const DELIVERY_STAGE_REPORT_BYTE_LIMIT = 64 * 1024;
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const sha = /^[a-f0-9]{64}$/u;
function fail():never { throw new Error("INVALID_DELIVERY_STAGE_EVIDENCE"); }
function bounded(value: unknown): void {
  let nodes=0,chars=0; const ancestors=new Set<object>();
  function visit(v:unknown,depth:number):void {
    if (++nodes>3000||depth>12) fail();
    if (typeof v==="string") {chars+=v.length;if(chars>DELIVERY_STAGE_REPORT_BYTE_LIMIT)fail();return;}
    if(v===null||typeof v==="boolean")return;
    if(typeof v==="number"){if(!Number.isFinite(v))fail();return;}
    if(!v||typeof v!=="object"||ancestors.has(v))fail();
    if(Array.isArray(v)){if(v.length>100||Object.keys(v).length!==v.length)fail();}
    else if(![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
    ancestors.add(v);
    for(const k of Reflect.ownKeys(v)){
      if(Array.isArray(v)&&k==="length")continue;
      const d=Object.getOwnPropertyDescriptor(v,k)!;
      if(typeof k!=="string"||["__proto__","constructor","prototype"].includes(k)||!("value" in d)||!d.enumerable)fail();
      chars+=k.length;visit(d.value,depth+1);
    }
    ancestors.delete(v);
  }
  visit(value,0);if(new TextEncoder().encode(JSON.stringify(value)).byteLength>DELIVERY_STAGE_REPORT_BYTE_LIMIT)fail();
}
function object(v:unknown,keys:string[]):Record<string,unknown>{
  if(!v||typeof v!=="object"||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();
  if(Object.keys(v).sort().join("|")!==[...keys].sort().join("|"))fail();return v as Record<string,unknown>;
}
function id(v:unknown):void{if(typeof v!=="string"||!identifier.test(v))fail();}
function digest(v:unknown):void{if(typeof v!=="string"||!sha.test(v))fail();}
export function validateDeliveryStagePlan(value:unknown):DeliveryStagePlan{
  bounded(value);const p=object(value,["schema","runId","syntheticOnly","scope","payloadDigest","stages"]);
  if(p.schema!=="pbp-delivery-stage-plan-v1"||p.syntheticOnly!==true)fail();id(p.runId);digest(p.payloadDigest);
  const s=object(p.scope,["projectId","deliveryId","criterionId","sourceRevision","requirement"]);
  for(const k of ["projectId","deliveryId","criterionId","sourceRevision"])id(s[k]);
  if(typeof s.requirement!=="string"||!s.requirement.trim()||s.requirement.length>4000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(s.requirement))fail();
  if(!Array.isArray(p.stages)||p.stages.length!==4)fail();
  p.stages.forEach((v,i)=>{const row=object(v,["stage","coverage"]);if(row.stage!==DELIVERY_STAGES[i]||!["adapter","manual","unsupported"].includes(String(row.coverage)))fail();});
  return structuredClone(value) as DeliveryStagePlan;
}
function nativeRecord(v:unknown,receipt=false):void{
  if(v===null)return;const r=object(v,receipt?["recordId","payloadDigest","receiptId"]:["recordId","payloadDigest"]);id(r.recordId);digest(r.payloadDigest);if(receipt)id(r.receiptId);
}
export function validateDeliveryStageObservation(stage:DeliveryStage,value:unknown):DeliveryStageObservation{
  bounded(value);if(!DELIVERY_STAGES.includes(stage)||!value||typeof value!=="object"||Array.isArray(value))fail();
  const outcome=(value as {outcome?:unknown}).outcome;
  if(outcome==="unsupported")object(value,["outcome"]);
  else if(outcome==="unknown"){
    const o=object(value,["outcome","reason"]);if(!["adapter_error","timeout","manual_required","prior_result_unknown"].includes(String(o.reason)))fail();
  }else{
    const extra=stage==="submit"?["accepted","operationId","record"]:stage==="email_receipt"?["transport","receipt"]:["reader","connectionId","record"];
    const o=object(value,["outcome","runId","sourceRevision","stage",...extra]);
    if(o.outcome!=="observed"||o.stage!==stage)fail();id(o.runId);id(o.sourceRevision);
    if(stage==="submit"){if(typeof o.accepted!=="boolean")fail();id(o.operationId);nativeRecord(o.record);}
    else if(stage==="email_receipt"){if(!["test_sink","test_inbox"].includes(String(o.transport)))fail();nativeRecord(o.receipt,true);}
    else{if(o.reader!==(stage==="stored_record"?"native_store":"fresh_connection"))fail();id(o.connectionId);nativeRecord(o.record);}
  }
  return structuredClone(value) as DeliveryStageObservation;
}
function result(plan:DeliveryStagePlan,stage:DeliveryStage,o:DeliveryStageObservation,previous:DeliveryStageRow[]):Pick<DeliveryStageRow,"status"|"reason">{
  const coverage=plan.stages.find(p=>p.stage===stage)!.coverage;
  if(coverage!=="adapter")return {status:coverage==="manual"?"unknown":"unsupported",reason:coverage==="manual"?"manual_required":"stage_not_supported"};
  if(o.outcome==="unsupported")return {status:"unsupported",reason:"adapter_not_supported"};
  if(o.outcome==="unknown")return {status:"unknown",reason:o.reason};
  if(o.runId!==plan.runId||o.sourceRevision!==plan.scope.sourceRevision)return {status:"mismatch",reason:"wrong_run_or_revision"};
  const submitted=previous.find(r=>r.stage==="submit"),submitObservation=submitted?.observation;
  const record=o.stage==="email_receipt"?o.receipt:o.record;
  if(o.stage==="submit"&&(!o.accepted||!record))return {status:"mismatch",reason:"submission_not_accepted"};
  if(!record)return {status:"mismatch",reason:o.stage==="email_receipt"?"receipt_missing":"record_missing"};
  if(record.payloadDigest!==plan.payloadDigest)return {status:"mismatch",reason:"payload_differs"};
  if(stage!=="submit"){
    if(submitted?.status!=="matched"||submitObservation?.outcome!=="observed"||submitObservation.stage!=="submit"||!submitObservation.record)return {status:"unknown",reason:"submission_not_established"};
    if(record.recordId!==submitObservation.record.recordId)return {status:"mismatch",reason:"record_identity_differs"};
  }
  if(o.stage==="fresh_readback"){
    const stored=previous.find(r=>r.stage==="stored_record")?.observation;
    if(stored?.outcome!=="observed"||stored.stage!=="stored_record")return {status:"unknown",reason:"stored_reader_unavailable"};
    if(stored.connectionId===o.connectionId)return {status:"mismatch",reason:"reader_not_fresh"};
  }
  return {status:"matched",reason:o.stage==="email_receipt"?"cooperative_test_receipt_matches":"cooperative_record_matches"};
}
function canonical(value:unknown):string{return JSON.stringify(value,(_key,v)=>v&&typeof v==="object"&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0)):v);}
async function hash(value:unknown):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical(value))))].map(n=>n.toString(16).padStart(2,"0")).join("");}
export async function createDeliveryStageReport(planInput:unknown,observations:unknown[]):Promise<DeliveryStageReport>{
  const plan=validateDeliveryStagePlan(planInput);if(!Array.isArray(observations)||observations.length!==4)fail();
  const rows:DeliveryStageRow[]=[];
  for(let i=0;i<4;i++){const stage=DELIVERY_STAGES[i],observation=validateDeliveryStageObservation(stage,observations[i]);if(plan.stages[i].coverage==="unsupported"&&observation.outcome!=="unsupported"||plan.stages[i].coverage==="manual"&&(observation.outcome!=="unknown"||observation.reason!=="manual_required"))fail();rows.push({stage,observation,...result(plan,stage,observation,rows)});}
  const summary:Record<DeliveryStageStatus,number>={matched:0,mismatch:0,unknown:0,unsupported:0};for(const row of rows)summary[row.status]++;
  const body={schema:"pbp-delivery-stage-report-v1" as const,evidenceLevel:"cooperative_adapter_observations" as const,plan,rows,summary};
  return {...body,digest:await hash(body)};
}
export async function validateDeliveryStageReport(value:unknown):Promise<DeliveryStageReport>{
  bounded(value);const v=object(value,["schema","evidenceLevel","plan","rows","summary","digest"]);
  if(v.schema!=="pbp-delivery-stage-report-v1"||v.evidenceLevel!=="cooperative_adapter_observations"||!Array.isArray(v.rows)||v.rows.length!==4)fail();
  v.rows.forEach((r,i)=>{const row=object(r,["stage","observation","status","reason"]);if(row.stage!==DELIVERY_STAGES[i])fail();});
  const expected=await createDeliveryStageReport(v.plan,v.rows.map(r=>(r as Record<string,unknown>).observation));
  if(canonical(expected)!==canonical(value))fail();return expected;
}
