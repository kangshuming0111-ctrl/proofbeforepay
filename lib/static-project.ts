import type { Language, ProofCriterion, ProofDelivery, ProofEvidence, ProofResourceReport, StaticProjectSpec } from "./contracts.ts";
import { DomainError } from "./domain.ts";
import { assertStaticPath, decodeRasterDataUrl, resolveStaticReference, STATIC_RESOURCE_LIMITS, staticFileKind } from "./static-resources.ts";
import { confirmCoverage, coverageCriteria, validateSavedCoverage } from "./requirement-coverage.ts";
import { parseBusinessChecks, validateSavedBusinessChecks } from "./business-checks.ts";

const HTML_NAME = /\.html$/iu;
const LOCAL_TARGET = /^([^#]+\.html)(?:#([A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}))?$/iu;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const EXCERPT_LENGTH = 700;
const encoder = new TextEncoder();
const message = (language: Language, zh: string, en: string) => language === "zh" ? zh : en;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new DomainError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max || CONTROL.test(value)) {
    throw new DomainError(`${label} must contain 1–${max} characters without control characters.`);
  }
  return value.trim();
}

function htmlName(value: unknown, label: string): string {
  const name = assertStaticPath(text(value, label, STATIC_RESOURCE_LIMITS.maxPathLength));
  if (!HTML_NAME.test(name)) throw new DomainError(`${label} must be a relative .html file path.`);
  return name;
}

function projectSpec(value: unknown, preserveCoverage = false): StaticProjectSpec {
  const input = object(value, "Static project");
  if (!Array.isArray(input.requiredPages) || input.requiredPages.length < 1 || input.requiredPages.length > 10) {
    throw new DomainError("Required pages must contain 1–10 HTML filenames.");
  }
  const requiredPages = input.requiredPages.map((entry, index) => htmlName(entry, `Required page ${index + 1}`));
  if (new Set(requiredPages.map(name => name.toLowerCase())).size !== requiredPages.length) {
    throw new DomainError("Required page filenames must be unique, including letter case.");
  }
  const manual = input.manualRequirements ?? [];
  if (!Array.isArray(manual) || manual.length > 5) throw new DomainError("Use no more than 5 manual requirements.");
  const manualRequirements = manual.map((entry, index) => text(entry, `Manual requirement ${index + 1}`, 300));
  if (input.link !== undefined && input.links !== undefined) throw new DomainError("Choose either the legacy link or the list of local links, not both.");
  const parseLink = (value: unknown): NonNullable<StaticProjectSpec["link"]> => {
    const raw = object(value, "Link requirement");
    const to = text(raw.to, "Link destination", 250);
    const destination = LOCAL_TARGET.exec(to);
    if (!destination) throw new DomainError("Link destination must use a relative HTML filepath, optionally followed by #id, without an external URL.");
    htmlName(destination[1], "Link destination page");
    return { from: htmlName(raw.from, "Link source page"), text: text(raw.text, "Link text", 120), to };
  };
  const link = input.link === undefined ? undefined : parseLink(input.link);
  let links: StaticProjectSpec["links"];
  if (input.links !== undefined) {
    if (!Array.isArray(input.links) || input.links.length > 5) throw new DomainError("Use no more than five local navigation steps.");
    links = input.links.map(parseLink);
    if (new Set(links.map(row => `${row.from}\n${normalizedText(row.text)}`)).size !== links.length) throw new DomainError("Local steps must not repeat the same source page and link label.");
  }
  const project: StaticProjectSpec = { requiredPages, ...(link ? { link } : {}), ...(links ? {links} : {}), manualRequirements,
    ...(preserveCoverage && input.coverage !== undefined ? {coverage: validateSavedCoverage(input.coverage)} : {}) };
  if (preserveCoverage && input.businessChecks !== undefined) project.businessChecks = validateSavedBusinessChecks(input.businessChecks, project);
  return project;
}

