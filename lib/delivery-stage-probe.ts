import {DELIVERY_STAGES,createDeliveryStageReport,validateDeliveryStageObservation,validateDeliveryStagePlan,type DeliveryStage,type DeliveryStageObservation,type DeliveryStagePlan,type DeliveryStageReport} from "./delivery-stage-evidence.ts";
export type DeliveryStageAdapter = Partial<Record<DeliveryStage,(context:{plan:DeliveryStagePlan;previous:readonly DeliveryStageObservation[];signal:AbortSignal})=>Promise<unknown>>>;
/** Explicit cooperative adapter invocation only. No URL discovery, model calls,
 * writes outside adapters, automatic retries or acceptance authority. */
export function createDeliveryStageProbe(adapter:DeliveryStageAdapter,options:{timeoutMs?:number}={}){
  const timeoutMs=options.timeoutMs??5000;
  if(!adapter||typeof adapter!=="object"||Array.isArray(adapter)||Reflect.ownKeys(adapter).some(k=>typeof k!=="string"||!DELIVERY_STAGES.includes(k as DeliveryStage)||!("value" in Object.getOwnPropertyDescriptor(adapter,k)! )||typeof adapter[k as DeliveryStage]!=="function")||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error("INVALID_STAGE_PROBE_ADAPTER");
  let busy=false,closed=false;
  return {
    async run(input:unknown):Promise<DeliveryStageReport>{
      if(closed)throw Error("STAGE_PROBE_EXTERNAL_OUTCOME_UNKNOWN");if(busy)throw Error("STAGE_PROBE_BUSY");busy=true;
      try{
        const plan=validateDeliveryStagePlan(input),observations:DeliveryStageObservation[]=[];
        let unresolvedSideEffect=false;
        for(const {stage,coverage}of plan.stages){
          if(coverage!=="adapter"){observations.push(coverage==="manual"?{outcome:"unknown",reason:"manual_required"}:{outcome:"unsupported"});continue;}
          if(unresolvedSideEffect){observations.push({outcome:"unknown",reason:"prior_result_unknown"});continue;}
          const operation=adapter[stage];if(!operation){observations.push({outcome:"unsupported"});continue;}
          const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
          try{
            const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("STAGE_TIMEOUT"));},timeoutMs);});
            const pending=Promise.resolve().then(()=>operation({plan:structuredClone(plan),previous:structuredClone(observations),signal:controller.signal}));
            const raw=await Promise.race([pending,timeout]);
            const observation=validateDeliveryStageObservation(stage,raw);observations.push(observation);
            if(observation.outcome==="unknown"){unresolvedSideEffect=true;closed=true;}
          }catch(error){observations.push({outcome:"unknown",reason:error instanceof Error&&error.message==="STAGE_TIMEOUT"?"timeout":"adapter_error"});unresolvedSideEffect=true;closed=true;}
          finally{if(timer)clearTimeout(timer);}
        }
        return await createDeliveryStageReport(plan,observations);
      }finally{busy=false;}
    }
  };
}
