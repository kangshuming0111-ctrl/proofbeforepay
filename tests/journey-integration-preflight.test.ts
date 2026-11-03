import assert from "node:assert/strict";
import test from "node:test";
import {SELLER_BRIDGE_ACTION_IDS} from "../lib/seller-journey-bridge.ts";
import {checkJourneyIntegrationManifest, parseJourneyIntegrationManifest, JOURNEY_INTEGRATION_TEMPLATE, JOURNEY_INTEGRATION_PARENT_ORIGIN, type JourneyIntegrationManifest} from "../lib/journey-integration-preflight.ts";

function manifest(): JourneyIntegrationManifest {return structuredClone(JOURNEY_INTEGRATION_TEMPLATE);}
function errors(value: unknown): string[] {return checkJourneyIntegrationManifest(value).errors.map(error => error.id);}
function rejectsURL(frontend: string, backend?: string): void {
  const value = manifest();value.deployment.frontendEntryUrl = frontend;if (backend) value.deployment.backendBaseUrl = backend;
  const report = checkJourneyIntegrationManifest(value);assert.equal(report.canRequestRegistration, false, frontend);assert.ok(report.errors.some(error => error.id === "url:frontend" || error.id === "seller-same-origin"), frontend);
}

test("a complete Python native mapping is locally ready to request operator review while every execution claim stays unverified", () => {
  const value = manifest(), before = structuredClone(value), report = parseJourneyIntegrationManifest(JSON.stringify(value));
  assert.equal(report.canRequestRegistration, true);assert.equal(report.errors.length, 0);assert.ok(report.checks.some(check => check.id === "mapping:id" && check.status === "ready"));
  assert.ok(report.warnings.some(warning => warning.id === "operator-registration"));assert.ok(report.warnings.some(warning => warning.id === "declaration-only"));assert.ok(report.warnings.some(warning => warning.id === "illustrative-host"));
  assert.deepEqual(report.limits, {networkRequests: 0, registrationApproved: false, databaseVerified: false, sourceVerified: false, deploymentVerified: false, browserExecutionVerified: false, ownershipVerified: false, dnsVerified: false});
  assert.equal(report.checks.filter(check => check.id.startsWith("mapping:")).length, 9);assert.deepEqual(value, before);
  for (const check of report.checks) {assert.ok(check.message);assert.ok(check.messageZh);assert.ok(check.field);}
});

test("every required canonical receipt field needs a distinct actual table.column mapping", () => {
  const missing = manifest();delete (missing.native.receiptFields as Partial<typeof missing.native.receiptFields>).marker;
  assert.ok(errors(missing).includes("shape:native.receiptFields"));assert.ok(errors(missing).includes("mapping:marker"));
  const duplicate = manifest();duplicate.native.receiptFields.idempotencyKey = duplicate.native.receiptFields.id;assert.ok(errors(duplicate).includes("mapping:idempotencyKey"));
  const caseAlias = manifest();caseAlias.native.receiptFields.idempotencyKey = caseAlias.native.receiptFields.id.toUpperCase();assert.ok(errors(caseAlias).includes("mapping:idempotencyKey"));
  for (const path of ["id", "$.booking.id", "enrolments.ref + 1", "select id from enrolments", "enrolments..id", "enrolments.id.secret", " enrolements.id", "enrolments.id\n", "constructor.id"]) {
    const value = manifest();value.native.receiptFields.id = path;const report = checkJourneyIntegrationManifest(value);
    if (path === "constructor.id") assert.equal(report.canRequestRegistration, true, "A column identifier is declared data, never property traversal");
    else {assert.equal(report.canRequestRegistration, false, path);assert.ok(report.errors.some(error => error.id === "mapping:id"), path);}
  }
});

