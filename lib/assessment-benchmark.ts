/** A dated synthetic global evaluator experiment, never a customer's acceptance evidence. */
export type AssessmentBenchmarkColumn={compared:number;statusMatches:number;falseAlarms:number;missedDefects:number;unknown:number;referenceSupported?:number;referenceDefects?:number;referenceUnknown?:number;unresolvedDefects?:number};
export type AssessmentBenchmarkSummary={status:"pending"|"recorded"|"incomplete";batchId:string;model?:string;recordedAt?:string;manifestSha256?:string;projects:number;criteria:number;calls?:{completed:number;planned:number;failed:number};accounting?:{stopReason:string;estimatedCostUsd:number;unknownUsageReservedUsd:number};extraOutput?:{rawRisks:number;applicationRisks:number;rawLimitations:number;applicationLimitations:number};raw?:AssessmentBenchmarkColumn;application?:AssessmentBenchmarkColumn;citations?:{checked:number;exact:number};semanticReview?:{reviewer:string;kind:"independent-ai";accepted:number;qualified:number;rejected:number;uncertain:number;total:number};followup?:{projects:number;criteria:number;rawStatusMatches:number;applicationStatusMatches:number;freezeSha256:string;noteZh:string;noteEn:string};counterexamples:{id:string;titleZh:string;titleEn:string;detailZh:string;detailEn:string}[];limitsZh:string[];limitsEn:string[];artifacts?:{labelZh:string;labelEn:string;file:string}[]};
export const ASSESSMENT_BENCHMARK:AssessmentBenchmarkSummary={
  "status": "recorded",
  "batchId": "new-multifile-projects-2026-11-04",
  "model": "deepseek-flash / official catalog DeepSeek-V4.1-Flash-1017",
  "recordedAt": "2026-11-03T22:17:31.031Z",
  "manifestSha256": "54ec0ac3ff1bf61bce55b0df9bf421d43f642ed7e89035861a4aa19d55270d13",
  "projects": 12,
  "criteria": 24,
  "calls": {
    "completed": 12,
    "planned": 12,
    "failed": 0
  },
  "accounting": {
    "stopReason": "all_projects_completed",
    "estimatedCostUsd": 0.0127227,
    "unknownUsageReservedUsd": 0
  },
  "raw": {
    "compared": 24,
    "statusMatches": 24,
    "falseAlarms": 0,
    "missedDefects": 0,
    "unknown": 4,
    "referenceSupported": 14,
    "referenceDefects": 6,
    "referenceUnknown": 4,
    "unresolvedDefects": 0
  },
  "application": {
    "compared": 24,
    "statusMatches": 22,
    "falseAlarms": 0,
    "missedDefects": 0,
    "unknown": 6,
    "referenceSupported": 14,
    "referenceDefects": 6,
    "referenceUnknown": 4,
    "unresolvedDefects": 1
  },
  "citations": {
    "checked": 27,
    "exact": 27
  },
  "semanticReview": {
    "reviewer": "Codex independent source-and-answer reviewer, separate from the corpus author and DeepSeek provider",
    "kind": "independent-ai",
    "accepted": 9,
    "qualified": 3,
    "rejected": 0,
    "uncertain": 0,
    "total": 12
  },
  "extraOutput": {
    "rawRisks": 9,
    "applicationRisks": 9,
    "rawLimitations": 28,
    "applicationLimitations": 53
  },
  "counterexamples": [
    {
      "id": "cross-page-conflicting-copy/manual-2",
      "titleZh": "首轮反例：跨页开门时间矛盾被错误降级",
      "titleEn": "Initial counterexample: conflicting opening time was downgraded",
      "detailZh": "AI 用两条逐字引用正确指出周六 10:00 与 11:00 矛盾；应用因漏识单数 opening time，错误改为证据不足。首轮计数保留这项失分。",
      "detailEn": "Two exact quotations supported the model finding of Saturday 10:00 versus 11:00. The application missed singular opening time and incorrectly forced unknown. The original counts retain this error."
    },
    {
      "id": "tour-refund-copy-equivalent/manual-1",
      "titleZh": "首轮反例：退款政策文案被误当作实际退款",
      "titleEn": "Initial counterexample: refund policy copy was treated as execution",
      "detailZh": "提前四十八小时可全额退款是网页文案要求；AI 正确识别语义等价，应用却因 receive 一词降为未知。原始回答和应用结果均保留。",
      "detailEn": "The requirement asks for policy copy about a full refund at least forty-eight hours before departure. The model correctly recognized equivalent wording; the application forced unknown on receive. Both outputs are retained."
    },
    {
      "id": "image-and-mobile-boundary",
      "titleZh": "边界：图片与手机使用效果仍需实际观察",
      "titleEn": "Boundary: image content and mobile usability require observation",
      "detailZh": "两项判断正确保持未知。独立 AI 审查同时限定了一条 alt 文本风险的措辞：它不能证明图片主体或品牌视觉不符合要求。",
      "detailEn": "Both criteria correctly remained unknown. Independent AI review qualified an alt-text risk title: it cannot establish the actual image subject or brand appearance."
    }
  ],
  "limitsZh": [
    "12 个新编写的合成项目共 39 文件；共享 HTML/CSS 外壳，不是独立客户或跨框架实测。",
    "先冻结语料、请求和 19 个实现/锁文件，再运行真实模型；完整原始输出、应用输出和逐项审查可下载。",
    "首轮原始模型状态 24 项一致不代表整份回答都正确；完整回答为 9 份接受、3 份附条件。",
    "应用首轮两项过度未知保留在原统计；修复回归单独披露，不能合并成新的未见项目准确率。",
    "源码不执行退款、付款或任意后端，不读取图片像素，也不替代真实浏览器或真人使用研究。"
  ],
  "limitsEn": [
    "Twelve newly authored synthetic projects contain 39 files and share HTML/CSS shells; not independent customers or cross-framework trials.",
    "Corpus, requests and 19 implementation/lock files were frozen before real model calls. Complete raw/app outputs and item-level review are downloadable.",
    "Agreement on 24 raw status labels does not make every complete answer correct: 9 answers accepted, 3 qualified.",
    "Two over-conservative application outcomes remain in the original statistics. Development follow-up is disclosed separately and cannot be merged into a new unseen-accuracy score.",
    "Source does not execute refunds, payments or arbitrary backends, inspect image pixels, or replace real browser/human evaluation."
  ],
  "artifacts": [
    {
      "file": "manifest.json",
      "labelZh": "首轮冻结清单",
      "labelEn": "Initial frozen manifest"
    },
    {
      "file": "corpus.json",
      "labelZh": "完整虚构语料与参考",
      "labelEn": "Complete synthetic corpus & references"
    },
    {
      "file": "implementation-source.json",
      "labelZh": "冻结时评估代码",
      "labelEn": "Frozen evaluator source"
    },
    {
      "file": "results.json",
      "labelZh": "完整原始与应用结果",
      "labelEn": "Complete raw & application results"
    },
    {
      "file": "semantic-review.json",
      "labelZh": "逐项语义审查",
      "labelEn": "Item-level semantic review"
    },
    {
      "file": "followup-results.json",
      "labelZh": "单独修复回归结果",
      "labelEn": "Separate development follow-up"
    },
    {
      "file": "followup-manifest.json",
      "labelZh": "修复回归冻结清单",
      "labelEn": "Follow-up frozen manifest"
    },
    {
      "file": "followup-corpus.json",
      "labelZh": "修复回归语料",
      "labelEn": "Follow-up corpus"
    },
    {
      "file": "followup-implementation-source.json",
      "labelZh": "修复回归冻结代码",
      "labelEn": "Follow-up frozen source"
    },
    {
      "file": "followup-semantic-review.json",
      "labelZh": "修复回归语义审查",
      "labelEn": "Follow-up semantic review"
    }
  ],
  "followup": {
    "projects": 4,
    "criteria": 8,
    "rawStatusMatches": 8,
    "applicationStatusMatches": 8,
    "freezeSha256": "bea42b869adeda0d4dbb68b5bc5d5f2bf658ad07d663bcb01fadeabf337a393d",
    "noteZh": "修正开门时间单数识别和显式退款政策文案边界，并用真实退款及混合运行要求作负例。这是针对已知问题的开发回归，首轮数字保留。",
    "noteEn": "Fixes singular opening-time copy and explicit refund-policy wording, with actual-refund and mixed-runtime negative controls. This is development verification of known issues; original counts remain unchanged."
  }
};
