// A deliberately finite source-text grammar, not a natural-language classifier.
// These forms name literal source labels or one short exact notice. They never
// establish rendered visibility, validation, submission, login or payment.
const PREFIX = /^([A-Z][A-Za-z0-9-]{0,39}(?: [A-Z][A-Za-z0-9-]{0,39}){0,2}) (page|form) source (?:copy|content) must /u;
const TITLE_PREFIX = /^(?:Each page's|Every page's|The page's) HTML title content must identify /u;
const ACTION_OR_CLAUSE = /\b(?:actually|automatically|actual|must|shall|should|will|can|could|would|may|needs?|then|also|plus|after|before|when|while|unless|if|guarantee[sd]?|send(?:s|ing)?|sent|charg(?:e[sd]?|ing)|refund(?:s|ed|ing)?|sav(?:e[sd]?|ing)|record(?:s|ed|ing)?|stor(?:e[sd]?|ing|age)|persist(?:s|ed|ing|ence)?|retain(?:s|ed|ing)?|execut(?:e[sd]?|ing)|process(?:es|ed|ing)?|submi(?:t|ts|tted|tting)|deduct(?:s|ed|ing)?|authenticat(?:e[sd]?|ing|ion)|deliver(?:s|ed|ing|y)|keep(?:s|ing)?|kept)\b/iu;
const LABEL = /^[A-Z][A-Za-z0-9 *'’()_-]{0,79}$/u;
const NOTICE = /^[A-Z][A-Za-z0-9 '’_-]{0,119}[.!]?$/u;

/** A malformed member of these recognised families must not fall back to the
 * broader ordinary-copy allowance. Unrelated text is not classified here. */
export function isSourceLiteralDirectiveCandidate(source: string): boolean {
  const text = source.trim(), prefix = PREFIX.exec(text);
  return TITLE_PREFIX.test(text) || !!prefix && /^(?:label\b|include the (?:labels\b|exact table headings\b|exact notice:))/u.test(text.slice(prefix[0].length));
}

export type SourceLiteralDescriptor = {identity: string; kind: "html_labels"; labels: string[]; context: "page" | "form"}
  | {identity: string; kind: "table_headings" | "notice" | "html_title"};

/** The descriptor and legacy string API share one finite parse. It does not
 * invent a required filename or prove an actual label/control association. */
export function parseSourceLiteralDirective(source: string): SourceLiteralDescriptor | undefined {
  const text = source.trim(), titlePrefix = TITLE_PREFIX.exec(text);
  if (titlePrefix) {
    const names = /^([A-Z][A-Za-z0-9 '’_-]{0,79}) rather than ([A-Z][A-Za-z0-9 '’_-]{0,79})\.?$/u.exec(text.slice(titlePrefix[0].length));
    if (!names || names.slice(1).some(name => name.trim().split(/\s+/u).length > 6 || ACTION_OR_CLAUSE.test(name) || /\b(?:and|or|rather|than)\b/iu.test(name))) return;
    return {identity: text.replace(/[\t ]+/gu, " "), kind: "html_title"};
  }
  const prefix = PREFIX.exec(text);
  if (!prefix) return;
  const body = text.slice(prefix[0].length);
  const labels = /^(label|include the labels|include the exact table headings) ([^\r\n]+)$/u.exec(body);
  if (labels) {
    const values = labels[2].replace(/\.$/u, "").split(/,\s*(?:and\s+)?|\s+and\s+/iu).map(value => value.trim());
    if (values.length < 1 || values.length > 6 || values.some(value => !LABEL.test(value) || ACTION_OR_CLAUSE.test(value) || /\b(?:and|or)$/iu.test(value))) return;
    const identity = text.replace(/[\t ]+/gu, " ");
    return labels[1] === "include the exact table headings" ? {identity, kind: "table_headings"}
      : {identity, kind: "html_labels", labels: values, context: prefix[2] as "page" | "form"};
  } else {
    const notice = /^include the exact notice: ([^\r\n]+)$/u.exec(body);
    if (!notice || !NOTICE.test(notice[1]) || ACTION_OR_CLAUSE.test(notice[1]) || /\b(?:and|or)\b/iu.test(notice[1])) return;
  }
  return {identity: text.replace(/[\t ]+/gu, " "), kind: "notice"};
}

/** Compatibility API: complete recognised directive identity, unchanged. */
export function sourceLiteralDirective(source: string): string | undefined {
  return parseSourceLiteralDirective(source)?.identity;
}
