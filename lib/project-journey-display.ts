import type {Language} from "./contracts.ts";
import {JOURNEY_SLOTS,journeyKey,type JourneyObservation,type JourneyStepId} from "./journey-checks.ts";
import {evaluateStoredProjectJourneyReport,validateStoredProjectJourneyReport,type ProjectJourneyReport} from "./project-journey.ts";

const STEP_LABELS:Record<JourneyStepId,readonly[string,string]>={
  meta:["确认测试站版本和预约规则","Confirm staging version and booking rules"],
  create:["在网站预约 5 人","Book 5 guests through the website"],
  create_readback:["查回刚才的 5 人预约","Read back the 5-guest booking"],
  cancel:["取消第一笔预约","Cancel the first booking"],
  cancel_readback:["确认取消后名额已释放","Check that cancellation released the places"],
  rebook:["取消后重新预约 5 人","Book 5 guests after cancellation"],
  fill:["再预约 3 人，填满时段","Add 3 guests to fill the time slot"],
  full_readback:["查回时段确实已满 8 人","Read back the full 8-guest slot"],
  cancel_repeat:["再次取消同一笔旧预约","Cancel the same old booking again"],
  cancel_repeat_readback:["确认重复取消没有多放名额","Check that repeat cancellation released no extra places"],
  reject_extra:["确认满额后不能再预约 1 人","Check that a full slot rejects 1 extra guest"],
  source_create:["在时段 B 预约 2 人供改期","Book 2 guests in B before changing time"],
  move_full:["尝试改到已满的时段","Try moving into a full time slot"],
  move_full_readback:["确认改期失败仍保留原预约","Check that a rejected move kept the original booking"],
  move_free:["把原预约改到空闲时段 C","Move the original booking into free slot C"],
  move_free_readback:["查回改期结果和两个时段人数","Read back the moved booking and both slot totals"],
  response_loss_create:["模拟保存后响应失败的预约","Simulate a failed response after saving a booking"],
  response_loss_readback:["先查询响应失败的预约是否已保存","Check whether the booking survived the failed response"],
  response_loss_retry:["用原请求编号重试，检查没有重复预约","Retry the original request and check for duplicates"],
  final_merchant_readback:["核对最终预约记录和全部时段人数","Reconcile final bookings and all slot totals"],
};
const REASONS:Record<string,readonly[string,string]>={
  prerequisite_not_observed:["前面的必要结果尚未确认，本步骤不能判为通过。","A required earlier result is unconfirmed; this step cannot pass."],
  not_executed:["本步骤没有执行，也没有成功证据。","This step was not executed and has no success evidence."],
  not_run:["本步骤没有执行，也没有成功证据。","This step was not executed and has no success evidence."],
  server_read_unavailable:["主站服务器未能读到完整结果，需要恢复服务后补查；尚不能判断卖家功能是否达标。","The main server could not read a complete result. Recheck after service recovery; functionality is unverified."],
  server_read_timeout:["主站服务器查询超时，需要补查；超时不代表预约没有保存或卖家功能不达标。","The main server read timed out. Recheck; timeout proves neither a missing booking nor unmet functionality."],
  server_fetch_configuration:["主站运行环境的请求配置不兼容，尚未完成独立读取；需要修正主站配置后复测，不能当作卖家缺陷。","The main runtime’s request configuration is incompatible, so independent reads did not complete. Fix the main configuration and retest; this is not a seller defect."],
  response_too_large:["接口响应超过读取上限，未保留为成功证据；需要缩减测试响应或另行补证。","The response exceeded the read limit and is not success evidence. Reduce the test response or provide further evidence."],
  non_json_response:["接口没有返回约定的 JSON，无法核对结果；请先检查测试接口和服务状态。","The endpoint did not return the agreed JSON. Check the staging endpoint and service before judging the result."],
  invalid_json_response:["接口返回的 JSON 无法解析，需要核对响应；业务结果仍未确定。","The JSON response could not be parsed. Check the response; the business outcome remains unknown."],
  missing_response_body:["没有取得响应内容，无法核对预约是否保存。","No response body was obtained, so booking storage cannot be checked."],
  redirect_blocked:["查询被重定向，系统为保持登记目标边界停止跟随；需要核对地址，不能据此判定功能失败。","A redirect was blocked to preserve the registered target boundary. Check the address; this is not a functionality verdict."],
  approval_or_run_expired:["本次运行或测试站批准已过期，没有继续查询；需要重新批准后重测。","The run or staging approval expired, so further reads stopped. Renew approval before retesting."],
  target_mismatch:["实际读取目标与登记不一致，系统停止查询，需要运营方核对登记。","The read target differed from its registration. Reads stopped; the operator must check the registration."],
  request_timeout:["页面请求超时，可能已写入；应先查询结果，不能直接当作没有预约。","The page request timed out and may have committed. Read the outcome before assuming no booking exists."],
  network_unavailable:["网络结果不可用，需要补查；不能据此判断卖家功能失败。","Network evidence is unavailable. Recheck; it does not establish a functionality failure."],
  request_limit:["已达到本轮请求上限，后续结果未确定。","The run reached its request limit; later outcomes remain unknown."],
};
export function projectJourneyStepLabel(id:string,language:Language):string{
  return STEP_LABELS[id as JourneyStepId]?.[language==="zh"?0:1]??(language==="zh"?"业务流程检查":"Business journey check");
}
export function projectJourneyUnavailableLabel(reason:string|undefined,language:Language):string{
  const side=language==="zh"?0:1,code=reason?.split(";",1)[0].trim()??"";
  if(REASONS[code])return REASONS[code][side];
  if(code==="evidence_size_limit")return language==="zh"?"本步证据超过保存上限，未完整保存；需要补证，不能算通过。":"This step exceeded the saved-evidence limit. Evidence is incomplete and cannot count as a pass.";
  if(code==="run_closed_without_further_network"||/^(?:seller_bridge_(?:stopped|disposed|navigation|timeout)|waiting_stopped|run_deadline)/u.test(code))return language==="zh"?"本轮已停止后续等待或操作；先前请求可能已保存，停止不会回滚，结果需要补查。":"Further waiting or actions stopped. Earlier requests may have committed; stopping is not rollback. Recheck their outcomes.";
  if(code==="frontend_response_unavailable_external_outcome_unknown"||/^(?:frontend_action_timeout|controlled_frontend_boot_timeout|seller_bridge_session_unavailable)/u.test(code))return language==="zh"?"未取得完整的页面操作结果；可能已发出请求，需要另行查询。":"The page action produced no complete observation. It may have sent a request; independently recheck the outcome.";
  if(code.startsWith("seller_bridge_"))return language==="zh"?"页面协作连接的身份、顺序或数据校验未完成，不能证明业务结果；需要重新连接核查。":"The page bridge could not validate identity, ordering or data. The business result is unverified; reconnect and recheck.";
  return language==="zh"?"本步骤没有取得可确认的完整证据；请展开原始记录核对，不能算通过。":"Complete confirming evidence is unavailable. Inspect the original record; this step cannot count as a pass.";
}
const object=(value:unknown):Record<string,unknown>|undefined=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:undefined;
const finite=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value);
const EXPECTED_OCCUPANCY:Partial<Record<JourneyStepId,Partial<Record<"a"|"b"|"c",number>>>>={create_readback:{a:5},cancel_readback:{a:0},full_readback:{a:8},cancel_repeat_readback:{a:8},reject_extra:{a:8},move_full_readback:{a:8,b:2},move_free_readback:{b:0,c:2},final_merchant_readback:{a:8,b:1,c:2}};
function difference(report:ProjectJourneyReport,id:JourneyStepId,raw:JourneyObservation|undefined,language:Language):string{
  const zh=language==="zh",trace=raw?.requests?.[0],sent=object(trace?.request),returned=object(trace?.response),receipt=object(raw?.receipt?.body),rows=object(raw?.merchant?.body)?.bookings;
  if(raw?.ui?.fields?.partySize!==undefined&&finite(sent?.partySize)&&String(sent.partySize)!==raw.ui.fields.partySize){const displayed=Number(raw.ui.fields.partySize);if(finite(displayed))return zh?`页面人数${displayed}，请求人数${sent.partySize}。`:`Page guests ${displayed}; request guests ${sent.partySize}.`;}
  if(raw?.ui?.status==="success"&&!raw.requests?.length)return zh?"页面报成功，但没有保存相应请求记录；需补证。":"The page claims success without a saved request trace; evidence is needed.";
  for(const reading of raw?.occupancies??[]){const actual=object(reading.body)?.guestCount,expected=EXPECTED_OCCUPANCY[id]?.[reading.slot];if(reading.status===200&&finite(actual)&&expected!==undefined&&actual!==expected)return zh?`时段${reading.slot.toUpperCase()}读回${actual}人，约定此时应${expected}人。`:`Slot ${reading.slot.toUpperCase()} readback ${actual} guests; expected ${expected}.`;}
  if(id==="move_full_readback"&&raw?.receipt?.status===200&&receipt?.status==="cancelled")return zh?"改期失败后读回原单已取消；约定应保留原预约。":"After the rejected move, readback says cancelled; the original should remain active.";
  if((id==="response_loss_readback"||id==="response_loss_retry"||id==="final_merchant_readback")&&raw?.merchant?.status===200&&Array.isArray(rows)){
    const matches=rows.filter(row=>object(row)?.idempotencyKey===journeyKey(report.runId,"loss-create"));
    if(matches.length!==1)return zh?`商家接口读回原请求编号对应${matches.length}笔，约定应1笔。`:`Merchant readback has ${matches.length} records for the original request; expected 1.`;
  }
  const statuses=[...(trace?.status!==undefined?[trace.status]:[]),...(raw?.merchant?[raw.merchant.status]:[]),...(raw?.receipt?[raw.receipt.status]:[])];
  if(statuses.some(status=>status>=500))return zh?`接口记录HTTP${statuses.filter(s=>s>=500).join("/")}；请先核查服务，业务结果待补证。`:`Endpoint HTTP${statuses.filter(s=>s>=500).join("/")}; check service first, then recheck the business outcome.`;
  if(trace?.error)return zh?"请求观测不完整，可能已写入；需先查结果。":"Request evidence is incomplete and may have committed; read back first.";
  if(trace?.status!==undefined){
    const expected=id==="meta"||id==="cancel"||id==="cancel_repeat"||id==="move_free"||id==="response_loss_retry"?200:id==="reject_extra"||id==="move_full"?409:id==="response_loss_create"?504:201;
    if(trace.status!==expected)return zh?`记录HTTP${trace.status}，本步约定HTTP${expected}。`:`Recorded HTTP${trace.status}; this step expects HTTP${expected}.`;
  }
  if(raw?.receipt?.status===404)return zh?"独立查询返回HTTP404，尚未查到对应预约。":"Independent readback returned HTTP404; the matching booking was not found.";
  if(id==="final_merchant_readback"&&raw?.merchant?.status===200&&Array.isArray(rows)){const active=rows.filter(row=>object(row)?.status==="active").length;if(rows.length!==5||active!==4)return zh?`商家接口读回${rows.length}条记录、${active}条有效；约定应5条、4条有效。`:`Merchant readback has ${rows.length} records, ${active} active; expected 5 and 4.`;}
  if(id==="meta")return zh?"读回的版本、协议或人数规则与登记不一致。":"Readback version, protocol or booking limits differ from the registration.";
  if(id==="response_loss_create")return zh?"受控504后的页面状态或请求证据与约定不一致。":"The page state or request evidence after controlled504 differs from the agreement.";
  if(id==="move_free_readback"&&receipt?.slot!==undefined&&receipt.slot!==JOURNEY_SLOTS.c)return zh?"读回预约不在目标时段C，需核对改期结果。":"Readback is not in destination slot C; check the move outcome.";
  if(returned||receipt)return zh?"读回编号、字段、状态或原请求编号与本步约定不一致。":"Readback identity, fields, state or original request key differ from this step’s agreement.";
  return zh?"本步证据与约定不一致；请对照完整原始记录核查。":"Evidence differs from this step’s agreement; inspect the original record.";
}
function truncateUtf16(text:string,limit:number):string{
  if(text.length<=limit)return text;let end=Math.max(0,limit);
  if(end>0&&text.charCodeAt(end-1)>=0xd800&&text.charCodeAt(end-1)<=0xdbff&&text.charCodeAt(end)>=0xdc00&&text.charCodeAt(end)<=0xdfff)end--;
  return text.slice(0,end);
}
/** Plain feedback for a human to review. Only non-observed steps are cited;
 * no endpoint is called, raw message/body text is copied, or state is changed. */
