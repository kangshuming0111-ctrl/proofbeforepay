import type { Language, ProofCriterion } from "./contracts.ts";
import {exactCopyLiteral} from "./exact-copy-directive.ts";
import {isSourceLiteralDirectiveCandidate, sourceLiteralDirective} from "./source-literal-directive.ts";
import {isStaticMarkupDirectiveCandidate, staticMarkupDirective, withoutWorkingTimeUnits} from "./static-markup-directive.ts";
import {assertStaticPath} from "./static-resources.ts";

/** Source-only admission guard, not an entailment checker or execution result. */
export type AssessmentEvidenceScope = {
  category: "source_text" | "requires_observation";
  reason: "literal_content" | "explicit_policy_copy" | "other_source_rule" | "mobile" | "financial_action" | "durable_record" | "runtime_or_subjective" | "unclassified_requirement";
};

// A literal-content allowance is deliberately narrower than the set of things
// a model might infer from source. Unknown manual requirements stay unverified.
const SOURCE_CONTENT = /营业(?:时间|时段)|营业日|开放时间|菜单|菜品|价格|价目|标价|地址|电话|联系方式|店名|商店名称|餐厅名称|公司名称|企业名称|文案|文字内容|文字(?:必须|须|应)(?:说明|写明|注明)|文本内容|\b(?:(?:opening|business)[ -](?:hours|times?)|hours\s+of\s+operation|menu|dishes|prices?|pricing|price\s+list|address|phone(?:\s+number)?|telephone|contact\s+(?:number|details)|(?:business|shop|store|restaurant|company|brand)\s+name|copy|copywriting|(?:HTML\s+title|page|website|text)\s+content)\b/iu;
// Explicit wording directives can name their subject without using the literal
// token "content" or "营业时间". These only identify text-content evidence;
// observation and financial-action vetoes below still take precedence.
const PUBLISHED_POLICY_TEXT = /\b(?:published|page|website|cancellation)\s+policy\s+(?:text|copy|wording)\b/iu;
// A complete Chinese wording directive, not a general exemption for policies.
// This only admits source review. Financial/record/runtime vetoes below still
// run first; adding a second obligation cannot inherit this finite allowance.
const ZH_CANCELLATION_WORDING = /^(?:页面|网站)(?:取消|退订)政策(?:文案|文字)?(?:必须|须|应)(?:写明|说明|注明)[：:]\s*(?:活动开始前|课程开始前|开课前)至少(?:[1-9]\d{0,2}|[一二三四五六七八九十百]{1,5})(?:天|小时)取消(?:可以|可)全额退还(?:订金|定金)[。.]?$/u;
const DISPLAYED_BUSINESS_HOURS = /(?:应|须|必须|需要|需)(?:显示|注明|写明|列出)[^。；\n]{0,120}(?:营业|休息|开门|关门)/u;
const OBSERVATION_REQUIRED = /手机|移动端|响应式|视觉|美观|好看|易用|用户体验|交互|表单|提交|按钮|点击|导航|功能|后台|数据库|预约|预订|登录|注册|搜索|支付|购物车|发送|收件|保存|储存|加载|性能|实时|动态|权限|身份验证|运行|配色|排版|布局|样式|风格|审美|品牌(?:形象|调性|设计)|符合[^。；\n]*品牌|\b(?:responsive|mobile|visual|aesthetic|beautiful|attractive|subjective|user[- ]experience|usability|interactive|interactivity|interaction|forms?|submi(?:t|ts|tted|tting|ssion|ssions)|end[- ]to[- ]end|click(?:able|s|ing)?|navigation|nav\s+interactivity|function(?:al|ality)?|works?|working|backend|database|bookings?|reservations?|log[- ]?in|sign[- ]?up|search(?:able|ing|es)?|payment|checkout|cart|send(?:s|ing)?|receiv(?:e[ds]?|ing)|persist(?:s|ed|ing|ence)?|sav(?:e[ds]?|ing)|load(?:s|ed|ing)?|hover|toggle|animate|animation|accordion|filter|sort|upload|download|performance|real[- ]time|dynamic|authentication|authori[sz]ation|colou?rs?|layout|styling|styles?|design|looks?|feel|modern|elegant|professional|accessibility|accessible|branding|brand(?!\s+name))\b/iu;
const BOOKING_TERMS = /预约|预订|\b(?:bookings?|reservations?)\b/giu;
// Only an explicit wording instruction can scope these otherwise operational
// nouns to copy. Mentioning "copy" elsewhere in a compound requirement cannot.
const POLICY_COPY_DIRECTIVE = /^(?:(?:网页|页面|网站)(?:上(?:的)?)?)?(?:(?:咨询|预约|预订)(?:政策)?)?(?:文案|文字(?:内容)?|文本(?:内容)?)(?:中)?(?:必须|须|需要|需|应当|应|要)(?:清楚|清晰|明确)?(?:说明|写明|注明|标明|包含|写上|显示|标注)|^(?:(?:the|our)\s+)?(?:(?:page|website|site)\s+)?(?:(?:booking|reservation|consultation|appointment)(?:\s+policy)?\s+)?(?:copy|copywriting|text(?:\s+content)?|content)\s+(?:must|should|needs?\s+to)\s+(?:clearly\s+)?(?:state|say|explain|include|show|display|specify|mention|read)\b/iu;
const POLICY_COPY_TITLE = /^(?:(?:咨询|到店|预约|预订)(?:的)?)?(?:(?:政策|规则|说明)(?:的)?)?(?:文案|文字|文本|政策|规则|说明)(?:内容)?$|^(?:(?:consultation|appointment|booking|reservation)s?\s+)?(?:(?:policy|policies)\s+)?(?:copy|text|wording|notice|instructions?|policy|policies)$/iu;
const BOOKING_ACTION_OR_CAPABILITY = /能力|\b(?:book(?:s|ed)?|reserv(?:e|es|ed|ing)|capable|capabilit(?:y|ies)|abilit(?:y|ies))\b/iu;
// This is a bounded allowance for one advance-arrangement policy statement,
// optionally followed by a no-walk-ins clause. It is not a general language
// parser: additional assertions and unfamiliar wording remain unverified.
const ADVANCE_POLICY_COPY = /^(?:(?:所有|全部)?(?:咨询|到店咨询|咨询服务|服务)(?:均|都)?(?:须|需|需要|必须|应)(?:提前|事先)(?:预约|预订)(?:[，,；;]\s*(?:不接受临时到店|不接受未经预约的到访))?|(?:(?:all\s+)?consultations?\s+(?:requires?|needs?)\s+(?:advance|prior)\s+(?:bookings?|reservations?|arrangement)|(?:advance\s+)?bookings?\s+(?:is|are)\s+required(?:\s+in\s+advance)?|reservations?\s+(?:must\s+be\s+arranged|are\s+required)\s+in\s+advance)(?:\s*(?:[;,]|\band\b)\s*walk[- ]ins?\s+(?:are\s+)?not\s+accepted)?)$/iu;