function criteriaFor(project: StaticProjectSpec, language: Language): ProofCriterion[] {
  const criteria = project.requiredPages.map((file, index) => ({
    id: `page-${index + 1}`,
    title: message(language, `独立页面：${file}`, `Separate page: ${file}`),
    source: message(language, `交付独立非空 HTML 文档 ${file}，包含 HTML doctype、非空 title 与 body。`, `Deliver ${file} as a separate nonempty HTML document with an HTML doctype, a nonempty title and a body.`),
  }));
  (project.links ?? (project.link ? [project.link] : [])).forEach((link, index) => criteria.push({
    id: index === 0 ? "link" : `link-${index + 1}`, title: message(language, `本地链接目标${index ? ` ${index + 1}` : ""}`, `Local link destination${index ? ` ${index + 1}` : ""}`),
    source: message(language, `${link.from} 包含文字为“${link.text}”的链接，指向 ${link.to}。`, `${link.from} contains a link labelled “${link.text}” pointing to ${link.to}.`),
  }));
  criteria.push({ id: "mobile", title: message(language, "移动端可用", "Mobile usability"), source: message(language, "所有交付页面都必须能在手机屏幕上正常使用；必须由人实际检查。", "All delivered pages must be usable on a mobile screen; a person must check them directly.") });
  project.manualRequirements.forEach((source, index) => criteria.push({ id: `manual-${index + 1}`, title: message(language, `人工要求 ${index + 1}`, `Manual requirement ${index + 1}`), source }));
  criteria.push(...coverageCriteria(project.coverage, language));
  return criteria;
}

/** Validate an agreement without using floating-point arithmetic for money. */
export function parseStaticProject(input: Record<string, unknown>, language: Language, options: {requireCoverage?: boolean} = {}) {
  object(input, "Project input");
  if (language !== "zh" && language !== "en") throw new DomainError("Language must be zh or en.");
  const title = text(input.title, "Project title", 120);
  const summary = text(input.summary, "Project summary", 1000);
  if (typeof input.amount !== "string" || !/^(?:0|[1-9]\d{0,4})(?:\.\d{1,2})?$/u.test(input.amount)) {
    throw new DomainError("Amount must be a decimal string with at most two decimal places, for example 125.50.");
  }
  const [whole, fraction = ""] = input.amount.split(".");
  const totalCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (totalCents < 1 || totalCents > 1_000_000) throw new DomainError("Amount must be between 0.01 and 10000.00.");
  const project = projectSpec(input);
  if (options.requireCoverage || input.coverage !== undefined) project.coverage = confirmCoverage(summary, input.coverage);
  if (input.businessChecks !== undefined) project.businessChecks = parseBusinessChecks(input.businessChecks, project);
  return { title, summary, totalCents, project, criteria: criteriaFor(project, language) };
}

/** Return an independent snapshot. No files are executed, fetched or rewritten. */
export function validateStaticFiles(value: unknown): Record<string, string> {
  const input = object(value, "Delivery files");
  const keys = Reflect.ownKeys(input);
  if (keys.length < 1 || keys.length > STATIC_RESOURCE_LIMITS.maxFiles) throw new DomainError("Upload between 1 and 40 HTML/CSS or supported raster files.");
  const seen = new Set<string>();
  const files: Record<string, string> = {};
  let totalBytes = 0, rasterBytes = 0;
  for (const key of keys) {
    assertStaticPath(key);
    const path = key as string, kind = staticFileKind(path);
    if (!kind) throw new DomainError("Only HTML, CSS, PNG, JPEG and WebP delivery files are supported.");
    const canonical = path.toLowerCase();
    if (seen.has(canonical) || [...seen].some(prior => prior.startsWith(`${canonical}/`) || canonical.startsWith(`${prior}/`))) throw new DomainError("File paths must not collide as files/directories or when letter case is ignored.");
    seen.add(canonical);
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !("value" in descriptor) || typeof descriptor.value !== "string") {
      throw new DomainError(`File ${path} must contain text or a supported raster data URL, not a property accessor.`);
    }
    const contents = descriptor.value;
    if (kind === "png" || kind === "jpeg" || kind === "webp") {
      rasterBytes += decodeRasterDataUrl(path, contents).bytes.byteLength;
      if (rasterBytes > STATIC_RESOURCE_LIMITS.rasterTotalBytes) throw new DomainError("Raster files exceed 1 MiB in total.");
      files[path] = contents;
      continue;
    }
    if (!contents.trim() || CONTROL.test(contents) || [...contents].some(character => {
      const point = character.codePointAt(0)!;
      return point >= 0xd800 && point <= 0xdfff;
    })) throw new DomainError(`File ${path} is empty or contains binary/invalid Unicode data.`);
    const bytes = encoder.encode(contents).byteLength;
    if (bytes > STATIC_RESOURCE_LIMITS.textFileBytes) throw new DomainError(`File ${path} exceeds 64 KiB of UTF-8 text.`);
    totalBytes += bytes;
    if (totalBytes > STATIC_RESOURCE_LIMITS.textTotalBytes) throw new DomainError("Delivery files exceed 256 KiB of UTF-8 text in total.");
    files[path] = contents;
  }
  if (!Object.hasOwn(files, "index.html")) throw new DomainError("Include a root-level index.html file.");
  return files;
}

