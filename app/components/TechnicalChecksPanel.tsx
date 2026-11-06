"use client";
import {useEffect,useReducer,useRef,useState,type ComponentProps} from "react";
import {ProjectJourneyPanel} from "./ProjectJourneyPanel";
import {DeliveryStageEvidence} from "./DeliveryStageEvidence";
import {hasTechnicalChecksState,initialTechnicalChecksDisclosure,readTechnicalApplicationHistory,technicalChecksDisclosure,technicalChecksFocusMatches,type TechnicalChecksFocusRequest} from "./technical-checks-state";
import "../project-journey.css";

export type TechnicalChecksPanelProps=ComponentProps<typeof ProjectJourneyPanel>&{
  focusRequest?:TechnicalChecksFocusRequest;
  hasSupplementalEvidence?:boolean;
  stageEvidenceEnabled?:boolean;
};
type HistoryStatus={identity:string;state:"loading"|"known"|"unknown";hasRecords?:boolean};

/** Optional developer tools mount on first use or retained technical evidence.
 * Collapsing only changes visibility: it never unmounts a running driver,
 * discards local mappings or resets a saved acceptance acknowledgement. */
export function TechnicalChecksPanel({focusRequest,hasSupplementalEvidence=false,stageEvidenceEnabled=true,...journeyProps}:TechnicalChecksPanelProps){
  const {quote,role,language,request}=journeyProps,delivery=quote.proof.delivery!;
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const identity=`${quote.id}:${delivery.id}:${role}`,current=useRef(identity);current.current=identity;
  const needed=hasTechnicalChecksState(delivery,hasSupplementalEvidence);
  const [disclosure,dispatch]=useReducer(technicalChecksDisclosure,needed,initialTechnicalChecksDisclosure);
  const [history,setHistory]=useState<HistoryStatus>(),[retry,setRetry]=useState(0);
  const epoch=useRef(0),panel=useRef<HTMLDetailsElement>(null),handledFocus=useRef<string|undefined>(undefined);
  const historyStatus=history?.identity===identity?history:undefined;
  const focusMatches=technicalChecksFocusMatches(focusRequest,delivery.id);
  const focusKey=focusMatches?`${quote.id}:${delivery.id}:${focusRequest!.kind}:${focusRequest!.id}`:undefined;

  useEffect(()=>{if(needed)dispatch({type:"needed"});},[needed]);
  useEffect(()=>{
    const token=++epoch.current;
    setHistory({identity,state:"loading"});
    // One existing authenticated read is retained up front. Applications can
    // live outside the quote/catalog; hiding all reads would hide that history.
    return readTechnicalApplicationHistory(
      ()=>request<unknown>(`/api/proofs/${encodeURIComponent(quote.id)}/integration-requests`),
      ()=>token===epoch.current&&current.current===identity,
      value=>{setHistory({identity,...value});if(value.state==="known"&&value.hasRecords)dispatch({type:"needed"});},
    );
  },[identity,retry]);
  useEffect(()=>{if(focusKey&&handledFocus.current!==focusKey)dispatch({type:"open"});},[focusKey]);
  useEffect(()=>{
    if(!focusKey||handledFocus.current===focusKey||!disclosure.activated||!disclosure.open)return;
    const frame=requestAnimationFrame(()=>{
      if(current.current!==identity)return;
      const journey=panel.current?.querySelector<HTMLDetailsElement>("#project-journey");
      if(journey)journey.open=true;
      const target=focusRequest!.kind==="transfer"?panel.current?.querySelector<HTMLDetailsElement>("#transfer-competition"):journey;
      if(target){target.open=true;target.scrollIntoView({block:"nearest",behavior:"smooth"});target.querySelector<HTMLElement>("summary")?.focus({preventScroll:true});handledFocus.current=focusKey;}
    });
    return()=>cancelAnimationFrame(frame);
  },[identity,focusKey,disclosure.activated,disclosure.open]);

  const pending=Boolean(delivery.journeyRun||delivery.transferCompetitionRun);
  const badge=pending?tr("有运行记录待处理","Run record needs attention")
    :historyStatus?.state==="unknown"?tr("申请状态未知","Application status unknown")
    :needed||historyStatus?.hasRecords?tr("已有设置或记录","Saved setup or records")
    :historyStatus?.state==="known"?tr("按需展开","Open when needed"):tr("读取申请状态…","Reading application status…");
  return <section aria-label={tr("开发者可选检验","Optional developer checks")}>
    <p className="form-help">{tr("普通网页文件交付可跳过。已有测试站申请或深度检查记录，也从这里继续。","You can skip this for ordinary website-file delivery. Continue existing staging applications or deeper checks here too.")}</p>
    {historyStatus?.state==="unknown"&&<p className="journey-warning" role="status">{tr("未能读取接入申请，是否已有记录尚未确定；仍可展开核对。","Staging applications could not be read; existing records are unknown. You can still open the tools to inspect them.")}{" "}<button type="button" className="subtle-button" onClick={()=>setRetry(value=>value+1)}>{tr("重试读取申请状态","Retry application status")}</button></p>}
    <details ref={panel} id="technical-checks" className="project-journey technical-checks" open={disclosure.open} onToggle={event=>{
      if(event.target!==event.currentTarget)return;
      dispatch({type:"toggle",open:event.currentTarget.open});
    }}>
      <summary><span>{tr("开发者深度检验（可选）","Developer checks (optional)")}</span><b>{badge}</b></summary>
      <p>{tr("需要核对表单是否保存、预约或取消等动态行为时，再由开发者选择对应工具。展开、查看和读取申请不会自动运行测试、验收或付款。","For form storage, bookings, cancellation or other supported dynamic checks, a developer can choose the relevant tool. Opening, viewing or reading applications does not run tests, accept delivery or pay.")}</p>
      {disclosure.activated&&<>
        <DeliveryStageEvidence key={`stage-${quote.id}-${delivery.id}-${role}`} language={language} quote={quote} role={role} request={request} onApply={journeyProps.onApply} enabled={stageEvidenceEnabled} onBusy={journeyProps.onBusy}/>
        <ProjectJourneyPanel {...journeyProps}/>
      </>}
    </details>
  </section>;
}
