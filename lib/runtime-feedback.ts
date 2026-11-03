import type {Language} from "./contracts.ts";
import type {RuntimeCheckReport, RuntimeCheckStep} from "./runtime-checks.ts";

const NAMES:Record<string,[string,string]>={
  slot_a_initial:["时段A初始容量","Slot A initial occupancy"],capacity_race_first:["不同键容量请求一","Distinct-key capacity request one"],capacity_race_second:["不同键容量请求二","Distinct-key capacity request two"],
  race_winner_readback:["争抢胜者最终回读","Race winner final readback"],slot_a_after_race:["争抢后时段A容量","Slot A occupancy after race"],race_winner_replay:["胜者同键重放","Winner same-key replay"],slot_a_after_replay:["重放后时段A容量","Slot A occupancy after replay"],
  fill_remainder:["填满剩余容量","Fill remaining capacity"],fill_readback:["补入预约最终回读","Fill booking final readback"],slot_a_full:["时段A满额查询","Slot A full occupancy"],reject_extra:["满额拒绝新增","Reject extra guest"],slot_a_after_rejection:["另时段写入后A复查","Final A check after other-slot writes"],
  slot_b_create:["独立时段B创建","Independent slot B creation"],slot_b_readback:["时段B独立回读","Slot B independent readback"],slot_b_occupancy:["独立时段B容量","Independent slot B occupancy"],
  revision:["接口版本","Target revision"],missing_slot:["缺失时间","Missing time"],invalid_email:["错误邮箱","Invalid email"],
  create:["创建预约","Create booking"],readback:["独立查询","Independent readback"],replay:["重复提交","Same-key replay"],
  conflict:["冲突请求","Conflicting replay"],unchanged:["原记录复查","Original record reread"],
  party_zero:["拒绝零人","Reject zero"],party_fraction:["拒绝小数人数","Reject fractional party"],
  party_below:["小于上限创建","Below-limit create"],party_below_readback:["小于上限回读","Below-limit readback"],
  party_exact:["恰好上限创建","Exact-limit create"],party_exact_readback:["恰好上限回读","Exact-limit readback"],
  party_above:["拒绝超过上限","Reject above limit"],concurrent_first:["同键并发请求一","Concurrent request one"],
  concurrent_second:["同键并发请求二","Concurrent request two"],concurrent_readback:["并发独立回读","Concurrent readback"],
};
const EXPECTED:Record<string,[string,string]>={
  slot_a_initial:["需空时段及独立容量查询","need empty slot and independent occupancy"],capacity_race_first:["需不同键仅一个201及一个409容量错误码","need distinct-key 201/409 + capacity code"],capacity_race_second:["需不同键仅一个201及一个409容量错误码","need distinct-key 201/409 + capacity code"],
  race_winner_readback:["需另时段写入后原胜者保持","need unchanged winner after other-slot writes"],slot_a_after_race:["需胜者人数及唯一ID","need winner count and sole ID"],race_winner_replay:["需200及未改变的胜者ID和字段","need 200 and unchanged winner ID/fields"],slot_a_after_replay:["需重放不增加容量","need replay to leave occupancy unchanged"],
  fill_remainder:["需201及正确剩余人数和新ID","need 201, remaining count and new ID"],fill_readback:["需另时段写入后补入预约保持","need unchanged fill after other-slot writes"],slot_a_full:["需总人数等于容量及两条ID","need full capacity and both IDs"],reject_extra:["需409及容量错误码","need 409 + capacity code"],slot_a_after_rejection:["需拒绝及另时段写入后A保持","need unchanged A after rejection and other-slot writes"],
  slot_b_create:["需201及独立时段新ID","need 201 and distinct other-slot ID"],slot_b_readback:["需200及正确时段和原字段","need 200, correct slot and original fields"],slot_b_occupancy:["需仅包含时段B预约的容量","need occupancy containing only B booking"],
  revision:["需版本匹配及 HTTP 200","need matching revision/200"],
  missing_slot:["需 400/422 及验证错误码","need 400/422 + validation code"],
  invalid_email:["需 400/422 及验证错误码","need 400/422 + validation code"],
  create:["需 201、预约 ID 和原始字段","need 201, ID and original fields"],
  readback:["需 200、同一 ID 和原始字段","need 200, same ID/original fields"],
  replay:["需 200/201、同一 ID 和原始字段","need 200/201, same ID/fields"],
  conflict:["需 409 及冲突错误码","need 409 + conflict code"],
  unchanged:["需 200 且原字段未改写","need 200 and unchanged fields"],
  party_zero:["需 400/422 及验证错误码","need 400/422 + validation code"],
  party_fraction:["需 400/422 及验证错误码","need 400/422 + validation code"],
  party_below:["需成功创建及正确人数","need creation and expected party size"],
  party_below_readback:["需 200、同一 ID 和正确人数","need 200, same ID/party size"],
  party_exact:["需成功创建及约定上限人数","need creation at the agreed maximum"],
  party_exact_readback:["需 200、同一 ID 和上限人数","need 200, same ID/maximum"],
  party_above:["需 400/422 及验证错误码","need 400/422 + validation code"],
  concurrent_first:["需两次同键响应的 ID 和字段一致","need same-key IDs/fields to agree"],
  concurrent_second:["需两次同键响应的 ID 和字段一致","need same-key IDs/fields to agree"],
  concurrent_readback:["需 200、同一 ID 和原始字段","need 200, same ID/original fields"],
};
const REASONS:Record<string,[string,string]>={
  resumed_initial_state_not_observed:["恢复时不能补证首次空时段","initial empty slot was not observed on recovery"],resumed_capacity_run_not_replayed:["恢复未重放首次容量过程；需新运行","initial capacity sequence was not replayed; start a fresh run"],
  initial_slot_not_empty_or_unavailable:["初始时段非空或无法核对，未写入","not written: initial slot was not empty or unavailable"],race_not_verified:["容量争抢未验证，未执行依赖步骤","not run: capacity race unverified"],race_or_replay_state_not_verified:["争抢或重放容量未验证，未补入","not run: race or replay occupancy unverified"],fill_not_verified:["剩余容量预约未验证","remaining-capacity booking unverified"],full_slot_not_verified:["满额状态未验证","full-slot state unverified"],slot_b_not_verified:["独立时段B未验证","independent slot B unverified"],
  request_timeout:["请求超时","request timeout"],run_timeout:["整轮超时","run timeout"],cancelled:["已取消","cancelled"],
  network_unavailable:["网络不可用","network unavailable"],redirect_blocked:["重定向被阻止","redirect blocked"],
  response_too_large:["响应过大","response too large"],non_json_response:["非 JSON 响应","non-JSON response"],
  missing_response_body:["响应体缺失","missing body"],invalid_json_response:["JSON 无效","invalid JSON"],
  create_not_verified:["创建尚未验证，未执行","not run: creation unverified"],
  revision_not_verified:["版本尚未验证，未执行","not run: revision unverified"],
  not_run:["未执行","not run"],request_limit:["请求限额","request limit"],target_mismatch:["目标不匹配","target mismatch"],
  resumed_creation_not_observed:["恢复重试未观察到首次创建","initial creation was not observed on recovery"],
  resumed_concurrency_not_observed:["恢复重试未观察到原始并发过程","original concurrent creation was not observed on recovery"],
  boundary_not_verified:["边界预约尚未验证，未执行回读","not run: boundary booking unverified"],
  concurrent_not_verified:["并发响应尚未验证，未执行回读","not run: concurrent responses unverified"],
};

