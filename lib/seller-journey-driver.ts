import {SELLER_BRIDGE_PROTOCOL,validateSellerBridgeCommand,validateSellerBridgeObservation,validateSellerBridgeReady,validateSellerBridgeSession,type SellerBridgeCommand,type SellerBridgeObservation,type SellerBridgeReady,type SellerBridgeSession} from "./seller-journey-bridge.ts";

export type SellerJourneyDriverOptions={frame:HTMLIFrameElement;frontendEntryUrl:string;allowedOrigin:string;runId:string;signal?:AbortSignal;timeoutMs?:number;hostWindow?:Window};
export type SellerJourneyDriver={connect():Promise<SellerBridgeReady>;perform(command:SellerBridgeCommand):Promise<SellerBridgeObservation>;dispose():void};

/** Navigate only to an operator-pinned staging entry, then exchange synthetic
 * named actions. The caller must obtain that entry from its project server.
 * This driver cannot attest the seller-controlled DOM, traces or deployment. */
export function createSellerJourneyDriver(options:SellerJourneyDriverOptions):SellerJourneyDriver {
  const host=options.hostWindow??window,timeout=options.timeoutMs??12000;
  const entry=new URL(options.frontendEntryUrl),origin=new URL(options.allowedOrigin);
  if(entry.protocol!=="https:"||entry.username||entry.password||entry.hash||entry.origin!==options.allowedOrigin||origin.origin!==options.allowedOrigin||origin.href!==options.allowedOrigin+"/"||entry.origin===host.location.origin||entry.pathname.includes("%")||entry.pathname.includes("\\")||[...entry.searchParams.keys()].some(k=>k!=="run")||entry.searchParams.getAll("run").length>1||entry.searchParams.has("run")&&entry.searchParams.get("run")!==options.runId||!Number.isInteger(timeout)||timeout<1||timeout>30000)throw new Error("seller_bridge_unapproved_entry");
  const nonce=Array.from(host.crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
  const session:SellerBridgeSession=validateSellerBridgeSession({sessionNonce:nonce,runId:options.runId});entry.searchParams.set("run",session.runId);
  let disposed=false,started=false,ready:SellerBridgeReady|undefined,sequence=0;
  let pending:{kind:"ready"|"observation";command?:SellerBridgeCommand;resolve:(value:SellerBridgeReady|SellerBridgeObservation)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;
  function reject(reason:string){const item=pending;if(item){clearTimeout(item.timer);pending=undefined;item.reject(new Error(reason));}}
  function disposeWith(reason:string){if(disposed)return;disposed=true;reject(reason);host.removeEventListener("message",onMessage);options.frame.removeEventListener("load",onLoad);options.signal?.removeEventListener("abort",onAbort);}
  const onAbort=()=>disposeWith("seller_bridge_stopped_external_outcome_unknown");
  function onLoad(){
    if(disposed)return;
    if(ready){disposeWith("seller_bridge_navigation_external_outcome_unknown");return;}
    options.frame.contentWindow?.postMessage({protocol:SELLER_BRIDGE_PROTOCOL,type:"init",...session,sequence:0},options.allowedOrigin);
  }
  function onMessage(event:MessageEvent){
    if(disposed||event.origin!==options.allowedOrigin||event.source!==options.frame.contentWindow)return;
    // An old session/run cannot disturb the current one. A matching envelope
    // with malformed content fails this run, rather than becoming a pass.
    const raw=event.data as Record<string,unknown>|null;
    if(!raw||typeof raw!=="object"||raw.protocol!==SELLER_BRIDGE_PROTOCOL||raw.runId!==session.runId||raw.sessionNonce!==session.sessionNonce)return;
    if(!pending){disposeWith("seller_bridge_unsolicited_or_replayed_message");return;}
    try{
      const value=pending.kind==="ready"?validateSellerBridgeReady(raw,session):validateSellerBridgeObservation(raw,{...session,sequence:pending.command!.sequence,actionId:pending.command!.actionId});
      const item=pending;pending=undefined;clearTimeout(item.timer);if(value.type==="ready")ready=value;else sequence=value.sequence;item.resolve(value);
    }catch{disposeWith("seller_bridge_invalid_current_message");}
  }
  function wait(kind:"ready"|"observation",command?:SellerBridgeCommand):Promise<SellerBridgeReady|SellerBridgeObservation>{
    return new Promise((resolve,rejectPromise)=>{pending={kind,command,resolve,reject:rejectPromise,timer:setTimeout(()=>disposeWith("seller_bridge_timeout_external_outcome_unknown"),timeout)};});
  }
  return{
    async connect(){
      if(disposed||started||options.signal?.aborted)throw new Error("seller_bridge_session_unavailable");started=true;
      const result=wait("ready");host.addEventListener("message",onMessage);options.frame.addEventListener("load",onLoad);options.signal?.addEventListener("abort",onAbort,{once:true});
      options.frame.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms");options.frame.referrerPolicy="no-referrer";options.frame.src=entry.href;
      return await result as SellerBridgeReady;
    },
    async perform(value){
      const command=validateSellerBridgeCommand(value);
      if(disposed||!ready||pending||options.signal?.aborted||command.sequence!==sequence+1)throw new Error("seller_bridge_action_out_of_order");
      const result=wait("observation",command);options.frame.contentWindow?.postMessage({protocol:SELLER_BRIDGE_PROTOCOL,type:"execute",...session,...command},options.allowedOrigin);
      return await result as SellerBridgeObservation;
    },
    dispose(){disposeWith("seller_bridge_disposed_external_outcome_unknown");},
  };
}
