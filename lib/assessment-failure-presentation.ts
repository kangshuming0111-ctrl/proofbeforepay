import type {Language} from "./contracts.ts";
import {AssessmentResponseError,type AssessmentFailureReason} from "./assessment-response.ts";

/** Only local enumerations and already validated checklist IDs reach the API.
 * A coverage count is not a claim that any returned citation/answer was valid. */
export function assessmentFailureResponse(error: AssessmentResponseError, language: Language) {
  const zh = language === "zh", c = error.coverage;
  const list = (ids: readonly string[]) => ids.slice(0, 3).join(", ") + (ids.length > 3 ? " …" : "");
  const messages: Record<AssessmentFailureReason,string> = {
    structure: zh ? "AI 回复格式不符合要求，未保存为评估报告。" : "The AI response has an invalid structure and was not saved as an assessment.",
    output_limit: zh ? "AI 回复达到输出上限，报告未完成，未保存。" : "The AI response reached its output limit; the incomplete report was not saved.",
    incomplete: zh ? "AI 回复没有正常完成，未保存为评估报告。" : "The AI response did not complete normally and was not saved as an assessment.",
    citation: zh ? "AI 的源码引用未通过核对，未保存为评估报告。" : "An AI source citation could not be verified; the report was not saved.",
    missing_items: zh ? `AI 漏答 ${c?.missingCriterionIds.length ?? ""} 项要求${c ? `（${list(c.missingCriterionIds)}）` : ""}，整份回复未保存为完整报告。` : `AI omitted ${c?.missingCriterionIds.length ?? "one or more"} requirements${c ? ` (${list(c.missingCriterionIds)})` : ""}; the response was not saved as a complete report.`,
    duplicate_items: zh ? `AI 重复回答了清单项目${c ? `（${list(c.duplicateCriterionIds)}）` : ""}，未保存为评估报告。` : `AI repeated checklist items${c ? ` (${list(c.duplicateCriterionIds)})` : ""}; the report was not saved.`,
    unknown_items: zh ? "AI 回答了清单以外的项目，未保存为评估报告。" : "AI answered items outside the confirmed checklist; the report was not saved.",
    risk_fields: zh ? "AI 的风险条目缺少或含有无效的标题、说明、建议或引用字段，整份回复未保存为评估报告。" : "An AI risk entry has missing or invalid title, explanation, suggestion or citation fields; the complete response was not saved as an assessment.",
  };
  return {error: `${messages[error.reason]} ${zh ? "这不是交付不合格的结论；已有规则结果和买家决定保持不变。重新运行会另发一次请求，不会自动重试。" : "This is not a delivery-failure verdict. Existing rules and buyer decisions are unchanged. Running again sends a new request; there is no automatic retry."}`,
    assessmentFailure: {reason: error.reason, ...(c ? {coverage: c} : {})}};
}
