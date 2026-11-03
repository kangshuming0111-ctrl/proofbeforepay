/** Local manifest linting only: this module never fetches a URL, opens a
 * database, installs a registration or executes seller code. */
import {SELLER_BRIDGE_ACTION_IDS, SELLER_BRIDGE_PROTOCOL} from "./seller-journey-bridge.ts";

export const JOURNEY_INTEGRATION_PARENT_ORIGIN = "https://briefpay-kang-lab.blueheron8.chatgpt.site";
export const JOURNEY_INTEGRATION_MANIFEST_BYTES = 16 * 1024;
export const JOURNEY_INTEGRATION_RECEIPT_FIELDS = ["id", "testRunId", "marker", "customer", "email", "slot", "partySize", "status", "idempotencyKey"] as const;
export type JourneyIntegrationReceiptField = typeof JOURNEY_INTEGRATION_RECEIPT_FIELDS[number];
export type JourneyIntegrationManifest = {
  version: 1;
  native: {stack: string; schemaRevision: string; deploymentRevision?: string; receiptFields: Record<JourneyIntegrationReceiptField, string>; statusValues?: Record<string, "active" | "cancelled">};
  bridge: {protocol: typeof SELLER_BRIDGE_PROTOCOL; recipe: "booking-lifecycle-20-v1"; revision: string; backendProtocol?: "booking-lifecycle-http-v1"; supportedActions?: string[]};
  deployment: {frontendEntryUrl: string; backendBaseUrl: string; allowedParentOrigin: typeof JOURNEY_INTEGRATION_PARENT_ORIGIN};
  syntheticOnly: true;
};
export type JourneyIntegrationCheck = {id: string; field: string; status: "ready" | "error" | "warning"; message: string; messageZh: string};
export type JourneyIntegrationPreflight = {
  checks: JourneyIntegrationCheck[]; errors: JourneyIntegrationCheck[]; warnings: JourneyIntegrationCheck[];
  canRequestRegistration: boolean;
  limits: {networkRequests: 0; registrationApproved: false; databaseVerified: false; sourceVerified: false; deploymentVerified: false; browserExecutionVerified: false; ownershipVerified: false; dnsVerified: false};
};

/** Illustrative destinations must be replaced by the seller's authorised
 * staging host. The native names mirror the separate Python/SQLite workshop. */
export const JOURNEY_INTEGRATION_TEMPLATE: JourneyIntegrationManifest = {
  version: 1,
  native: {stack: "python-sqlite", schemaRevision: "florist-enrolments-v1", deploymentRevision: "florist-workshop-python-fixed-v1",
    receiptFields: {id: "enrolments.enrolment_ref", testRunId: "enrolments.exercise_id", marker: "enrolments.exercise_tag", customer: "enrolments.participant_label", email: "enrolments.participant_contact", slot: "sessions.starts_at", partySize: "enrolments.seat_count", status: "enrolments.enrolment_state", idempotencyKey: "enrolments.creation_command"},
    statusValues: {confirmed: "active", withdrawn: "cancelled"}},
  bridge: {protocol: SELLER_BRIDGE_PROTOCOL, recipe: "booking-lifecycle-20-v1", revision: "lifecycle-fixed-v1", backendProtocol: "booking-lifecycle-http-v1", supportedActions: [...SELLER_BRIDGE_ACTION_IDS]},
  deployment: {frontendEntryUrl: "https://workshop-staging.example.org/workshop.html", backendBaseUrl: "https://workshop-staging.example.org/pbp/", allowedParentOrigin: JOURNEY_INTEGRATION_PARENT_ORIGIN},
  syntheticOnly: true,
};

type Plain = Record<string, unknown>;
const LIMITS = {networkRequests: 0, registrationApproved: false, databaseVerified: false, sourceVerified: false, deploymentVerified: false, browserExecutionVerified: false, ownershipVerified: false, dnsVerified: false} as const;
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/u;
const COLUMN = /^[A-Za-z_][A-Za-z0-9_]{0,39}\.[A-Za-z_][A-Za-z0-9_]{0,39}$/u;
const NATIVE_STATUS = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/u;
const DNS_NAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const RESERVED_HOST = /(?:^|\.)(?:localhost|local|internal|test|invalid|localdomain|home|lan|corp|onion)$/u;
const PROHIBITED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const plain = (value: unknown): value is Plain => !!value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Reject non-JSON values without invoking getters or toJSON. The fixed-depth
 * envelope also bounds traversal before stringify or duplicate-key scanning. */