export function runtimeStepName(id:string,language:Language,fallback?:string):string {
  return NAMES[id]?.[language==="zh"?0:1]??fallback??(language==="zh"?"接口步骤":"HTTP step");
}
export function runtimeReasonLabel(reason:string,language:Language):string {
  return REASONS[reason]?.[language==="zh"?0:1]??(language==="zh"?"详见报告原因":"see report reason");
}

function stepFeedback(step:RuntimeCheckStep,zh:boolean):string {
  const side=zh?0:1;
  const name=NAMES[step.id]?.[side]??(zh?"接口步骤":"HTTP step");
  const state=step.outcome==="mismatch"?(zh?"不符":"mismatch"):(zh?"未确定":"unavailable");
  const status=step.status===undefined?"":` HTTP ${step.status};`;
  const detail=step.outcome==="unavailable"?(REASONS[step.reason??""]?.[side]??(zh?"详见报告原因":"see report reason")):(EXPECTED[step.id]?.[side]??(zh?"详见完整报告":"see full report"));
  return `${step.id} ${name}: ${state};${status} ${detail}`;
}

/** Keep every protocol exception readable inside the feedback field's 1000
 * character limit. Raw payloads and the full original clause stay in the saved
 * HTTP report; never truncate a concatenated report through the last failure. */
