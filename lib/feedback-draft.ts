export type DraftRiskSource={assessmentId:string;riskIndex:number};
export type FeedbackDraftState={comments:Record<string,string>;riskSources:Record<string,DraftRiskSource>;riskDraftConflict:boolean;riskDraftConflicts:Record<string,true>};
export type FeedbackDraftAction=
 | {type:"reset"}
 | {type:"edit";criterionId:string;comment:string}
 | {type:"unlink";criterionId:string}
 | {type:"suggest";criterionId:string;comment:string;riskSource?:DraftRiskSource};
export const emptyFeedbackDraft=():FeedbackDraftState=>({comments:{},riskSources:{},riskDraftConflict:false,riskDraftConflicts:{}});
/** Comment and provenance are one user draft. A late suggestion can change neither
 * when text already exists, regardless of React event batching or render timing. */
export function feedbackDraftReducer(state:FeedbackDraftState,action:FeedbackDraftAction):FeedbackDraftState{
 if(action.type==="reset")return emptyFeedbackDraft();
 const {criterionId}=action;
 if(action.type==="unlink"){const riskSources={...state.riskSources};delete riskSources[criterionId];const riskDraftConflicts={...state.riskDraftConflicts};delete riskDraftConflicts[criterionId];return {...state,riskSources,riskDraftConflicts,riskDraftConflict:Object.keys(riskDraftConflicts).length>0};}
 if(action.type==="edit"){
  const riskSources={...state.riskSources};if(!action.comment.length)delete riskSources[criterionId];
  const riskDraftConflicts={...state.riskDraftConflicts};if(!action.comment.length)delete riskDraftConflicts[criterionId];
  return {...state,comments:{...state.comments,[criterionId]:action.comment},riskSources,riskDraftConflicts,riskDraftConflict:Object.keys(riskDraftConflicts).length>0};
 }
 if(state.comments[criterionId]?.length){const riskDraftConflicts={...state.riskDraftConflicts,...(action.riskSource?{[criterionId]:true as const}:{})};return {...state,riskDraftConflicts,riskDraftConflict:Object.keys(riskDraftConflicts).length>0};}
 const riskDraftConflicts={...state.riskDraftConflicts};delete riskDraftConflicts[criterionId];
 return {...state,comments:{...state.comments,[criterionId]:action.comment},riskSources:{...state.riskSources,...(action.riskSource?{[criterionId]:{...action.riskSource}}:{})},riskDraftConflicts,riskDraftConflict:Object.keys(riskDraftConflicts).length>0};
}
