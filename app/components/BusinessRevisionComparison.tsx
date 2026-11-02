"use client";
import type { Language, ProofDelivery, ProofDeliveryVersion } from "@/lib/contracts";
import { compareBusinessRevision, type BusinessRevisionRow, type BusinessRevisionState } from "@/lib/business-revision";
import { businessExpectedLabel } from "./BusinessChecksPanel";
import "../business-revision.css";

const labels: Record<BusinessRevisionState,[string,string]> = {
  now_matches:["本次观察转为符合","Now observed as agreed"],new_mismatch:["本次出现新的不符","New mismatched observation"],still_mismatch:["本次仍与约定不符","Still observed as different"],still_matches:["两版观察均符合","Both observed as agreed"],uncertain:["存在未确定的观察","Uncertainty remains"],no_previous:["旧版缺少可比观察","No comparable earlier observation"],plan_changed:["两版检查标准不同","The comparison plans differ"],
};
const priority: Record<BusinessRevisionState,number> = {new_mismatch:0,still_mismatch:1,uncertain:2,plan_changed:3,no_previous:4,now_matches:5,still_matches:6};
function fingerprint(row:BusinessRevisionRow): string {
  return JSON.stringify([row.step.checkId,row.step.file,row.step.expected,row.step.source,row.state,row.current.status,row.current.status==="observed"?row.current.blocks:row.current.reason,row.previous?.status,row.previous?.status==="observed"?row.previous.blocks:row.previous?.reason]);
}
export function BusinessRevisionComparison({delivery,previousVersion,language}:{delivery:ProofDelivery;previousVersion?:ProofDeliveryVersion;language:Language}) {
  const tr=(zh:string,en:string)=>language==="zh"?zh:en;
  const result=compareBusinessRevision(delivery,previousVersion);
  if (!result.rows.length) return null;
  const groups=new Map<string,{row:BusinessRevisionRow;widths:number[]}>();
  for(const row of result.rows){const key=fingerprint(row);const previous=groups.get(key);if(previous)previous.widths.push(row.step.viewportWidth);else groups.set(key,{row,widths:[row.step.viewportWidth]});}
  const observation=(row:BusinessRevisionRow["current"]|undefined)=>!row?tr("未保存可比的旧版观察","No comparable earlier observation saved"):row.status==="unavailable"?`${tr("无法确定","Uncertain")}: ${row.reason}`:row.blocks.length?row.blocks.join("\n"):tr("未找到相关可见文字；未识别图片文字。","No relevant visible text; image text was not read.");
  return <section className="business-revision" aria-label={tr("业务内容修改对照","Business-content revision comparison")}>
    <h3>{tr("这次具体改了什么","What changed in this revision")}</h3>
    <p>{tr("对照两版保存的业务观察。观察转为符合不等于买家已确认修复、验收或付款。","Compare saved business observations. An observation matching the plan does not verify a fix, accept work or pay.")}</p>
    <ul>{[...groups.values()].sort((a,b)=>priority[a.row.state]-priority[b.row.state]).map(({row,widths})=><li key={`${row.step.checkId}-${widths.join("-")}`} className={`business-revision-${row.state}`}>
      <header><strong>{tr(...labels[row.state])}</strong><span>{row.step.file} · {widths.map(w=>`${w}px`).join(" / ")}</span></header>
      <blockquote>{row.step.source.excerpt}</blockquote>
      <dl><div><dt>{tr("约定","Agreed")}</dt><dd>{businessExpectedLabel(row.step.expected)}</dd></div><div><dt>{tr("旧版实际","Earlier observation")}</dt><dd>{observation(row.previous)}</dd></div><div><dt>{tr("本版实际","Current observation")}</dt><dd>{observation(row.current)}</dd></div></dl>
    </li>)}</ul>
    <details><summary>{tr("查看两版报告引用","Report references")}</summary><p>{tr("旧版","Earlier")}: <code>{result.previousReportId??tr("没有可比报告","No comparable report")}</code></p><p>{tr("本版","Current")}: <code>{result.currentReportId}</code></p></details>
    <small>{tr("客户端上报的静态文字观察；缺失、不同标准或无法确定的记录不会算作改正。","Client-reported static-text observations. Missing, changed-plan or uncertain records never count as a correction.")}</small>
  </section>;
}