export function draftRuntimeFeedback(report:RuntimeCheckReport,language:Language):string {
  const zh=language==="zh";
  const exceptions=report.steps.filter(step=>step.outcome!=="observed");
  const lines=exceptions.map(step=>stepFeedback(step,zh));
  const create=report.steps.find(step=>step.id==="create"),readback=report.steps.find(step=>step.id==="readback");
  const falseSuccess=create?.outcome==="observed"&&create.status===201&&readback?.status===404;
  // The outer editor owns draft/sent state. This text is retained verbatim
  // after submission and must not keep claiming an already-sent request is unsent.
  const title=zh?"预约接口修改建议（请依据本版证据核对）":"Booking HTTP change request (check against this delivery's evidence)";
  const footer=zh?"请修订并重新提交。完整原始约定、请求及证据见本版“预约接口实测”报告；本草稿不更改报告或验收状态。":"Revise and resubmit. The current Booking HTTP report retains the original clause, requests and evidence. This draft changes no report or acceptance.";
  const highlights=[...(falseSuccess?[zh?"创建返回 201，但独立查询返回 404；尚无成功保存的观测支持。":"Creation returned 201, but independent readback returned 404; saving is unverified."]:[])];
  const above=report.steps.find(step=>step.id==="party_above");
  if(report.plan.protocol!=="booking-http-v1"&&above?.outcome==="mismatch"&&above.status!==undefined&&above.status>=200&&above.status<300){
    const max=report.plan.policy.maxPartySize;
    highlights.push(zh?`原文每笔最多${max}人，但${max+1}人请求返回HTTP${above.status}；预期400/422及验证错误码。`:`Maximum ${max}, but ${max+1} people returned HTTP ${above.status}; need 400/422 + validation code.`);
  }
  if(report.plan.protocol==="booking-http-v3"){
    const race=report.steps.filter(step=>step.id==="capacity_race_first"||step.id==="capacity_race_second");
    if(race.some(step=>step.outcome!=="observed"))highlights.push(zh?`不同键容量争抢：HTTP${race.map(step=>step.status??"?").join("/")}；预期仅一个201、另一个409。`:`Distinct-key capacity race: HTTP${race.map(step=>step.status??"?").join("/")}; need one 201 and one 409.`);
    highlights.push(zh?"人数与时段容量分属两条原文；请同时对照报告引用。":"Party and slot limits cite separate clauses; consult both in the report.");
  }
  const full=[title,...highlights,
    ...lines,
    footer,
  ].join("\n");
  if(full.length<=1000)return full;
  // Keep every exception ID and actual status. Detailed expectations/reasons
  // remain in the linked report instead of clipping the final protocol steps.
  const compact=[title,...highlights,zh?"以下均需整改或补证：":"Each exception below needs repair or evidence:",
    ...exceptions.map(step=>`${step.id} ${step.outcome==="mismatch"?(zh?"不符":"mismatch"):(zh?"未确定":"unavailable")}${step.status===undefined?"":` HTTP${step.status}`}`),footer].join("\n");
  if(compact.length<=1000)return compact;
  // The bounded protocol ID list always takes priority over explanatory prose.
  const minimal=[zh?"接口修改建议：M=不符，?=未确定":"HTTP changes: M=mismatch, ?=unavailable",
    ...exceptions.map(step=>`${step.id} ${step.outcome==="mismatch"?"M":"?"}${step.status===undefined?"":` HTTP${step.status}`}`),footer];
  const room=1000-minimal.join("\n").length;
  if(highlights.join("\n").length+1<=room)minimal.splice(1,0,...highlights);
  return minimal.join("\n");
}

/** Capacity failures belong to the capacity clause, not the party-size citation.
 * Shared metadata failure uses the primary clause; mixed feedback cites both. */
export function runtimeFeedbackCriterion(report:RuntimeCheckReport):string{
  if(report.plan.protocol!=="booking-http-v3")return report.plan.criterionId;
  return report.steps.some(step=>step.outcome!=="observed"&&step.id!=="revision"&&step.id!=="party_above")?report.plan.slotCapacity.criterionId:report.plan.criterionId;
}