type Tag = { name: string; closing: boolean; selfClosing: boolean; attributes: Map<string, string>; start: number; end: number; valid: boolean };
type Element = { tag: Tag; inBody: boolean };
type Anchor = { tag: Tag; end: number; text: string; valid: boolean };
type HtmlInspection = { valid: boolean; title?: string; anchors: Anchor[]; elements: Element[]; styles: string[]; ambiguous: boolean };
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const RAW = new Set(["script", "style", "textarea", "xmp", "iframe", "noembed", "noframes", "plaintext"]);
const BLOCKED = new Set(["template", "svg", "math", "noscript"]);

function entities(value: string): { text: string; valid: boolean } {
  let valid = true;
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const decoded = value.replace(/&(?:#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]*);?/giu, entity => {
    if (!entity.endsWith(";")) { valid = false; return entity; }
    const key = entity.slice(1, -1);
    if (key.startsWith("#")) {
      const number = key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
      if (!Number.isInteger(number) || number < 32 || number > 0x10ffff || number >= 0xd800 && number <= 0xdfff) { valid = false; return entity; }
      return String.fromCodePoint(number);
    }
    if (Object.hasOwn(named, key)) return named[key];
    valid = false;
    return entity;
  });
  return { text: decoded, valid };
}

/** Quote-aware tokenization prevents '>' in an attribute from creating fake tags. */
function tagAt(html: string, start: number): Tag | undefined {
  const prefix = /^<(\/)?([A-Za-z][A-Za-z0-9:-]*)\b/u.exec(html.slice(start));
  if (!prefix) return;
  let quote = "";
  let end = start + prefix[0].length;
  for (; end < html.length; end++) {
    const char = html[end];
    if (quote) { if (char === quote) quote = ""; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === ">") break;
  }
  if (end >= html.length || quote) return;
  const closing = !!prefix[1];
  const name = prefix[2].toLowerCase();
  const raw = html.slice(start + prefix[0].length, end);
  const selfClosing = /\/\s*$/u.test(raw);
  let rest = selfClosing ? raw.replace(/\/\s*$/u, "") : raw;
  const attributes = new Map<string, string>();
  let valid = !closing || !rest.trim();
  while (rest.trim()) {
    const attribute = /^\s+([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/u.exec(rest);
    if (!attribute) { valid = false; break; }
    const key = attribute[1].toLowerCase();
    const value = entities(attribute[2] ?? attribute[3] ?? attribute[4] ?? "");
    if (attributes.has(key) || !value.valid) valid = false;
    attributes.set(key, value.text);
    rest = rest.slice(attribute[0].length);
  }
  return { name, closing, selfClosing, attributes, start, end: end + 1, valid };
}

function inspectHtml(html: string): HtmlInspection {
  const anchors: Anchor[] = [];
  const elements: Element[] = [];
  const styles: string[] = [];
  const stack: string[] = [];
  const blocked: string[] = [];
  let activeAnchor: Anchor | undefined;
  let ambiguous = false;
  let doctype = 0;
  let titleCount = 0;
  let title: string | undefined;
  let bodyCount = 0;
  let bodyClosed = false;
  let bodyContent = "";
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      const end = html.indexOf("-->", index + 4);
      if (end < 0) { ambiguous = true; break; }
      index = end + 3;
      continue;
    }
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const end = next < 0 ? html.length : next;
      if (!blocked.length) {
        const raw = html.slice(index, end);
        if (stack.includes("body")) bodyContent += raw;
        if (activeAnchor) {
          const content = entities(raw);
          activeAnchor.text += content.text;
          activeAnchor.valid &&= content.valid;
        }
      }
      index = end;
      continue;
    }
    const declaration = /^<!doctype\s+html\s*>/iu.exec(html.slice(index));
    if (declaration) {
      if (!blocked.length) { doctype++; if (bodyCount || titleCount || stack.length) ambiguous = true; }
      index += declaration[0].length;
      continue;
    }
    const tag = tagAt(html, index);
    if (!tag) { ambiguous = true; break; }
    index = tag.end;
    if (!tag.closing && (RAW.has(tag.name) || tag.name === "title")) {
      const close = new RegExp(`</${tag.name}\\s*>`, "giu");
      close.lastIndex = index;
      const found = close.exec(html);
      if (!found) { ambiguous = true; break; }
      if (!blocked.length && tag.name === "title") {
        titleCount++;
        const content = entities(html.slice(index, found.index));
        title = html.slice(tag.start, close.lastIndex);
        if (bodyCount || !content.valid || !content.text.trim() || /</u.test(content.text)) ambiguous = true;
      }
      if (!blocked.length && tag.name === "style") styles.push(html.slice(index, found.index));
      if (!tag.valid) ambiguous = true;
      index = close.lastIndex;
      continue;
    }
    if (blocked.length) {
      if (!tag.closing && tag.name === blocked[0]) blocked.push(tag.name);
      else if (tag.closing && tag.name === blocked[blocked.length - 1]) blocked.pop();
      continue;
    }
    if (!tag.closing && BLOCKED.has(tag.name)) { blocked.push(tag.name); continue; }
    if (!tag.valid || tag.selfClosing && !VOID.has(tag.name)) ambiguous = true;
    if (tag.name === "base") ambiguous = true; // A base URL changes the meaning of local hrefs.
    if (tag.closing) {
      if (stack.pop() !== tag.name) ambiguous = true;
      if (tag.name === "body") bodyClosed = true;
      if (tag.name === "a") {
        if (!activeAnchor) ambiguous = true;
        else { activeAnchor.end = tag.end; anchors.push(activeAnchor); activeAnchor = undefined; }
      }
      if (stack.includes("body")) bodyContent += html.slice(tag.start, tag.end);
    } else {
      const inBody = stack.includes("body");
      elements.push({ tag, inBody });
      if (tag.name === "body") { bodyCount++; if (bodyClosed) ambiguous = true; }
      else if (inBody) bodyContent += html.slice(tag.start, tag.end);
      if (tag.name === "a" && inBody) {
        if (activeAnchor) ambiguous = true;
        activeAnchor = { tag, end: tag.end, text: "", valid: tag.valid };
      }
      if (!VOID.has(tag.name)) stack.push(tag.name);
    }
  }
  if (stack.length || blocked.length || activeAnchor) ambiguous = true;
  return { valid: !ambiguous && doctype === 1 && titleCount === 1 && bodyCount === 1 && bodyClosed && !!bodyContent.trim(), title, anchors, elements, styles, ambiguous };
}

