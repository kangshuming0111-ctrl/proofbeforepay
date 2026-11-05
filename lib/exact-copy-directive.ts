// This finite grammar recognises only a complete instruction to include one
// exact quoted string. A suffix, second obligation or unfamiliar wording does
// not inherit its text-only scope. The quotation is data, not an instruction
// to perform the operation that its words might describe.
const ENGLISH_DIRECTIVE = /^(?:(?:The|Our)\s+)?(?:page|website|site)\s+(?:copy|text(?:\s+content)?)\s+(?:must|should|needs?\s+to)\s+(?:include|contain|display|show)\s+the\s+exact\s+(?:wording|text|string)\s+(?:"([^"\r\n]{1,300})"|“([^“”\r\n]{1,300})”)[.!]?$/iu;
const CHINESE_DIRECTIVE = /^(?:页面|网页|网站)(?:文案|文字|文本)(?:必须|须|需要|应)(?:(?:逐字|原样)(?:包含|显示|写明)|(?:包含|显示|写明)(?:完全一致的|逐字相同的|准确的)(?:文字|文案|原文|字样))\s*[：:]?\s*(?:"([^"\r\n]{1,300})"|“([^“”\r\n]{1,300})”|「([^「」\r\n]{1,300})」)[。！]?$/u;

// Only HTML whitespace and NBSP are equivalent. Do not lowercase, fold Unicode
// compatibility characters, discard punctuation or compare paraphrases.
export const normalizeExactCopyWhitespace = (value: string): string => value.replace(/[\t\n\f\r \u00a0]+/gu, " ").trim();

export function exactCopyLiteral(source: string): string | undefined {
  const match = ENGLISH_DIRECTIVE.exec(source.trim()) ?? CHINESE_DIRECTIVE.exec(source.trim());
  const literal = match?.slice(1).find(value => value !== undefined);
  return literal && normalizeExactCopyWhitespace(literal) || undefined;
}
