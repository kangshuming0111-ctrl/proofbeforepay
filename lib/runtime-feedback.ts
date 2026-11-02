import type {Language} from "./contracts.ts";
import type {RuntimeCheckReport, RuntimeCheckStep} from "./runtime-checks.ts";

const NAMES:Record<string,[string,string]>={
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
  if(report.plan.protocol==="booking-http-v2"&&above?.outcome==="mismatch"&&above.status!==undefined&&above.status>=200&&above.status<300){
    const max=report.plan.policy.maxPartySize;
    highlights.push(zh?`原文每笔最多${max}人，但${max+1}人请求返回HTTP${above.status}；预期400/422及验证错误码。`:`Maximum ${max}, but ${max+1} people returned HTTP ${above.status}; need 400/422 + validation code.`);
  }
  const full=[title,...highlights,
    ...lines,
    footer,
  ].join("\n");
  if(full.length<=1000)return full;
  // Keep every exception ID and actual status. Detailed expectations/reasons
  // remain in the linked report instead of clipping the final protocol steps.
  return [title,...highlights,zh?"以下均需整改或补证：":"Each exception below needs repair or evidence:",
    ...exceptions.map(step=>`${step.id} ${step.outcome==="mismatch"?(zh?"不符":"mismatch"):(zh?"未确定":"unavailable")}${step.status===undefined?"":` HTTP${step.status}`}`),
    footer,
  ].join("\n");
}
