import type {Language} from "./contracts.ts";
import type {RuntimeCheckReport, RuntimeCheckStep} from "./runtime-checks.ts";

const NAMES:Record<string,[string,string]>={
  revision:["接口版本","Target revision"],missing_slot:["缺失时间","Missing time"],invalid_email:["错误邮箱","Invalid email"],
  create:["创建预约","Create booking"],readback:["独立查询","Independent readback"],replay:["重复提交","Same-key replay"],
  conflict:["冲突请求","Conflicting replay"],unchanged:["原记录复查","Original record reread"],
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
};
const REASONS:Record<string,[string,string]>={
  request_timeout:["请求超时","request timeout"],run_timeout:["整轮超时","run timeout"],cancelled:["已取消","cancelled"],
  network_unavailable:["网络不可用","network unavailable"],redirect_blocked:["重定向被阻止","redirect blocked"],
  response_too_large:["响应过大","response too large"],non_json_response:["非 JSON 响应","non-JSON response"],
  missing_response_body:["响应体缺失","missing body"],invalid_json_response:["JSON 无效","invalid JSON"],
  create_not_verified:["创建尚未验证，未执行","not run: creation unverified"],
  revision_not_verified:["版本尚未验证，未执行","not run: revision unverified"],
  not_run:["未执行","not run"],request_limit:["请求限额","request limit"],target_mismatch:["目标不匹配","target mismatch"],
};

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
  const lines=report.steps.filter(step=>step.outcome!=="observed").map(step=>stepFeedback(step,zh));
  const create=report.steps.find(step=>step.id==="create"),readback=report.steps.find(step=>step.id==="readback");
  const falseSuccess=create?.outcome==="observed"&&create.status===201&&readback?.status===404;
  return [
    zh?"预约接口修改草稿（待买家核对，尚未发送）":"Booking HTTP change draft (buyer review required; not sent)",
    ...(falseSuccess?[zh?"创建返回 201，但独立查询返回 404；尚无成功保存的观测支持。":"Creation returned 201, but independent readback returned 404; saving is unverified."]:[]),
    ...lines,
    zh?"请修订并重新提交。完整原始约定、请求及证据见本版“预约接口实测”报告；本草稿不更改报告或验收状态。":"Revise and resubmit. The current Booking HTTP report retains the original clause, requests and evidence. This draft changes no report or acceptance.",
  ].join("\n");
}