test("native states are declared translations and cannot merge two states or smuggle expressions", () => {
  for (const states of [{confirmed: "active", withdrawn: "active"}, {confirmed: "active"}, {confirmed: "active", withdrawn: "cancelled", pending: "active"}, {"confirmed -> active": "active", withdrawn: "cancelled"}, {Confirmed: "active", confirmed: "cancelled"}]) {
    const value = manifest();value.native.statusValues = states as unknown as typeof value.native.statusValues;assert.ok(errors(value).includes("native-status-values"));
  }
  const direct = manifest();delete direct.native.statusValues;delete direct.native.deploymentRevision;
  const report = checkJourneyIntegrationManifest(direct);assert.equal(report.canRequestRegistration, true);assert.ok(report.warnings.some(check => check.id === "native-status-values"));assert.ok(report.warnings.some(check => check.id === "native-deployment-revision"));
});

test("version, synthetic consent, nested unknown fields and malformed native identifiers fail closed", () => {
  for (const mutate of [
    (value: Record<string, unknown>) => {value.version = "1";},
    (value: Record<string, unknown>) => {value.syntheticOnly = false;},
    (value: Record<string, unknown>) => {value.registrationApproved = true;},
    (value: Record<string, unknown>) => {(value.native as Record<string, unknown>).credential = "not-a-real-credential";},
    (value: Record<string, unknown>) => {(value.native as Record<string, unknown>).schemaRevision = "https://wrong.example.org/";},
    (value: Record<string, unknown>) => {(value.native as Record<string, unknown>).stack = "python sqlite";},
    (value: Record<string, unknown>) => {(value.deployment as Record<string, unknown>).authorization = "not-supported";},
  ]) {const value = manifest() as unknown as Record<string, unknown>;mutate(value);assert.equal(checkJourneyIntegrationManifest(value).canRequestRegistration, false);}
  for (const value of [null, [], "text", 1, {version: 1}]) assert.equal(checkJourneyIntegrationManifest(value).canRequestRegistration, false);
});

test("bridge protocol and recipe are exact and action declarations cannot substitute twenty seller observations", () => {
  for (const [key, value] of [["protocol", "booking-lifecycle-http-v1"], ["recipe", "booking-lifecycle-31-v1"], ["backendProtocol", "booking-http-v4"], ["revision", " "]] as const) {
    const input = manifest();input.bridge[key] = value as never;assert.equal(checkJourneyIntegrationManifest(input).canRequestRegistration, false);
  }
  for (const actions of [[...SELLER_BRIDGE_ACTION_IDS].reverse(), [...SELLER_BRIDGE_ACTION_IDS, "merchant_readback"], SELLER_BRIDGE_ACTION_IDS.slice(0, 10), [...SELLER_BRIDGE_ACTION_IDS.slice(0, 10), "create"]]) {
    const input = manifest();input.bridge.supportedActions = actions;assert.ok(errors(input).includes("bridge-actions"));
  }
  const defective = manifest();defective.native.deploymentRevision = "florist-workshop-python-move-loss-v1";defective.bridge.revision = "lifecycle-move-loss-v1";
  assert.equal(checkJourneyIntegrationManifest(defective).canRequestRegistration, true, "The declaration lint must not claim to discover a runtime defect");
});

test("only the known parent origin is accepted and staging cannot point into the main app", () => {
  for (const parent of [`${JOURNEY_INTEGRATION_PARENT_ORIGIN}/`, "*", "null", "https://other-main.example.org", "http://briefpay-kang-lab.blueheron8.chatgpt.site", `${JOURNEY_INTEGRATION_PARENT_ORIGIN}:443`, `${JOURNEY_INTEGRATION_PARENT_ORIGIN}.attacker.org`, `${JOURNEY_INTEGRATION_PARENT_ORIGIN}/path`]) {
    const input = manifest();input.deployment.allowedParentOrigin = parent as typeof input.deployment.allowedParentOrigin;assert.ok(errors(input).includes("parent-origin"), parent);
  }
  rejectsURL(`${JOURNEY_INTEGRATION_PARENT_ORIGIN}/seller.html`, `${JOURNEY_INTEGRATION_PARENT_ORIGIN}/pbp/`);
  rejectsURL("https://seller-one.example.org/workshop.html", "https://seller-two.example.org/pbp/");
});