function jsonEnvelope(value: unknown): boolean {
  const seen = new Set<object>(); let nodes = 0;
  const visit = (item: unknown, depth: number): boolean => {
    if (++nodes > 180 || depth > 6) return false;
    if (item === null || typeof item === "boolean") return true;
    if (typeof item === "string") return item.length <= JOURNEY_INTEGRATION_MANIFEST_BYTES && ![...item].some(char => {const code = char.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff;});
    if (typeof item === "number") return Number.isFinite(item);
    if (typeof item !== "object" || seen.has(item)) return false;
    seen.add(item);
    if (Array.isArray(item)) return item.length <= 30 && item.every(child => visit(child, depth + 1));
    if (!plain(item)) return false;
    const keys = Reflect.ownKeys(item);
    if (keys.length > 30) return false;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (typeof key !== "string" || PROHIBITED_KEYS.has(key) || !("value" in descriptor) || !visit(descriptor.value, depth + 1)) return false;
    }
    return true;
  };
  return visit(value, 0);
}

function result(checks: JourneyIntegrationCheck[]): JourneyIntegrationPreflight {
  const errors = checks.filter(check => check.status === "error"), warnings = checks.filter(check => check.status === "warning");
  return {checks, errors, warnings, canRequestRegistration: errors.length === 0, limits: {...LIMITS}};
}

