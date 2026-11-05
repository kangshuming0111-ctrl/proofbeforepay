// Admission only: these complete atomic statements identify an HTML property,
// literal source text or a source-table association. They neither inspect the
// delivered DOM nor prove that the statement is true, visible or operational.
const CONTEXT = "[A-Za-z0-9][A-Za-z0-9-]{0,39}(?: [A-Za-z0-9][A-Za-z0-9-]{0,39}){0,2}";
const quoted = /^(?:"([^"\r\n]{1,120})"|'([^'\r\n]{1,120})'|“([^“”\r\n]{1,120})”|「([^「」\r\n]{1,120})」)$/u;
const plain = /^[\p{L}\p{N}][\p{L}\p{N} *&@'’()_./#$?-]{0,119}$/u;
const continuation = /\b(?:and|then|also|but|however|must|shall|should|will|can|could|would|may|actually|automatically)\b/iu;

function literal(value: string): boolean {
  const text = value.trim();
  // Inside one balanced quotation all bounded characters are literal data,
  // including strings such as "After Hours" or "Actually charge the card".
  if (quoted.test(text)) return !/[\u0000-\u001f\u007f]/u.test(text);
  return plain.test(text) && !continuation.test(text) && text.split(/\s+/u).length <= 12;
}

function literalList(value: string): boolean {
  const values: string[] = []; let start = 0, close = "";
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (close) { if (char === close) close = ""; continue; }
    // Apostrophes within an unquoted word are not quotation delimiters.
    if (char === '"' || char === "“" || char === "「" || char === "'" && !value.slice(start, i).trim()) {
      close = char === "“" ? "”" : char === "「" ? "」" : char; continue;
    }
    const separator = /^(?:,\s*(?:and\s+)?|\s+and\s+)/iu.exec(value.slice(i));
    if (separator) { values.push(value.slice(start, i).trim()); i += separator[0].length - 1; start = i + 1; }
  }
  if (close) return false;
  values.push(value.slice(start).trim());
  return values.length >= 1 && values.length <= 6 && values.every(literal);
}

type Pattern = {expression: RegExp; values: number[]; list?: number; path?: number};
const patterns: Pattern[] = [
  {expression: new RegExp(`^In the delivered (${CONTEXT}) HTML the (.+?) table must contain the literal headings (.+)\\.$`, "u"), values: [2], list: 3},
  {expression: new RegExp(`^In the delivered (${CONTEXT}) HTML the input immediately under (.+?) must use type=("[^"\\r\\n]{1,40}"|'[^'\\r\\n]{1,40}')(?: rather than type=("[^"\\r\\n]{1,40}"|'[^'\\r\\n]{1,40}'))?\\.$`, "u"), values: [2, 3, 4]},
  {expression: new RegExp(`^In the delivered (${CONTEXT}) HTML the primary submit button text must read (.+?) rather than (.+)\\.$`, "u"), values: [2, 3]},
  {expression: new RegExp(`^The delivered (${CONTEXT}) HTML document title must be (.+?) rather than (?:the generic )?(.+)\\.$`, "u"), values: [2, 3]},
  {expression: /^(.+?) must have (.+?) and (.+?) in (?:his|her|their) source table row\.$/u, values: [1, 2, 3]},
  {expression: new RegExp(`^(${CONTEXT}) source text must not contain (.+)\\.$`, "u"), values: [2]},
  {expression: new RegExp(`^(${CONTEXT}) source labels must include (.+)\\.$`, "u"), values: [], list: 2},
  {expression: new RegExp(`^(${CONTEXT}) source (?:email|password|text|tel|number|url|search) input must have type=("[^"\\r\\n]{1,40}"|'[^'\\r\\n]{1,40}')\\.$`, "u"), values: [2]},
  {expression: new RegExp(`^(${CONTEXT}) source (.+?) link href must be (.+)\\.$`, "u"), values: [2], path: 3},
  {expression: /^The website content must not advertise the template brand (.+?) anywhere in current page copy\.?$/u, values: [1]},
];

export function staticMarkupDirective(source: string): string | undefined {
  const text = source.trim();
  if (text.length > 800 || /[\r\n]/u.test(text)) return;
  for (const pattern of patterns) {
    const match = pattern.expression.exec(text); if (!match) continue;
    if (pattern.values.some(index => match[index] !== undefined && !literal(match[index]))) continue;
    if (pattern.list !== undefined && !literalList(match[pattern.list])) continue;
    if (pattern.path !== undefined) {
      const value = match[pattern.path].trim(), quotedPath = quoted.exec(value);
      const path = quotedPath?.slice(1).find(part => part !== undefined) ?? value;
      if (!/^[A-Za-z0-9_./#?-]{1,120}$/u.test(path)) continue;
    }
    return text.replace(/[\t ]+/gu, " ");
  }
}

/** Recognised property families with malformed tails cannot borrow a broader
 * source-copy allowance. The word source alone grants no special scope. */
export function isStaticMarkupDirectiveCandidate(source: string): boolean {
  const text = source.trim();
  return new RegExp(`^(?:In the delivered ${CONTEXT} HTML the |The delivered ${CONTEXT} HTML document title must be |${CONTEXT} source (?:text must not contain |labels must include |(?:email|password|text|tel|number|url|search) input must have type=))`, "u").test(text)
    || / source table row\b/u.test(text)
    || new RegExp(`^${CONTEXT} source .+? link href must be `, "u").test(text)
    || /^The website content must not advertise the template brand /u.test(text);
}

/** Only working as part of an explicit counted time unit is removed from the
 * runtime-word scan. Actual work/working functionality remains untouched. */
export function withoutWorkingTimeUnits(value: string): string {
  return value.replace(/\b(?:[1-9]\d?|one|two|three|four|five|six|seven|eight|nine|ten)\s+working\s+(?:days?|hours?)\b/giu, "counted time units");
}