/** Deterministic source references only. This never fetches or executes a resource. */
export function inspectStaticResources(files: Record<string, string>): ProofResourceReport {
  const findings: ProofResourceReport["findings"] = [], seen = new Set<string>();
  let checked = 0, limited = false, findingLimit = false;
  const finding = (entry: ProofResourceReport["findings"][number]) => {
    if (findings.length >= 400) {
      if (!findingLimit) findings.push({ from: entry.from, reference: "[resource finding limit exceeded]", kind: "uninspectable" });
      findingLimit = true;
      return;
    }
    const key = JSON.stringify(entry);
    if (!seen.has(key)) { seen.add(key); findings.push(entry); }
  };
  const reference = (from: string, raw: string, expected: "html" | "css" | "raster") => {
    if (checked >= 400) { if (!limited) finding({ from, reference: "[resource reference limit exceeded]", kind: "uninspectable" }); limited = true; return; }
    checked++;
    const target = resolveStaticReference(from, raw);
    const kind = target && staticFileKind(target);
    if (!target || !kind || (expected === "raster" ? !["png", "jpeg", "webp"].includes(kind) : kind !== expected)) {
      finding({ from, reference: raw.slice(0, 500), ...(target ? { target } : {}), kind: "blocked" });
    } else if (!Object.hasOwn(files, target)) finding({ from, reference: raw.slice(0, 500), target, kind: "missing" });
  };
  const css = (from: string, source: string) => {
    const clean = source.replace(/\/\*[\s\S]*?\*\//gu, "");
    if (/\\|\/\*/u.test(clean)) finding({ from, reference: "[CSS escapes or incomplete comments require direct inspection]", kind: "uninspectable" });
    for (const match of clean.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]*))\s*\)/giu)) {
      reference(from, match[1] ?? match[2] ?? match[3], /@import\s*$/iu.test(clean.slice(0, match.index)) ? "css" : "raster");
    }
    for (const match of clean.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/giu)) reference(from, match[1] ?? match[2], "css");
    const urls = clean.match(/url\s*\(/giu)?.length ?? 0;
    if (urls > [...clean.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)'";]*))\s*\)/giu)].length) finding({ from, reference: "[Unsupported CSS URL syntax]", kind: "uninspectable" });
  };
  for (const from of Object.keys(files).sort()) {
    const kind = staticFileKind(from);
    if (kind === "css") { css(from, files[from]); continue; }
    if (kind !== "html") continue;
    const html = inspectHtml(files[from]);
    for (const { tag } of html.elements) {
      if (!tag.valid) continue;
      if (tag.name === "link" && tag.attributes.get("rel")?.toLowerCase().split(/\s+/u).includes("stylesheet")) reference(from, tag.attributes.get("href") ?? "", "css");
      if (tag.name === "a" && tag.attributes.has("href")) reference(from, tag.attributes.get("href")!, "html");
      if (tag.name === "img" && tag.attributes.has("src")) reference(from, tag.attributes.get("src")!, "raster");
      if (["img", "source"].includes(tag.name) && tag.attributes.has("srcset")) {
        for (const candidate of tag.attributes.get("srcset")!.split(",")) {
          const match = /^\s*(\S+?)(?:\s+\d+(?:\.\d+)?[wx])?\s*$/u.exec(candidate);
          if (match) reference(from, match[1], "raster");
          else finding({ from, reference: candidate.slice(0, 500), kind: "uninspectable" });
        }
      }
      if (tag.attributes.has("style")) css(from, tag.attributes.get("style")!);
    }
    for (const style of html.styles) css(from, style);
  }
  return { method: "static-resources-v1", checked, findings };
}

