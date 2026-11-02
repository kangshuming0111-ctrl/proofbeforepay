"use client";

import { ArrowRight, MessageSquarePlus } from "lucide-react";
import type { Language, ProofDelivery, ProofDeliveryVersion } from "@/lib/contracts";
import { businessSpotlight, businessSpotlightFeedback, type BusinessSpotlightGroup } from "@/lib/business-spotlight";
import { businessExpectedLabel } from "./BusinessChecksPanel";
import "../business-spotlight.css";

export type BusinessSpotlightProps = {
  delivery: ProofDelivery;
  previousVersion?: ProofDeliveryVersion;
  language: Language;
  busy?: boolean;
  onInspect: () => void;
  onPrepareFeedback?: (input: {deliveryId: string; criterionId: string; comment: string}) => void;
};

/** The short form stays bounded; every exact source and supplied text block is
 * available through an explicit disclosure, rather than a truncated tooltip. */
function Excerpt({text, label, limit=115}: {text: string; label: string; limit?: number}) {
  const chars = Array.from(text);
  if (chars.length <= limit) return <span className="business-spotlight-excerpt">{text}</span>;
  return <details className="business-spotlight-excerpt-details"><summary>{chars.slice(0,limit).join("")}…<span>{label}</span></summary><pre>{text}</pre></details>;
}

export function BusinessSpotlight({delivery,previousVersion,language,busy=false,onInspect,onPrepareFeedback}: BusinessSpotlightProps) {
  const tr = (zh: string,en: string) => language === "zh" ? zh : en;
  const data = businessSpotlight(delivery,previousVersion);
  if (!data) return null;
  const label = (group: BusinessSpotlightGroup) => group.row.current.outcome === "mismatch" ? tr("当前观察与约定不符","Current observation differs")
    : group.row.current.outcome === "unavailable" ? tr("当前仍无法确定","Current observation uncertain")
    : group.row.state === "plan_changed" ? tr("两版检查标准不同","Comparison plans differ")
    : group.row.state === "uncertain" ? tr("旧版观察无法确定","Earlier observation uncertain")
    : group.row.state === "now_matches" ? tr("本次观察转为符合","Now observed as agreed")
    : tr("本次观察符合约定","Observed as agreed");
  const observation = (group: BusinessSpotlightGroup, earlier=false) => {
    const reading = earlier ? group.row.previous : group.row.current;
    return reading?.status === "observed" ? reading.blocks.join("\n") || tr("未找到相关可见文字，未识别图片文字。","No relevant visible text; image text was not read.")
      : tr("本次未获得可用的文字观察，请查看完整报告。","No usable text observation; inspect the full report.");
  };
  return <section className="business-spotlight" aria-label={tr("约定与交付直接对照","Agreement and delivery at a glance")}>
    <header className="business-spotlight-heading"><h4>{tr("约定与交付，直接对照","Agreement and delivery, side by side")}</h4><span>{tr(`${data.checkCount} 项内容 · ${data.observations} 次宽度观察`,`${data.checkCount} checks · ${data.observations} width observations`)}</span></header>
    <ul>{data.groups.slice(0,2).map(group => <li key={`${group.row.step.checkId}-${group.widths.join("-")}`} className={`business-spotlight-${group.row.current.outcome}`}>
      <header><strong>{label(group)}</strong><span>{group.row.step.file} · {group.widths.map(width=>`${width}px`).join(" / ")}</span></header>
      <div className="business-spotlight-source"><span>{tr("原始要求","Original requirement")}</span><Excerpt text={group.row.step.source.excerpt} label={tr("展开原文","Expand original")}/></div>
      <dl className={group.previousComparable ? "has-earlier" : ""}>
        <div><dt>{tr("约定","Agreed")}</dt><dd><Excerpt text={businessExpectedLabel(group.row.step.expected)} label={tr("展开全文","Expand full text")}/></dd></div>
        {group.previousComparable && <div><dt>{tr("旧版观察","Earlier observation")}</dt><dd><Excerpt text={observation(group,true)} label={tr("展开全文","Expand full text")}/></dd></div>}
        <div><dt>{tr("本版观察","Current observation")}</dt><dd><Excerpt text={observation(group)} label={tr("展开全文","Expand full text")}/></dd></div>
      </dl>
      {group.row.state === "plan_changed" && <p className="business-spotlight-context">{tr("标准已变化，不用旧版读数推断已修复。","The plan changed; earlier readings cannot establish a correction.")}</p>}
      {onPrepareFeedback && group.row.current.outcome !== "expected_observation" && <button type="button" className="business-spotlight-feedback" disabled={busy} onClick={()=>onPrepareFeedback(businessSpotlightFeedback(delivery.id,group,language))}><MessageSquarePlus size={12} aria-hidden="true"/>{tr("起草修改意见","Draft change request")}</button>}
    </li>)}</ul>
    <footer><p>{tr("客户端文字观察；符合不等于已修复或已验收，付款仍需单独确认。","Client text observations; a match does not verify a fix or accept work. Payment needs separate confirmation.")}</p><button type="button" disabled={busy} onClick={onInspect}>{tr("查看完整业务报告","Inspect full business report")}<ArrowRight size={12} aria-hidden="true"/></button></footer>
  </section>;
}