export function draftProjectJourneyFeedback(report:ProjectJourneyReport,language:Language):string{
  const zh=language==="zh";
  let evaluation:ReturnType<typeof evaluateStoredProjectJourneyReport>;
  try{validateStoredProjectJourneyReport(report);evaluation=evaluateStoredProjectJourneyReport(report);}catch{return zh?"业务旅程报告无法完整校验。请先恢复与该交付版本绑定的原报告，不用最新结果替代，也不据此判断卖家功能不达标。":"The journey report could not be validated. Restore the original delivery-bound report; do not substitute a newer result or infer unmet seller functionality.";}
  const exceptions=evaluation.steps.filter(step=>step.outcome!=="observed").sort((a,b)=>Number(b.outcome==="mismatch")-Number(a.outcome==="mismatch"));
  const title=zh?`业务旅程核对：${evaluation.summary.issues}项不符，${evaluation.summary.unavailable}项未确定。`:`Journey review: ${evaluation.summary.issues} mismatched, ${evaluation.summary.unavailable} unknown.`;
  const header=[title,`${zh?"报告":"Report"}: ${report.id}`,`${zh?"交付":"Delivery"}: ${report.deliveryId}`];
  if(!exceptions.length)return[...header,zh?"没有需要列入本草稿的不符或未确定项。检验不等于接受交付或付款。":"No mismatched or unknown steps need listing. Checks do not accept delivery or make payment."].join("\n");
  const raws=new Map(report.input.observations.map(raw=>[raw.id,raw]));
  const actualPath=exceptions.map(step=>raws.get(step.id)?.requests?.[0]?.path).find((value):value is string=>typeof value==="string");
  header.push(`${actualPath?zh?"请求路径":"Request path":zh?"登记后端路径":"Registered backend path"}: ${actualPath??new URL(report.registration.backendBaseUrl).pathname}`);
  const footer=zh?"未确定项需恢复服务或补证后复测，不直接判功能不达标。本草稿不改变验收或付款。":"Unknowns need service/evidence rechecks, not a finding of unmet work. Draft only; no acceptance or payment.";
  const lines=exceptions.map(step=>`${step.id} ${projectJourneyStepLabel(step.id,language)}：${step.outcome==="mismatch"?(zh?"不符":"mismatch"):(zh?"未确定":"unknown")}；${step.outcome==="unavailable"?projectJourneyUnavailableLabel(step.reason,language):difference(report,step.id,raws.get(step.id),language)}`);
  let selected:string[]=[];
  for(const line of lines){const remaining=lines.length-selected.length-1,tail=remaining?[zh?`另${remaining}项详见该报告原始记录。`:`See this report for ${remaining} other exceptions.`]:[];const candidate=[...header,...selected,line,...tail,footer].join("\n");if(candidate.length<=1000)selected.push(line);else break;}
  if(!selected.length){const first=exceptions[0],short=`${first.id}: ${first.outcome==="mismatch"?difference(report,first.id,raws.get(first.id),language):projectJourneyUnavailableLabel(first.reason,language)}`,tail=lines.length>1?[zh?`另${lines.length-1}项详见该报告原始记录。`:`See this report for ${lines.length-1} other exceptions.`]:[];const room=1000-[...header,...tail,footer].join("\n").length-1;selected=[short.length<=room?short:truncateUtf16(short,Math.max(0,room-1))+"…"];}
  const remaining=lines.length-selected.length;
  const text=[...header,...selected,...(remaining?[zh?`另${remaining}项详见该报告原始记录。`:`See this report for ${remaining} other exceptions.`]:[]),footer].join("\n");
  return truncateUtf16(text,1000);
}