function snippet(value: string): string { return value.slice(0, EXCERPT_LENGTH); }
function normalizedText(value: string): string { return value.replace(/\s+/gu, " ").trim(); }

/** Static source evidence only; rendering, JavaScript and external services are not tested. */
export function createUploadedDelivery(value: unknown, rawProject: StaticProjectSpec, language: Language, sequence: number): ProofDelivery {
  if (language !== "zh" && language !== "en") throw new DomainError("Language must be zh or en.");
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new DomainError("Delivery sequence must be a positive whole number.");
  const project = projectSpec(rawProject, true);
  const files = validateStaticFiles(value);
  const inspected = new Map(Object.entries(files).filter(([name]) => HTML_NAME.test(name)).map(([name, html]) => [name, inspectHtml(html)]));
  const evidence: ProofEvidence[] = project.requiredPages.map((file, index) => {
    const page = inspected.get(file);
    return {
      id: `evidence-page-${index + 1}`, criterionId: `page-${index + 1}`, file,
      excerpt: snippet(page?.title ?? files[file] ?? ""), finding: page?.valid ? "pass" : "fail",
      explanation: page?.valid
        ? message(language, "已找到此独立文档的 doctype、非空 title 与 body。仅证明源码文档存在，不证明内容完整、视觉质量或功能可用。", "Found an independent document with a doctype, nonempty title and body. This proves source-document presence, not content completeness, visual quality or working functionality.")
        : message(language, `${file} 未交付或未通过保守 HTML 结构检查；请检查 doctype、title、body 及含糊标记。`, `${file} is absent or did not pass conservative HTML structure checks. Check its doctype, title, body and ambiguous markup.`),
    };
  });
  (project.links ?? (project.link ? [project.link] : [])).forEach((requirement, index) => {
    const source = inspected.get(requirement.from);
    const matches = source?.anchors.filter(anchor => normalizedText(anchor.text) === normalizedText(requirement.text)) ?? [];
    const anchor = matches.length === 1 ? matches[0] : undefined;
    const target = LOCAL_TARGET.exec(requirement.to)!;
    const targetPage = inspected.get(target[1]);
    const destinations = target[2] ? targetPage?.elements.filter(element => element.inBody && element.tag.attributes.get("id") === target[2]) ?? [] : [];
    const rawHref = anchor?.tag.attributes.get("href");
    const fragment = rawHref?.match(/^[^?#]*(#[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127})$/u)?.[1];
    const resolved = rawHref && resolveStaticReference(requirement.from, rawHref);
    const href = resolved ? `${resolved}${fragment ?? ""}` : undefined;
    const hiddenAnchor = anchor?.tag.attributes.has("hidden") || anchor?.tag.attributes.has("inert");
    const passed = !!source?.valid && !!targetPage?.valid && !!anchor?.valid && !hiddenAnchor && href === requirement.to && (!target[2] || destinations.length === 1);
    const sourceHtml = files[requirement.from] ?? "";
    const criterionId = index === 0 ? "link" : `link-${index + 1}`;
    evidence.push({ id: `evidence-${criterionId}`, criterionId, file: requirement.from,
      excerpt: snippet(anchor ? sourceHtml.slice(anchor.tag.start, anchor.end) : sourceHtml), finding: passed ? "pass" : "fail",
      explanation: passed
        ? message(language, `实际 a 链接的文字与 ${requirement.to} 匹配${target[2] ? "，目标文件中有唯一对应 id" : "，目标页面已交付"}。只证明源码本地目标存在；未测试点击、脚本、外部服务或完整功能。`, `An actual anchor has the agreed text and ${requirement.to} destination${target[2] ? ", with one matching target id" : ", with a delivered target page"}. This proves a local source target exists, not rendered clicks, scripts, external services or complete functionality.`)
        : message(language, "未能无歧义地确认约定文字的实际 a 链接及唯一有效本地目标。缺页、重复文字/id、不匹配 href 或含糊 HTML 都不能算通过。", "Could not unambiguously confirm the agreed anchor text and one valid local target. Missing pages, duplicate labels/ids, a different href or ambiguous HTML cannot pass."),
    });
  });
  const supportFile = Object.keys(files).find(name => name.endsWith(".css")) ?? "index.html";
  evidence.push({ id: "evidence-mobile", criterionId: "mobile", file: supportFile, excerpt: snippet(files[supportFile]), finding: "needs_human",
    explanation: message(language, "静态源码不能证明手机上的可读性、无溢出或可点击性。必须实际检查所有页面；预览禁用脚本及外部资源，不等于完整网站运行验证。", "Static source cannot prove mobile readability, lack of overflow or usable controls. A person must inspect every page. Preview disables scripts and external resources and is not a complete website execution test."),
  });
  project.manualRequirements.forEach((requirement, index) => evidence.push({ id: `evidence-manual-${index + 1}`, criterionId: `manual-${index + 1}`, file: "index.html", excerpt: snippet(files["index.html"]), finding: "needs_human",
    explanation: message(language, `此项须人工核对原始约定：“${requirement}”。源码摘录只是交付来源，不能自动证明满足要求。`, `A person must verify the original requirement: “${requirement}”. The excerpt identifies delivered source and does not automatically establish compliance.`),
  }));
  coverageCriteria(project.coverage, language).forEach(criterion => evidence.push({id: `evidence-${criterion.id}`, criterionId: criterion.id, file: "index.html", excerpt: snippet(files["index.html"]), finding: "needs_human",
    explanation: message(language, `逐项核对原始需求：“${criterion.source}”。如果这一段包含多个要求，必须全部满足；页面存在或 AI 建议不能代替你的确认。`, `Check the complete original requirement: “${criterion.source}”. If this span contains several requirements, verify all of them. Page presence or AI advice does not replace your confirmation.`)}));
  return { id: crypto.randomUUID(), variant: "upload", sequence, label: message(language, `用户上传版本 ${sequence}`, `Uploaded delivery ${sequence}`), submittedAt: new Date().toISOString(), files, evidence, resources: inspectStaticResources(files) };
}
