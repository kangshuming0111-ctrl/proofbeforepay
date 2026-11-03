"use client";
import type {Language,ProofQuote,ProofRole} from "@/lib/contracts";
import {proofReadiness} from "@/lib/proof-readiness";
export function ProofReadinessPanel({quote,role,language}:{quote:ProofQuote;role:ProofRole;language:Language}){
 const tr=(zh:string,en:string)=>language==="zh"?zh:en,ready=proofReadiness(quote,role);
 const label:Record<string,string>={checks_running:tr("检查仍在进行，先结束或关闭当前运行。","Checks are running. Finish or close the run first."),delivery_missing:tr("等待卖家提交交付文件。","Wait for the seller’s delivery files."),review_missing:tr("先核查当前交付。","Review this delivery first."),requirements_failed:tr("先修复未满足的要求。","Repair unmet requirements first."),acceptance_required:tr("买家先明确接受交付，再单独处理测试付款。","The buyer accepts delivery before separately authorizing test payment."),frozen_evidence_inconsistent:tr("验收依据关联不完整，不能开始新扣款。","Frozen acceptance references are incomplete. A new capture is unavailable."),authorization_window_ended:tr("本地测试操作时限已到，保留原记录核对结果。","The local test window ended. Retain the original record for reconciliation."),buyer_action_required:tr("验收和付款须由买家操作。","The buyer controls acceptance and payment.")};
 return <details className="readiness-panel"><summary>{tr("本版验收与付款前提","Delivery and payment prerequisites")}</summary>
  <p>{tr("当前交付：","Current delivery: ")}<code>{ready.deliveryId??tr("尚无","None")}</code></p>
  {ready.blockers.length>0&&<ul>{[...new Set(ready.blockers.map(row=>row.code))].map(code=><li key={code}>{label[code]??code}</li>)}</ul>}
  <p>{tr("需要人工核对的原始要求：","Original requirements needing human review: ")}{ready.manualItems.length}</p>
  <ul>{ready.manualItems.map(row=><li key={row.criterionId}>{row.title} · {row.confirmationRecorded?tr("已有明确验收记录","Explicit acceptance recorded"):tr("由买家阅读并确认","Buyer review and consent required")}</li>)}</ul>
  {ready.frozenAcceptance&&<><p>{tr("已冻结验收快照：","Frozen acceptance snapshot: ")}<code>{ready.frozenAcceptance.snapshotId}</code></p><p>{ready.supplementalDifferences.length?tr(`另有 ${ready.supplementalDifferences.length} 类补充报告。测试扣款仍依据原验收快照，不会改成新报告。`,`${ready.supplementalDifferences.length} report types have supplements. Test capture retains the original accepted snapshot.`):tr("当前报告与验收快照的引用一致。","Current report references match the accepted snapshot.")}</p></>}
  <p>{ready.paymentMode==="sandbox"?tr("PayPal Sandbox · 仅测试资金","PayPal Sandbox · Test funds only"):tr("Demo · 本地模拟付款","Demo · Simulated payment")}{" · "}{ready.payment.state}</p>
  {ready.payment.pendingOperation&&<p>{tr("原操作结果尚待核实：","Original operation awaiting verification: ")}{ready.payment.pendingOperation}{tr("。请使用原操作重试或明确查询，不要重新验收另一份证据。",". Retry or explicitly reconcile that operation; do not accept another evidence set.")}</p>}
  <small>{tr("这份清单只读取已保存状态，不调用 PayPal、不自动确认、不证明卖家已结算。","This checklist reads saved state. It does not query PayPal, confirm decisions or establish seller settlement.")}</small>
 </details>;
}