export function checkJourneyIntegrationManifest(value: unknown): JourneyIntegrationPreflight {
  const checks: JourneyIntegrationCheck[] = [];
  const add = (id: string, field: string, status: JourneyIntegrationCheck["status"], message: string, messageZh: string) => checks.push({id, field, status, message, messageZh});
  const test = (ok: boolean, id: string, field: string, ready: string, error: string, readyZh: string, errorZh: string) => add(id, field, ok ? "ready" : "error", ok ? ready : error, ok ? readyZh : errorZh);
  if (!jsonEnvelope(value) || new TextEncoder().encode(JSON.stringify(value)).byteLength > JOURNEY_INTEGRATION_MANIFEST_BYTES) {
    add("json-envelope", "$", "error", "Use an ordinary JSON object within 16 KiB, without accessors, duplicate references or excessive nesting.", "请使用16KiB以内的普通JSON对象，不能包含访问器、重复引用或过深嵌套。");return result(checks);
  }
  function shape(item: unknown, field: string, required: readonly string[], optional: readonly string[] = []): Plain | undefined {
    if (!plain(item)) {add(`shape:${field}`, field, "error", "This section must be a plain JSON object.", "这一部分必须是普通JSON对象。");return;}
    const missing = required.filter(key => !Object.hasOwn(item, key)), extra = Object.keys(item).filter(key => !required.includes(key) && !optional.includes(key));
    test(missing.length === 0 && extra.length === 0, `shape:${field}`, field, "The declared fields match manifest v1.", `Manifest v1 requires ${required.join(", ")}${optional.length ? `; optional: ${optional.join(", ")}` : ""}. Missing: ${missing.join(", ") || "none"}; unsupported: ${extra.join(", ") || "none"}.`, "字段符合v1清单结构。", `v1必填字段：${required.join("、")}${optional.length ? `；可选：${optional.join("、")}` : ""}。缺失：${missing.join("、") || "无"}；不支持：${extra.join("、") || "无"}。`);
    return item;
  }
  const root = shape(value, "$", ["version", "native", "bridge", "deployment", "syntheticOnly"]);
  if (!root) return result(checks);
  test(root.version === 1, "manifest-version", "version", "Manifest version 1 is supported.", "Set version to the number 1.", "支持v1清单。", "version必须是数字1。");
  test(root.syntheticOnly === true, "synthetic-only", "syntheticOnly", "Synthetic-only effects are explicitly declared.", "Set syntheticOnly:true and isolate all test data before requesting operator review.", "已明确声明仅使用虚构测试数据。", "必须声明syntheticOnly:true，并在申请运营方审查前隔离测试数据。");
  const native = shape(root.native, "native", ["stack", "schemaRevision", "receiptFields"], ["deploymentRevision", "statusValues"]);
  if (native) {
    for (const key of ["stack", "schemaRevision", ...(native.deploymentRevision !== undefined ? ["deploymentRevision"] : [])]) test(typeof native[key] === "string" && IDENTIFIER.test(native[key] as string), `native:${key}`, `native.${key}`, "A bounded native implementation identifier is declared.", "Use a 1–80 character identifier starting with a letter; letters, digits, dot, underscore and hyphen only.", "已填写有长度限制的原生实现标识。", "标识须为1–80字符、以字母开头，仅可包含字母、数字、点、下划线及连字符。");
    const fields = shape(native.receiptFields, "native.receiptFields", JOURNEY_INTEGRATION_RECEIPT_FIELDS);
    if (fields) {
      const mapped = new Map<string, string>();
      for (const field of JOURNEY_INTEGRATION_RECEIPT_FIELDS) {
        const path = fields[field], valid = typeof path === "string" && COLUMN.test(path), duplicate = valid ? mapped.get(path.toLowerCase()) : undefined;
        test(valid && !duplicate, `mapping:${field}`, `native.receiptFields.${field}`, "A distinct native table.column source is declared.", duplicate ? `This column already maps ${duplicate}. Declare a distinct native source for ${field}.` : "Declare the actual native table.column source, without SQL, JSON paths, transformations or credentials.", "已声明唯一的原生table.column字段来源。", duplicate ? `该字段已经映射${duplicate}；请为${field}声明不同的原生来源。` : "请填写实际的原生table.column，不接受SQL、JSON路径、转换表达式或凭据。");
        if (valid && !duplicate) mapped.set(path.toLowerCase(), field);
      }
    }
    if (native.statusValues !== undefined) {
      const statuses = native.statusValues, entries = plain(statuses) ? Object.entries(statuses) : [];
      const valid = entries.length === 2 && entries.every(([key, target]) => NATIVE_STATUS.test(key) && (target === "active" || target === "cancelled"))
        && new Set(entries.map(([key]) => key.toLowerCase())).size === 2 && new Set(entries.map(([, target]) => target)).size === 2;
      test(valid, "native-status-values", "native.statusValues", "The two declared native states map distinctly to active and cancelled.", "Declare exactly two distinct native status names, mapping one to active and one to cancelled.", "两个原生状态分别声明映射至active及cancelled。", "须声明两个不同的原生状态，分别映射至active及cancelled。");
    } else add("native-status-values", "native.statusValues", "warning", "No status translation is declared. The operator must confirm the adapter returns active/cancelled from its actual native states.", "未声明状态转换；运营方仍须确认适配器如何把真实原生状态转换为active/cancelled。");
    if (native.deploymentRevision === undefined) add("native-deployment-revision", "native.deploymentRevision", "warning", "The native deployment revision is omitted; it must be separately declared during operator registration.", "尚未声明原生部署版本；申请运营方登记时仍须单独提供。");
  }
  const bridge = shape(root.bridge, "bridge", ["protocol", "recipe", "revision"], ["backendProtocol", "supportedActions"]);
  if (bridge) {
    test(bridge.protocol === SELLER_BRIDGE_PROTOCOL, "bridge-protocol", "bridge.protocol", "The cooperative seller bridge protocol is named.", `Set protocol to ${SELLER_BRIDGE_PROTOCOL}; an HTTP backend protocol is a different declaration.`, "已声明合作式卖家浏览器bridge协议。", `protocol须为${SELLER_BRIDGE_PROTOCOL}；后端HTTP协议是另一项声明。`);
    test(bridge.recipe === "booking-lifecycle-20-v1", "bridge-recipe", "bridge.recipe", "The existing fixed 20-step recipe is named.", "Only booking-lifecycle-20-v1 is supported; another step count or recipe requires separate implementation.", "已声明现有固定20步配方。", "仅支持booking-lifecycle-20-v1；其他步数或配方需要另行实现。");
    test(typeof bridge.revision === "string" && IDENTIFIER.test(bridge.revision), "bridge-revision", "bridge.revision", "A separate bridge revision is declared.", "Declare a 1–80 character bridge revision identifier; do not substitute a schema version or URL.", "已单独声明bridge版本。", "请填写1–80字符的bridge版本标识，不要以数据库schema版本或网址代替。");
    if (bridge.backendProtocol !== undefined) test(bridge.backendProtocol === "booking-lifecycle-http-v1", "backend-protocol", "bridge.backendProtocol", "The booking lifecycle HTTP protocol is separately declared.", "The backendProtocol, when supplied, must be booking-lifecycle-http-v1.", "已单独声明预约生命周期HTTP协议。", "如提供backendProtocol，其值必须为booking-lifecycle-http-v1。");
    if (bridge.supportedActions !== undefined) test(Array.isArray(bridge.supportedActions) && JSON.stringify(bridge.supportedActions) === JSON.stringify(SELLER_BRIDGE_ACTION_IDS), "bridge-actions", "bridge.supportedActions", "The eleven declared bridge actions match the canonical action inventory; server readbacks remain the main application's responsibility.", "Declare exactly the eleven bridge action IDs in canonical order; do not declare twenty seller-generated observations.", "声明的11项bridge动作符合约定顺序；服务器回读仍由主站执行。", "请按约定顺序声明准确的11项bridge动作，不要声明由卖家产生20项观测。");
  }
  const deployment = shape(root.deployment, "deployment", ["frontendEntryUrl", "backendBaseUrl", "allowedParentOrigin"]);
  if (deployment) {
    test(deployment.allowedParentOrigin === JOURNEY_INTEGRATION_PARENT_ORIGIN, "parent-origin", "deployment.allowedParentOrigin", "The bridge parent is exactly the known main application origin.", `Use the exact main application origin ${JOURNEY_INTEGRATION_PARENT_ORIGIN}, without slash, wildcard or another host.`, "bridge父页面来源与已知主站完全一致。", `须准确填写主站origin ${JOURNEY_INTEGRATION_PARENT_ORIGIN}，不能添加斜杠、通配符或其他主机。`);
    function target(raw: unknown, field: string, kind: "frontend" | "backend"): URL | undefined {
      let url: URL | undefined;
      if (typeof raw === "string" && raw.length > 0 && raw.length <= 500 && /^[\x21-\x7e]+$/u.test(raw) && !/[\\%?#]/u.test(raw) && !/(?:^|\/)\.{1,2}(?:\/|$)/u.test(raw)) {try {url = new URL(raw);} catch {/* Report the bounded configuration error below. */}}
      const valid = !!url && url.href === raw && url.protocol === "https:" && !url.username && !url.password && !url.port && !url.search && !url.hash
        && DNS_NAME.test(url.hostname) && !RESERVED_HOST.test(url.hostname) && !url.pathname.includes("//") && url.pathname.length <= 250
        && url.origin !== JOURNEY_INTEGRATION_PARENT_ORIGIN
        && (kind === "frontend" ? /^\/(?:[A-Za-z0-9_~-]+\/)*[A-Za-z0-9_~-]+\.html$/u.test(url.pathname) : /^\/(?:[A-Za-z0-9_~-]+\/)*$/u.test(url.pathname));
      test(valid, `url:${kind}`, field, "A canonical HTTPS staging URL is declared outside the main application.", "Use a canonical public-host HTTPS URL outside the main app, without credentials, port, query, fragment, encoded/traversal paths or private/local/IP host. Frontend needs an HTML file; backend needs a trailing-slash directory.", "已声明主站之外的规范HTTPS测试网址。", "须使用主站之外、公开域名下的规范HTTPS网址；不能含凭据、端口、查询、片段、编码或跳转路径、内网/本地/IP主机。前端须为HTML文件，后端须以目录斜杠结尾。");
      return valid ? url : undefined;
    }
    const frontend = target(deployment.frontendEntryUrl, "deployment.frontendEntryUrl", "frontend"), backend = target(deployment.backendBaseUrl, "deployment.backendBaseUrl", "backend");
    if (frontend && backend) {
      test(frontend.origin === backend.origin, "seller-same-origin", "deployment", "Seller frontend and backend share the same staging origin.", "The seller frontend and backend must have exactly the same scheme and host; cross-origin staging is unsupported by this bridge.", "卖家前后端位于同一测试origin。", "卖家前后端必须使用完全相同的协议及主机；此bridge不支持跨origin部署。");
      if (/(?:^|\.)(?:example\.com|example\.org|example\.net)$/u.test(frontend.hostname) || /(?:^|\.)(?:example\.com|example\.org|example\.net)$/u.test(backend.hostname)) add("illustrative-host", "deployment", "warning", "These are illustrative example domains. Replace them with the actual authorised staging host before sending an operator registration request.", "当前为示例域名；正式向运营方申请登记前，须替换为已获授权的真实测试主机。");
    }
  }
  add("declaration-only", "$", "warning", "This checks only JSON declarations. It does not verify a datastore, adapter, schema, source, deployed revision, DNS, endpoint ownership, test execution or synthetic isolation.", "本检查仅核对JSON声明，不验证数据库、适配器、schema、源码、运行版本、DNS、网址所有权、实际执行或测试数据隔离。");
  add("operator-registration", "$", "warning", "A ready result permits preparing an operator review request only. No registration is installed or approved, no test runs, and no acceptance or payment occurs.", "准备就绪只表示可以准备运营方审查申请；不会安装或批准登记、运行测试、接受交付或付款。");
  return result(checks);
}

/** JSON.parse alone silently accepts repeated member names. Reject them,
 * including escaped spellings, so the textarea never conceals a declaration. */
function duplicateJsonKeys(text: string): boolean {
  let cursor = 0, duplicate = false;
  const space = () => {while (/\s/u.test(text[cursor] ?? "") && cursor < text.length) cursor++;};
  const string = (): string => {const start = cursor++;while (cursor < text.length) {const char = text[cursor++];if (char === "\\") cursor++;else if (char === '"') break;}return JSON.parse(text.slice(start, cursor));};
  const value = (): void => {
    space();const char = text[cursor];
    if (char === "{") {cursor++;space();const keys = new Set<string>();if (text[cursor] === "}") {cursor++;return;}while (cursor < text.length) {space();const key = string();if (keys.has(key)) duplicate = true;keys.add(key);space();cursor++;value();space();if (text[cursor++] === "}") return;}}
    else if (char === "[") {cursor++;space();if (text[cursor] === "]") {cursor++;return;}while (cursor < text.length) {value();space();if (text[cursor++] === "]") return;}}
    else if (char === '"') string();
    else {while (cursor < text.length && !/[\s,}\]]/u.test(text[cursor])) cursor++;}
  };
  value();return duplicate;
}

export function parseJourneyIntegrationManifest(text: string): JourneyIntegrationPreflight {
  const failure = (id: string, message: string, messageZh: string) => result([{id, field: "$", status: "error", message, messageZh}]);
  if (typeof text !== "string" || !text.trim() || new TextEncoder().encode(text).byteLength > JOURNEY_INTEGRATION_MANIFEST_BYTES) return failure("json-size", "Paste a nonempty JSON manifest of at most 16 KiB.", "请粘贴非空、16KiB以内的JSON清单。");
  let value: unknown;try {value = JSON.parse(text);} catch {return failure("json-syntax", "The manifest is not valid JSON. Check commas, quotes and brackets.", "清单不是有效JSON；请检查逗号、引号及括号。");}
  const checked = checkJourneyIntegrationManifest(value);
  if (checked.checks[0]?.id !== "json-envelope" && duplicateJsonKeys(text)) return failure("duplicate-json-key", "Repeated JSON member names are unsupported, including escaped duplicates. Keep one declaration per field.", "不允许重复JSON字段名，包括转义后重复的字段；每个字段只能声明一次。");
  return checked;
}
