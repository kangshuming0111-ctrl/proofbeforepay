/** The seller bridge is cooperative client evidence, never browser attestation.
 * Only synthetic, named booking operations cross this boundary. */
import type {JourneyRequest} from "./journey-checks.ts";

export const SELLER_BRIDGE_PROTOCOL = "pbp-seller-bridge-v1" as const;
export const SELLER_BRIDGE_MAX_BYTES = 96 * 1024;
export const SELLER_BRIDGE_ACTION_IDS = ["create", "cancel", "rebook", "fill", "cancel_repeat", "reject_extra", "source_create", "move_full", "move_free", "response_loss_create", "response_loss_retry"] as const;
export type SellerBridgeActionId = typeof SELLER_BRIDGE_ACTION_IDS[number];
export type SellerBridgeAction =
  | {type: "create"; requestOperation: "cancel-create" | "cancel-five" | "cancel-three" | "cancel-extra" | "source-create" | "loss-create"; partySize: number; slot: string}
  | {type: "cancel"; requestOperation: "cancel-first" | "cancel-repeat"; bookingId: string}
  | {type: "move"; requestOperation: "move-full" | "move-free"; bookingId: string; slot: string}
  | {type: "retry-original"};
export type SellerBridgeCommand = {sequence: number; actionId: SellerBridgeActionId; action: SellerBridgeAction};
export type SellerBridgeSession = {sessionNonce: string; runId: string};
export type SellerBridgeInit = SellerBridgeSession & {protocol: typeof SELLER_BRIDGE_PROTOCOL; type: "init"; sequence: 0};
export type SellerBridgeReady = SellerBridgeSession & {
  protocol: typeof SELLER_BRIDGE_PROTOCOL; type: "ready"; sequence: 0;
  frontendRevision: string; backendBasePath: string; syntheticOnly: true; deploymentAttestation: false;
};
export type SellerBridgeExecute = SellerBridgeSession & SellerBridgeCommand & {protocol: typeof SELLER_BRIDGE_PROTOCOL; type: "execute"};
export type SellerBridgeObservation = SellerBridgeSession & {
  protocol: typeof SELLER_BRIDGE_PROTOCOL; type: "observation";
  sequence: number; actionId: SellerBridgeActionId;
  ui: {actionId: SellerBridgeActionId; status: "success" | "error" | "unknown"; message: string; fields: Record<string,string>; receipt?: unknown};
  requests: JourneyRequest[];
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const NONCE = /^[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/u;
const SLOTS = ["2099-01-01T10:00:00Z", "2099-01-01T11:00:00Z", "2099-01-01T12:00:00Z"];
const OPERATIONS: Record<SellerBridgeActionId,string> = {create:"cancel-create",cancel:"cancel-first",rebook:"cancel-five",fill:"cancel-three",cancel_repeat:"cancel-repeat",reject_extra:"cancel-extra",source_create:"source-create",move_full:"move-full",move_free:"move-free",response_loss_create:"loss-create",response_loss_retry:"loss-create"};
const plain = (value:unknown):value is Record<string,unknown> => !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
function fail():never {throw new Error("seller_bridge_invalid_message");}
function keys(value:Record<string,unknown>, allowed:readonly string[], required:readonly string[] = allowed) {if(Object.keys(value).some(k=>!allowed.includes(k)) || required.some(k=>!Object.hasOwn(value,k))) fail();}
function bounded(value:unknown, max = SELLER_BRIDGE_MAX_BYTES): void {
  let json:string|undefined;try{json=JSON.stringify(value);}catch{fail();}
  if(!json || new TextEncoder().encode(json).byteLength>max)fail();
  // Structured-clone messages may contain values which JSON would silently
  // omit/coerce. Accept only a bounded, ordinary JSON tree.
  let count=0;
  const visit=(v:unknown,depth:number):void=>{if(++count>6000||depth>12)fail();if(v===null||typeof v==="boolean"||typeof v==="string")return;if(typeof v==="number"&&Number.isFinite(v))return;if(Array.isArray(v)){for(const x of v)visit(x,depth+1);return;}if(plain(v)){for(const[k,x]of Object.entries(v)){if(["__proto__","constructor","prototype"].includes(k))fail();visit(x,depth+1);}return;}fail();};
  visit(value,0);
}
export function validateSellerBridgeSession(value:SellerBridgeSession):SellerBridgeSession {
  if(!UUID.test(value.runId)||!NONCE.test(value.sessionNonce))fail();return{runId:value.runId,sessionNonce:value.sessionNonce};
}
function envelope(value:unknown, expected:SellerBridgeSession, type:string):Record<string,unknown>{
  bounded(value);if(!plain(value))fail();validateSellerBridgeSession(expected);
  if(value.protocol!==SELLER_BRIDGE_PROTOCOL||value.type!==type||value.runId!==expected.runId||value.sessionNonce!==expected.sessionNonce)fail();return value;
}
export function validateSellerBridgeCommand(value:unknown):SellerBridgeCommand {
  bounded(value,4096);if(!plain(value))fail();keys(value,["sequence","actionId","action"]);
  if(!Number.isInteger(value.sequence)||(value.sequence as number)<1||(value.sequence as number)>SELLER_BRIDGE_ACTION_IDS.length||!SELLER_BRIDGE_ACTION_IDS.includes(value.actionId as SellerBridgeActionId)||!plain(value.action))fail();
  const action=value.action,id=value.actionId as SellerBridgeActionId;
  if(id==="response_loss_retry"){keys(action,["type"]);if(action.type!=="retry-original")fail();}
  else if(id==="cancel"||id==="cancel_repeat"){keys(action,["type","requestOperation","bookingId"]);if(action.type!=="cancel"||typeof action.bookingId!=="string"||!ID.test(action.bookingId))fail();}
  else if(id==="move_full"||id==="move_free"){keys(action,["type","requestOperation","bookingId","slot"]);if(action.type!=="move"||typeof action.bookingId!=="string"||!ID.test(action.bookingId)||!SLOTS.includes(action.slot as string))fail();}
  else {keys(action,["type","requestOperation","partySize","slot"]);if(action.type!=="create"||!Number.isInteger(action.partySize)||(action.partySize as number)<1||(action.partySize as number)>6||!SLOTS.includes(action.slot as string))fail();}
  if(id!=="response_loss_retry"&&action.requestOperation!==OPERATIONS[id])fail();
  return structuredClone(value) as SellerBridgeCommand;
}
export function validateSellerBridgeReady(value:unknown,expected:SellerBridgeSession):SellerBridgeReady {
  const x=envelope(value,expected,"ready");keys(x,["protocol","type","sessionNonce","runId","sequence","frontendRevision","backendBasePath","syntheticOnly","deploymentAttestation"]);
  if(x.sequence!==0||x.syntheticOnly!==true||x.deploymentAttestation!==false||typeof x.frontendRevision!=="string"||!x.frontendRevision||x.frontendRevision.length>120||/[\u0000-\u001f\u007f]/u.test(x.frontendRevision)||typeof x.backendBasePath!=="string"||!/^\/(?:[A-Za-z0-9_~-]+\/)*$/u.test(x.backendBasePath)||x.backendBasePath.length>250)fail();
  return structuredClone(x) as SellerBridgeReady;
}
export function validateSellerBridgeObservation(value:unknown,expected:SellerBridgeSession&Pick<SellerBridgeCommand,"sequence"|"actionId">):SellerBridgeObservation {
  const x=envelope(value,expected,"observation");keys(x,["protocol","type","sessionNonce","runId","sequence","actionId","ui","requests"]);
  if(x.sequence!==expected.sequence||x.actionId!==expected.actionId||!plain(x.ui)||!Array.isArray(x.requests)||x.requests.length>4)fail();
  keys(x.ui,["actionId","status","message","fields","receipt"],["actionId","status","message","fields"]);
  if(x.ui.actionId!==expected.actionId||!["success","error","unknown"].includes(x.ui.status as string)||typeof x.ui.message!=="string"||x.ui.message.length>2000||!plain(x.ui.fields))fail();
  if(Object.keys(x.ui.fields).some(k=>!["operation","requestOperation","slot","partySize","bookingId"].includes(k))||Object.values(x.ui.fields).some(v=>typeof v!=="string"||v.length>150))fail();
  for(const raw of x.requests){
    if(!plain(raw))fail();keys(raw,["method","path","key","status","request","response","error"],["method","path"]);
    if(raw.method!=="POST"||typeof raw.path!=="string"||!/^\/(?:[A-Za-z0-9_~-]+\/)*bookings(?:\/[A-Za-z0-9][A-Za-z0-9_-]{0,99}\/(?:cancel|move))?$/u.test(raw.path)||raw.path.length>500||raw.key!==undefined&&(typeof raw.key!=="string"||raw.key.length>180)||raw.status!==undefined&&(!Number.isInteger(raw.status)||(raw.status as number)<100||(raw.status as number)>599)||raw.error!==undefined&&(typeof raw.error!=="string"||!raw.error||raw.error.length>160))fail();
    if(raw.request!==undefined)bounded(raw.request,16384);if(raw.response!==undefined)bounded(raw.response,16384);
  }
  if(x.ui.receipt!==undefined)bounded(x.ui.receipt,16384);
  return structuredClone(x) as SellerBridgeObservation;
}
