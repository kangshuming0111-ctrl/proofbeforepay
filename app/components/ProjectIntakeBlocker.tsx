"use client";

import type {Language} from "@/lib/contracts";
import type {ProjectIntakeBlocker as Blocker} from "@/lib/project-intake-blocker";
import "../project-intake-blocker.css";

const copy: Record<Blocker["kind"], {zh: [string, string]; en: [string, string]}> = {
  source: {zh: ["先调整原始需求，再逐条确认。", "返回网站需求"], en: ["Adjust the original requirements before confirming each row.", "Return to requirements"]},
  pending: {zh: ["还有一条要求待澄清。请先决定纳入或明确排除。", "处理这条要求"], en: ["A requirement needs clarification. Include it or explicitly exclude it first.", "Review this requirement"]},
  exclusion: {zh: ["为排除的要求填写理由，才能继续确认范围。", "填写排除理由"], en: ["Give a reason for the excluded requirement before confirming the scope.", "Add the exclusion reason"]},
  coverage: {zh: ["核对每条原文后，还需要明确确认本次范围。", "确认原始需求范围"], en: ["After reviewing each original row, explicitly confirm this scope.", "Confirm the original scope"]},
  requirements: {zh: ["已采用的整理建议还需要你核对原文和最终清单。", "核对整理后的清单"], en: ["The adopted suggestions still need your review of the source and final checklist.", "Review the adopted checklist"]},
  "business-edit": {zh: ["已选择业务内容检查。请补齐来源、页面和预期内容。", "补充业务内容检查"], en: ["Business content checks are selected. Complete their sources, pages and expected values.", "Complete the content checks"]},
  "business-confirm": {zh: ["业务内容检查已填好，还需要单独确认。", "确认业务内容检查"], en: ["The business content checks are filled in and need separate confirmation.", "Confirm the content checks"]},
  "runtime-edit": {zh: ["已选择后端检查。请核对协议及其对应原始要求。", "核对后端检查设置"], en: ["Backend checks are selected. Review the protocol and its original requirements.", "Review the backend setup"]},
  "runtime-confirm": {zh: ["后端协议已准备好，还需要单独确认纳入本次验收。", "确认后端检查协议"], en: ["The backend protocol is prepared and needs separate confirmation for this scope.", "Confirm the backend protocol"]},
};

export function ProjectIntakeBlocker({blocker, language, disabled, onGo}: {blocker: Blocker | null; language: Language; disabled: boolean; onGo: (blocker: Blocker) => void}) {
  if (!blocker) return null;
  const [message, action] = copy[blocker.kind][language];
  return <div className="project-intake-blocker">
    <p id="project-intake-blocker-message" role="status" aria-live="polite">{message}</p>
    <button type="button" className="text-button" disabled={disabled} aria-describedby="project-intake-blocker-message" onClick={() => onGo(blocker)}>{action}</button>
  </div>;
}