test("canonical HTTPS rejects credentials, ports, ambiguous or encoded paths, queries and fragments", () => {
  for (const frontend of ["http://workshop-staging.example.org/workshop.html", "https://user:pass@workshop-staging.example.org/workshop.html", "https://workshop-staging.example.org:443/workshop.html", "https://workshop-staging.example.org:8443/workshop.html", "https://WORKSHOP-staging.example.org/workshop.html", "https://workshop-staging.example.org/../workshop.html", "https://workshop-staging.example.org/./workshop.html", "https://workshop-staging.example.org/%2e%2e/workshop.html", "https://workshop-staging.example.org/a//workshop.html", "https://workshop-staging.example.org\\workshop.html", "https://workshop-staging.example.org/workshop.html?", "https://workshop-staging.example.org/workshop.html#", "https://workshop-staging.example.org/workshop.html?key=hidden", "https://workshop-staging.example.org/workshop", "https://workshop-staging.example.org/workshop.html\n"]) rejectsURL(frontend);
  const noSlash = manifest();noSlash.deployment.backendBaseUrl = "https://workshop-staging.example.org/pbp";assert.ok(errors(noSlash).includes("url:backend"));
});

test("private/local/IP spellings cannot masquerade as staging DNS hosts", () => {
  for (const host of ["localhost", "seller.localhost", "127.0.0.1", "127.1", "2130706433", "0x7f000001", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254", "8.8.8.8", "[::1]", "[fd00::1]", "[::ffff:127.0.0.1]", "workshop.internal", "workshop.local", "workshop.invalid", "workshop.test", "workshop.lan", "workshop.home"]) rejectsURL(`https://${host}/workshop.html`, `https://${host}/pbp/`);
});

test("textarea parsing reports invalid JSON, duplicate escaped keys and UTF-8 byte limits", () => {
  for (const text of ["", "{", "{\"version\":1,}", "// comment\n{}", "界".repeat(6000)]) assert.equal(parseJourneyIntegrationManifest(text).canRequestRegistration, false);
  const text = JSON.stringify(manifest()), duplicated = text.replace('"syntheticOnly":true', '"syntheticOnly":false,"syntheticOnly":true');
  assert.equal(parseJourneyIntegrationManifest(duplicated).errors[0].id, "duplicate-json-key");
  const escaped = text.replace('"id":"enrolments.enrolment_ref"', '"id":"fake.column","\\u0069d":"enrolments.enrolment_ref"');
  assert.equal(parseJourneyIntegrationManifest(escaped).errors[0].id, "duplicate-json-key");
  assert.equal(parseJourneyIntegrationManifest('"a root string"').canRequestRegistration, false);
});

test("pure preflight never calls network or getters, mutates a manifest or approves a registration", () => {
  let networkCalls = 0, getterCalls = 0;const previous = globalThis.fetch;
  globalThis.fetch = (() => {networkCalls++;throw new Error("Preflight must not fetch");}) as typeof fetch;
  try {
    const value = manifest(), before = structuredClone(value);checkJourneyIntegrationManifest(value);assert.deepEqual(value, before);
    const getter = {get version() {getterCalls++;return 1;}};assert.equal(checkJourneyIntegrationManifest(getter).canRequestRegistration, false);assert.equal(getterCalls, 0);
    const cyclic: Record<string, unknown> = {};cyclic.self = cyclic;assert.equal(checkJourneyIntegrationManifest(cyclic).canRequestRegistration, false);
    const exotic = Object.create({version: 1});assert.equal(checkJourneyIntegrationManifest(exotic).canRequestRegistration, false);
    assert.equal(parseJourneyIntegrationManifest('{"__proto__":{"approved":true}}').canRequestRegistration, false);
    assert.equal(checkJourneyIntegrationManifest({...manifest(), native: {toJSON() {throw new Error("Must not call toJSON");}}}).canRequestRegistration, false);
    assert.equal(networkCalls, 0);
  } finally {globalThis.fetch = previous;}
});
