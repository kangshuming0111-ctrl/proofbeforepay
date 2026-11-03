import {diagnoseModelReport,type ModelDiagnosticText,type ModelDiagnosis} from "./model-diagnostics.ts";
import {generateModelTrace,validateStoredModelCheckReport,type ModelCheckExpected,type ModelCheckReport,type ModelOperationId} from "./model-checks.ts";
export type ModelDiagnosticComparison={state:"comparable"|"different_inputs"|"incomplete"|"not_distinct_versions";before:ModelDiagnosis;after:ModelDiagnosis;message:ModelDiagnosticText;rows:{id:string;title:ModelDiagnosticText;before:ModelDiagnosticText;after:ModelDiagnosticText;state:"still_observed"|"not_reproduced"|"needs_review";operationIds:ModelOperationId[]}[]};
const text=(zh:string,en:string)=>({zh,en});
const limit=text("这是同等输入下两轮有限实验的对照。新一轮未重现不等于修复已获证明，也不覆盖所有内部并发时序。","This compares two finite experiments with equivalent inputs. Non-reproduction is not proof of a repair and does not cover all internal interleavings.");
function currentFact(id:string,report:ModelCheckReport):ModelDiagnosticText{
 const body=(operationId:ModelOperationId)=>report.trace.find(row=>row.operationId===operationId)?.body as Record<string,unknown>|undefined;
 if(id==="original_booking_status")return text("当前原预约收据为有效，商家读回与之吻合。","The current original-booking receipt is active and agrees with merchant readback.");
 if(id==="cancelled_booking_status"||id==="cancel_response")return text("当前取消对象的收据和商家记录均为已取消。","The current cancellation receipt and merchant record both show cancelled.");
 if(id==="merchant_records")return text("当前商家记录保留三笔唯一预约，与收据一致。","Current merchant records retain three unique bookings and agree with receipts.");
 if(id==="receipt_merchant_agreement")return text("本轮三笔收据与商家记录符合相同合法状态。","All three receipts and merchant records match the same legal state in this run.");
 if(id==="unrelated_booking_preserved")return text("当前未参与操作的预约保持原有身份、人数、时段与有效状态。","The untouched booking retains its original identity, party size, slot and active status.");
 if(id.startsWith("occupancy_")){const p=generateModelTrace(report.seed),role=id.slice("occupancy_".length)as "source"|"target"|"spare",alias=p[role],row=alias?body(`final_${alias}`):undefined;if(row&&Number.isInteger(row.guestCount))return text(`当前对应时段读回 ${row.guestCount} 人，预约集合与本轮合法状态吻合。`,`The current slot readback is ${row.guestCount} guests, with membership matching this run's legal state.`);}
 if(id==="move_response"){const status=report.trace.find(row=>row.operationId==="transfer_x")?.status;return text(`当前改期响应 HTTP ${status}，与原单、商家及人数读回共同符合一种合法顺序。`,`The current move response HTTP${status}, original booking, merchant records and occupancy match one legal order together.`);}
 return text("本轮响应、三笔预约与三个时段共同符合一种合法执行顺序。","This run's responses, three bookings and three occupancies match one legal execution order together.");
}
/** Comparison never edits a report or promotes non-reproduction to a fix. */
export function compareModelReports(previous:unknown,current:unknown,expected:{previous:ModelCheckExpected;current:ModelCheckExpected}):ModelDiagnosticComparison{
 const beforeReport=validateStoredModelCheckReport(previous,expected.previous),afterReport=validateStoredModelCheckReport(current,expected.current),before=diagnoseModelReport(beforeReport,expected.previous),after=diagnoseModelReport(afterReport,expected.current);
 const base={before,after,rows:[]};
 if(beforeReport.registration.projectId!==afterReport.registration.projectId||beforeReport.id===afterReport.id||beforeReport.deliveryId===afterReport.deliveryId||Date.parse(afterReport.startedAt)<Date.parse(beforeReport.finishedAt))return{...base,state:"not_distinct_versions",message:text("需要同一项目按时间先后保存的两个不同交付版本报告；未借用当前报告充当旧结果。","Two chronologically ordered reports from distinct deliveries of the same project are required. The current report is not reused as historical evidence.")};
 const a=generateModelTrace(beforeReport.seed),b=generateModelTrace(afterReport.seed);
 if(beforeReport.modelSpecDigest!==afterReport.modelSpecDigest||beforeReport.journeyPlanDigest!==afterReport.journeyPlanDigest||a.p!==b.p||a.source!==b.source||a.target!==b.target||a.spare!==b.spare)return{...base,state:"different_inputs",message:text("两版实验的人数、时段排列或模型约定不同，不能用结果变化证明这次修改解决了原问题。","Party size, slot permutation or model agreement differs. Changed results cannot establish that this revision addressed the earlier issue.")};
 if(before.outcome==="inconclusive"||after.outcome==="inconclusive")return{...base,state:"incomplete",message:text("至少一版仍有未知结果，不能确认问题消失。请先查看缺失的证据。","At least one version remains inconclusive. A problem's disappearance cannot be established; inspect missing evidence first.")};
 const old=before.findings.filter(row=>row.severity==="issue"),rows=old.map(row=>{const again=after.findings.find(item=>item.id===row.id&&item.severity==="issue");return{id:row.id,title:row.title,before:row.actual,after:again?.actual??(after.outcome==="compatible"?currentFact(row.id,afterReport):text("本轮仍有其他不一致；仅因这一项没有列出，不能确认它已修复。","This run still has other inconsistencies. An omitted finding alone does not establish a fix.")),state:again?"still_observed"as const:after.outcome==="compatible"?"not_reproduced"as const:"needs_review"as const,operationIds:row.operationIds};});
 return{before,after,rows,state:"comparable",message:limit};
}