// Another bounded text-only policy family. The entire body must match, so a
// second capability/action clause cannot borrow the policy-copy allowance.
const APPOINTMENT_POLICY_PARAPHRASE = /^(?:consultations?\s+must\s+be\s+arranged\s+(?:beforehand|in\s+advance)(?:\s*[.;]\s*visitors?\s+without\s+an?\s+appointment\s+cannot\s+be\s+accommodated)?|(?:所有|全部)?咨询(?:均|都)?(?:须|需|需要|必须)(?:提前|事先)安排(?:[，,；;。]\s*不接待未(?:预约|约定时间)的访客)?)$/iu;

function isExplicitBookingPolicyCopy(criterion: ProofCriterion): boolean {
  const source = criterion.source.trim(), title = criterion.title.trim();
  const directive = POLICY_COPY_DIRECTIVE.exec(source);
  if (!directive || BOOKING_ACTION_OR_CAPABILITY.test(`${title}\n${source}`)) return false;
  const body = source.slice(directive[0].length).trim().replace(/^[：:\s"'“‘]+/u, "").replace(/[。.!?！？"'”’\s]+$/u, "");
  if (!ADVANCE_POLICY_COPY.test(body) && !APPOINTMENT_POLICY_PARAPHRASE.test(body)) return false;
  const sourceWithoutBooking = source.replace(BOOKING_TERMS, ""), titleWithoutBooking = title.replace(BOOKING_TERMS, "");
  // A runtime title still vetoes a text-only source. An ambiguous booking title
  // must itself identify a policy/copy requirement rather than a capability.
  if (titleWithoutBooking !== title && !POLICY_COPY_TITLE.test(title)) return false;
  return (sourceWithoutBooking !== source || titleWithoutBooking !== title || POLICY_COPY_TITLE.test(title))
    && !OBSERVATION_REQUIRED.test(`${titleWithoutBooking}\n${sourceWithoutBooking}`);
}

// A narrow wording-only allowance for cancellation eligibility. Here "receive"
// describes what the page must say, not an observed refund. The complete body
// must match: adding payment execution, another runtime clause or unfamiliar
// wording cannot inherit this exemption. The model still has to ground its
// verdict in exact citations; this classifier does not establish the policy.
const REFUND_POLICY_COPY = /^cancellations?\s+(?:made\s+)?at\s+least\s+[1-9]\d{0,3}\s+(?:hours?|days?)\s+before\s+departure\s+receive\s+a\s+full\s+refund$/iu;
// Explicit money-moving actions take precedence even if another clause says
// "copy". This is deliberately an action vocabulary, not a blanket ban on the
// words refund/退款 in ordinary policy text. It is a conservative boundary,
// not a complete natural-language parser or a financial execution check.
const FINANCIAL_ACTION = /\b(?:(?:issu(?:e[sd]?|ing)|process(?:es|ed|ing)?|execut(?:e[sd]?|ing)|initiat(?:e[sd]?|ing)|trigger(?:s|ed|ing)?|settl(?:e[sd]?|ing)|disburs(?:e[sd]?|ing))\s+(?:(?:a|an|the|full|partial|automatic|real|actual|successful|customer|payment)\s+){0,4}refunds?|refund(?:s|ed|ing)?\s+(?:the|an?|original|customer'?s?)\s+(?:card|payment|money|funds|account)|(?:actually|automatically|successfully)\s+(?:(?:issue|process|execute|initiate|trigger|settle|disburse|complete|perform|make)\s+)?(?:(?:a|an|the|full|partial|real|actual)\s+){0,4}(?:refunds?|charges?|captures?|payments?)|refunds?\s+(?:are\s+|must\s+be\s+)?(?:issued|processed|executed|initiated|triggered|settled|disbursed)\s+(?:actually|automatically|successfully))\b|(?:实际|自动|真实)(?:地)?(?:进行|发起|执行|处理|完成)?(?:退款|扣款|支付)|(?:发起|执行|处理|完成)(?:实际|自动|真实)?(?:退款|扣款|支付)/iu;
// Further explicit operation families reproduced with controlled overclaims.
// These bounded verb/object relationships are not a general semantic parser or
// a ban on a product name, payment column heading or exact quoted wording.
const CARD_DEBIT_ACTION = /\b(?:(?:deduct|debit)(?:s|ed|ing)?|withdraw(?:s|ing)?|withdrew|withdrawn)\s+(?:(?:the|a|an|actual|real)\s+){0,3}(?:fees?|amounts?|money|funds?|charges?)\s+from\s+(?:(?:the|a|an|original|customer['’]s)\s+){0,3}(?:card|account|balance)\b|\bdebit(?:s|ed|ing)?\s+(?:(?:the|a|an|original|customer['’]s)\s+){0,3}card\s+for\s+(?:(?:the|a|an)\s+)?fee\b/iu;
const EMAIL_DELIVERY_ACTION = /\bguarantee(?:s|d|ing)?\s+(?:(?:real|actual|successful)\s+)?(?:email\s+delivery|delivery\s+of\s+(?:(?:real|actual|successful|notification|confirmation)\s+){0,3}emails?)\b/iu;
function isExplicitRefundPolicyCopy(criterion: ProofCriterion): boolean {
  const directive = POLICY_COPY_DIRECTIVE.exec(criterion.source.trim());
  if (!directive || OBSERVATION_REQUIRED.test(criterion.title)) return false;
  const body = criterion.source.trim().slice(directive[0].length).trim().replace(/^[：:\s"'“‘]+/u, "").replace(/[。.!?！？"'”’\s]+$/u, "");
  return REFUND_POLICY_COPY.test(body);
}

// These unambiguous record capabilities need state/readback evidence even when
// another part of the requirement mentions receipt "copy" or page content.
// This remains conservative bounded language, not a complete semantic parser.
const RECORD_ACTION = /\b(?:record(?:s|ed|ing)?|archiv(?:e[sd]?|ing)|log(?:s|ged|ging)?|stor(?:e[sd]?|ing)|retain(?:s|ed|ing)?|writ(?:e[sd]?|ing)|queue(?:s|d|ing)?)\b[^.。；;\n]{0,180}\b(?:enquir(?:y|ies)|inquir(?:y|ies)|requests?|receipts?|records?|submissions?|transactions?|customer\s+data|audit\s+trail)\b|\b(?:enquir(?:y|ies)|inquir(?:y|ies)|requests?|receipts?|records?|submissions?|transactions?|audit\s+trail)\b[^.。；;\n]{0,120}\b(?:durab(?:le|ly|ility)|archived|logged|stored|retained|queryable|retrievable|persistently|permanently)\b|(?:询价|咨询|请求|回执|记录|交易|提交内容)[^。；;\n]{0,80}(?:落库|持久|留存|入库|可查询|可检索|重启后保留)|(?:落库|持久保存|持久记录|持久存储|留存|入库|归档|记录|存储)[^。；;\n]{0,80}(?:询价|咨询请求|回执|交易|提交内容)|\b(?:receipts?|records?|audit\s+trail)\b[^.。；;\n]{0,120}\b(?:after\s+(?:a\s+|the\s+)?(?:server\s+)?restart|survive\s+(?:a\s+)?restart)\b/iu;
const CUSTOMER_DATA_REBOOT = /\bcustomer\s+data\s+(?:(?:must|should|shall|will)\s+)?surviv(?:e[sd]?|ing)\s+(?:(?:a|the)\s+)?(?:server\s+)?(?:reboot|restart)\b/iu;

type StaticRelationDescriptor = {identity: string; files: string[]} & (
  {kind: "label_for_id"; labels: string[]}
  | {kind: "input_type"; label: string; inputType: string; ratherThan?: string}
  | {kind: "radio_group"; labels: string[]; values: string[]; name: string}
);
const RELATION_LABEL = "[A-Z][A-Za-z0-9_-]{0,39}(?: [a-z][A-Za-z0-9_-]{0,39}){0,3}";
const RELATION_OPERATION = /\b(?:and|or|then|also|after|before|when|while|must|shall|should|will|can|could|actual|actually|automatically|click(?:s|ed|ing)?|save|store|reload|submit|send|visible|visually|secure|security|persist|record)\b/iu;
const INPUT_TYPES = new Set(["button", "checkbox", "color", "date", "datetime-local", "email", "file", "hidden", "image", "month", "number", "password", "radio", "range", "reset", "search", "submit", "tel", "text", "time", "url", "week"]);

function relationFile(value: string): string | undefined {
  try {const file = assertStaticPath(value); return file.endsWith(".html") ? file : undefined;} catch {return;}
}
function relationLabel(value: string): boolean {
  return new RegExp(`^${RELATION_LABEL}$`, "u").test(value) && value.length <= 80 && !RELATION_OPERATION.test(value);
}
function relationLabels(value: string): string[] | undefined {
  // Explicit finite lists: capital-start labels, optional lower-case words in
  // each label, and one final "and". Do not split arbitrary natural language.
  const parts = value.split(/\s+and\s+/u); if (parts.length !== 2 || !relationLabel(parts[1])) return;
  const labels: string[] = []; let cursor = 0;
  for (const match of parts[0].matchAll(new RegExp(RELATION_LABEL, "gu"))) {
    const gap = parts[0].slice(cursor, match.index);
    if (labels.length ? !/^(?: +|, *)$/u.test(gap) : gap !== "") return;
    if (!relationLabel(match[0])) return;
    labels.push(match[0]); cursor = match.index + match[0].length;
  }
  if (cursor !== parts[0].length) return;
  labels.push(parts[1]);
  return labels.length >= 2 && labels.length <= 6 && new Set(labels).size === labels.length ? labels : undefined;
}
function relationInputType(value: string): string | undefined {
  const match = /^(?:"([a-z-]+)"|'([a-z-]+)'|([a-z-]+))$/u.exec(value), type = match?.slice(1).find(part => part !== undefined);
  return type && INPUT_TYPES.has(type) ? type : undefined;
}
/** Admission descriptor only. Complete atomic syntax binds the named files,
 * labels and attributes to static source data; it neither inspects delivered
 * nodes nor establishes a for/id, tuple, input-type or runtime verdict. */
function staticRelationDirective(source: string): StaticRelationDescriptor | undefined {
  const text = source.trim(); if (text.length > 800 || /[\r\n]/u.test(text)) return;
  const body = text.replace(/\.$/u, ""), identity = text.replace(/[\t ]+/gu, " ");
  const labelPair = /^The static HTML labels (.+) on (\S+) must each target its matching input through a for and id pair$/u.exec(body);
  if (labelPair) {
    const labels = relationLabels(labelPair[1]), file = relationFile(labelPair[2]);
    return labels && file ? {identity, kind: "label_for_id", files: [file], labels} : undefined;
  }
  const input = /^The static (.+) control markup in (.+) must use input type (\S+)(?: rather than (\S+))?$/u.exec(body);
  if (input) {
    if (!relationLabel(input[1])) return;
    const pair = /^both (\S+) and (\S+)$/u.exec(input[2]), targets = pair ? pair.slice(1) : [input[2]];
    const files = targets.map(relationFile), inputType = relationInputType(input[3]), ratherThan = input[4] === undefined ? undefined : relationInputType(input[4]);
    if (files.some(file => file === undefined) || new Set(files).size !== files.length || !inputType || input[4] !== undefined && !ratherThan) return;
    return {identity, kind: "input_type", files: files as string[], label: input[1], inputType, ...(ratherThan ? {ratherThan} : {})};
  }
  const radio = /^The (\S+) source content must pair (.+) radio labels with values (.+) under the same ([A-Za-z][A-Za-z0-9_-]{0,39}) name$/u.exec(body);
  if (!radio) return;
  const file = relationFile(radio[1]), labels = relationLabels(radio[2]), valueParts = radio[3].split(/\s+and\s+/u);
  if (!file || !labels || valueParts.length !== 2) return;
  const values = [...valueParts[0].split(/(?:,\s*| +)/u), valueParts[1]];
  if (values.length !== labels.length || new Set(values).size !== values.length || values.some(value => !/^(?:0|[1-9]\d{0,2})$/u.test(value))) return;
  return {identity, kind: "radio_group", files: [file], labels, values, name: radio[4]};
}
function isStaticRelationCandidate(source: string): boolean {
  const text = source.trim();
  return /^The static HTML labels /u.test(text) || /^The static [^\r\n]{1,100} control markup in /u.test(text)
    || /^The \S+ source content must pair /u.test(text);
}

/** Admission controls do not establish whether a model's cited inference is true. */
export function assessmentEvidenceScope(criterion: ProofCriterion): AssessmentEvidenceScope {
  const literal = exactCopyLiteral(criterion.source), sourceDirective = sourceLiteralDirective(criterion.source), relationDirective = staticRelationDirective(criterion.source);
  const markupDirective = staticMarkupDirective(criterion.source) ?? relationDirective?.identity;
  // A title that repeats the same whole exact-copy directive adds no separate
  // obligation. Other titles retain their own runtime/financial/record veto.
  // In particular, do not infer a text-only scope from a truncated title.
  const repeatedLiteralTitle = literal !== undefined && exactCopyLiteral(criterion.title) === literal;
  const repeatedSourceTitle = sourceDirective !== undefined && sourceLiteralDirective(criterion.title) === sourceDirective;
  const repeatedMarkupTitle = markupDirective !== undefined && (staticMarkupDirective(criterion.title) ?? staticRelationDirective(criterion.title)?.identity) === markupDirective;
  const title = repeatedLiteralTitle || repeatedSourceTitle || repeatedMarkupTitle ? "" : criterion.title;
  const sourceOnlyDirective = literal !== undefined || sourceDirective !== undefined || markupDirective !== undefined;
  // Complete quoted literals and atomic markup-property statements bind their
  // contents to source data. The unquoted label/notice grammar still receives
  // every financial and durable-record veto before its text-only allowance.
  const combined = literal !== undefined || markupDirective !== undefined ? title : `${title}\n${criterion.source}`;
  if (criterion.id === "mobile") return { category: "requires_observation", reason: "mobile" };
  if (FINANCIAL_ACTION.test(combined) || CARD_DEBIT_ACTION.test(combined)) return { category: "requires_observation", reason: "financial_action" };
  if (RECORD_ACTION.test(combined) || CUSTOMER_DATA_REBOOT.test(combined)) return { category: "requires_observation", reason: "durable_record" };
  if (EMAIL_DELIVERY_ACTION.test(combined)) return {category: "requires_observation", reason: "runtime_or_subjective"};
  if (!sourceOnlyDirective && (isSourceLiteralDirectiveCandidate(criterion.source) || isStaticMarkupDirectiveCandidate(criterion.source) || isStaticRelationCandidate(criterion.source))) return {category: "requires_observation", reason: "unclassified_requirement"};
  if (sourceOnlyDirective) return OBSERVATION_REQUIRED.test(withoutWorkingTimeUnits(title))
    || relationDirective !== undefined && /\b(?:visib(?:le|ility)|visually|masked|masking|security|secure(?:ly)?|protection|protect(?:s|ed|ing)?)\b/iu.test(title)
    ? {category: "requires_observation", reason: "runtime_or_subjective"}
    : {category: "source_text", reason: "literal_content"};
  const policyCopy = isExplicitBookingPolicyCopy(criterion) || isExplicitRefundPolicyCopy(criterion);
  if (!policyCopy && OBSERVATION_REQUIRED.test(withoutWorkingTimeUnits(combined))) return { category: "requires_observation", reason: "runtime_or_subjective" };
  if (/^(?:manual|coverage)-/u.test(criterion.id) && !policyCopy && !SOURCE_CONTENT.test(criterion.source)
    && !PUBLISHED_POLICY_TEXT.test(criterion.source) && !ZH_CANCELLATION_WORDING.test(criterion.source.trim()) && !DISPLAYED_BUSINESS_HOURS.test(criterion.source)) {
    return { category: "requires_observation", reason: "unclassified_requirement" };
  }
  return { category: "source_text", reason: policyCopy ? "explicit_policy_copy" : /^(?:manual|coverage)-/u.test(criterion.id) ? "literal_content" : "other_source_rule" };
}

/** Fixed explanations describe the evidence still needed, never provider claims. */
export function assessmentObservationExplanation(scope: AssessmentEvidenceScope, language: Language): string {
  const zh = language === "zh";
  if (scope.reason === "durable_record") return zh
    ? "本项要求实际记录、持久留存或可查询的回执；源码中的文案不能证明记录已写入或可回读。请提供运行结果与独立记录回读证据，并核对完整锁定要求。"
    : "This requirement includes actual records, durable retention or queryable receipts. Source copy cannot establish that records were written or can be read back. Provide execution and independent record-readback evidence, and check the complete locked requirement.";
  if (scope.reason === "financial_action") return zh
    ? "本项包含实际退款、扣款或支付操作；源码政策文案不能证明资金操作已完成。请补充对应执行结果与交易记录，并核对完整锁定要求。"
    : "This requirement includes an actual refund, charge or payment operation. Source policy copy cannot establish that money moved. Supply the execution result and transaction record, and check the complete locked requirement.";
  if (scope.reason === "mobile") return zh
    ? "本项需要实际手机视口的浏览器观察与买家确认；源码文本不能证明移动端体验。"
    : "This requirement needs browser observations at a mobile viewport and buyer confirmation. Source text cannot establish the mobile experience.";
  return zh
    ? "本项不属于明确可用源码核对的文本内容要求，或含运行、交互、手机体验及主观判断；需要其他证据或买家实际确认。"
    : "This is not an explicit source-checkable text-content requirement, or it includes runtime, interaction, mobile or subjective claims. Other evidence or direct buyer confirmation is needed.";
}
