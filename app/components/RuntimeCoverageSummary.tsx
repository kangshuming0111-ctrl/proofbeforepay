"use client";
import type {Language} from "@/lib/contracts";
import type {RuntimeCheckPlan,RuntimeCheckReport} from "@/lib/runtime-checks";
import {runtimeCoverage,runtimeCoverageFamilyName} from "@/lib/runtime-coverage";
import "../runtime-coverage.css";

/** Recorded backend recipe coverage. Nothing here runs checks or accepts work. */
export function RuntimeCoverageSummary({plan,report,pending=false,language}:{plan:RuntimeCheckPlan;report?:RuntimeCheckReport;pending?:boolean;language:Language}){
  const tr=(zh:string,en:string)=>language==="zh"?zh:en,coverage=runtimeCoverage(plan,report,pending);
  const totals=coverage.groups.reduce((sum,group)=>({observed:sum.observed+(group.observed??0),mismatched:sum.mismatched+(group.mismatched??0),unavailable:sum.unavailable+(group.unavailable??0)}),{observed:0,mismatched:0,unavailable:0});
  const status=coverage.state==="recorded"?tr(`观测 ${totals.observed} · 不符 ${totals.mismatched} · 未确定 ${totals.unavailable}`,`Observed ${totals.observed} · Mismatched ${totals.mismatched} · Unavailable ${totals.unavailable}`):coverage.state==="pending"?tr("本次未完成","Run incomplete"):coverage.state==="not_run"?tr("尚未运行","Not run"):tr("当前记录无法核对","Current record unavailable");
  return <details className="runtime-coverage-summary">
    <summary><strong>{tr(`后端检查范围 · 计划 ${coverage.planned} 步`,`Backend check scope · ${coverage.planned} planned steps`)}</strong><span>{status}</span></summary>
    <p>{coverage.state==="recorded"?tr("按约定步骤分组统计保存的结果；数量不是网站功能覆盖率。","Saved outcomes grouped by the agreed steps; counts are not website coverage percentages."):coverage.state==="pending"?tr("本次尚未完成，下方只显示计划；未借用先前报告的结果。","This run is incomplete. Only the plan is shown; earlier report results are not substituted."):tr("下方是约定的检验计划；没有观测不等于没有问题。","This is the agreed check plan. Missing observations do not mean there are no issues.")}</p>
    <dl>{coverage.groups.map(group=><div key={group.id}><dt>{runtimeCoverageFamilyName(group.id,language)}<small>{tr(`计划 ${group.planned}`,`${group.planned} planned`)}</small></dt><dd>{coverage.state==="recorded"?<><span>{tr("观测支持","Observed")} <b>{group.observed}</b></span><span>{tr("不符","Mismatched")} <b>{group.mismatched}</b></span><span>{tr("未确定","Unavailable")} <b>{group.unavailable}</b></span></>:<span>{tr("结果 —","Results —")}</span>}</dd></div>)}</dl>
    <p>{tr("仅涵盖当前预约HTTP协议；不检查任意脚本、真实邮件、全站安全或所有业务流程，不自动验收或付款。","Covers this booking HTTP recipe only, not arbitrary scripts, real email, site-wide security or every business flow. No automatic acceptance or payment.")}</p>
  </details>;
}
