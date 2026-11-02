import assert from "node:assert/strict";
import test from "node:test";
import {approvedRuntimeRegistration, parseRuntimeRegistrations, registrationTarget, safeRuntimeTargetDescriptor,
  sameRuntimeRegistration, validateRuntimeRegistrationSnapshot, type RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

const now = Date.parse("2026-11-02T00:00:00.000Z");
const sample: RuntimeRegistrationSnapshot = {id: "merchant-staging", label: "Merchant staging booking API", registrationRevision: "registration-1",
  projectId: "cbbf49f4-cbc8-4b5a-acb7-12d27f847b79", protocol: "booking-http-v2", baseUrl: "https://staging.example.org/pbp/", deploymentRevision: "deployment-abc123",
  frontendBundleDigest: "a".repeat(64), backendArtifactDigest: "b".repeat(64), backendSourceCommit: "c".repeat(40),
  expiresAt: "2026-11-03T00:00:00.000Z", testOnly: true, provenance: "operator-approved-declaration"};
const parsed = () => parseRuntimeRegistrations(JSON.stringify([sample]));

test("operator registrations are canonical, cloned and separately scoped from built-in targets", () => {
  assert.deepEqual(parseRuntimeRegistrations(undefined), []); assert.deepEqual(parseRuntimeRegistrations(""), []); assert.deepEqual(parseRuntimeRegistrations("[]"), []);
  const records = parsed(); assert.deepEqual(records, [sample]);
  const output = approvedRuntimeRegistration(records, sample.projectId, sample.id, "booking-http-v2", sample.frontendBundleDigest, now);
  assert.deepEqual(output, sample); output.label = "external mutation"; assert.equal(records[0].label, sample.label);
  const reordered = Object.fromEntries(Object.entries(sample).reverse()); assert.equal(sameRuntimeRegistration(sample, reordered), true);
  assert.deepEqual(registrationTarget(sample), {id: sample.id, label: sample.label, baseUrl: sample.baseUrl, revision: sample.deploymentRevision, protocol: sample.protocol, testOnly: true});
});

test("project, protocol, exact frontend digest and expiry must all match current approval", () => {
  const records = parsed(), before = structuredClone(records);
  assert.throws(() => approvedRuntimeRegistration(records, "other-project", sample.id, sample.protocol, sample.frontendBundleDigest, now), /unavailable for this project/u);
  assert.throws(() => approvedRuntimeRegistration(records, sample.projectId, "unregistered", sample.protocol, sample.frontendBundleDigest, now), /unavailable for this project/u);
  assert.throws(() => approvedRuntimeRegistration(records, sample.projectId, sample.id, "booking-http-v1", sample.frontendBundleDigest, now), /agreed protocol/u);
  assert.throws(() => approvedRuntimeRegistration(records, sample.projectId, sample.id, sample.protocol, "d".repeat(64), now), /exact upload/u);
  assert.throws(() => approvedRuntimeRegistration(records, sample.projectId, sample.id, sample.protocol, "not-a-digest", now));
  for (const at of [Date.parse(sample.expiresAt), Date.parse(sample.expiresAt) + 1]) assert.throws(() => approvedRuntimeRegistration(records, sample.projectId, sample.id, sample.protocol, undefined, at), /expired/u);
  assert.throws(() => approvedRuntimeRegistration(records, sample.projectId, sample.id, sample.protocol, undefined, NaN));
  assert.deepEqual(records, before);
  // Expired saved evidence is still structurally readable; it simply cannot
  // authorize another HTTP run or be silently renewed by the parser.
  assert.deepEqual(validateRuntimeRegistrationSnapshot({...sample, expiresAt: "2020-01-01T00:00:00.000Z"}).expiresAt, "2020-01-01T00:00:00.000Z");
});

test("safe selector descriptors contain no URL, artifact hash, source commit or project identity", () => {
  const descriptor = safeRuntimeTargetDescriptor(sample);
  assert.deepEqual(descriptor, {id: sample.id, label: sample.label, protocol: sample.protocol, revision: sample.deploymentRevision,
    registrationRevision: sample.registrationRevision, expiresAt: sample.expiresAt, kind: "registered", frontendBundleDigest: sample.frontendBundleDigest});
  assert.ok(!JSON.stringify(descriptor).includes("https://"));
  for (const key of ["baseUrl", "projectId", "backendArtifactDigest", "backendSourceCommit", "provenance", "credentials", "token"]) assert.equal(Object.hasOwn(descriptor, key), false);
});

test("full frozen declarations detect retargeting even when ID and revision are unchanged", () => {
  for (const patch of [
    {baseUrl: "https://different.example.org/pbp/"}, {baseUrl: "https://staging.example.org/other-path/"},
    {deploymentRevision: "different-deploy"}, {frontendBundleDigest: "d".repeat(64)}, {backendArtifactDigest: "d".repeat(64)},
    {backendSourceCommit: "e".repeat(64)}, {projectId: "another-project"}, {protocol: "booking-http-v1"},
    {registrationRevision: "registration-2"}, {expiresAt: "2026-12-03T00:00:00.000Z"}, {label: "Changed declaration"},
  ]) assert.equal(sameRuntimeRegistration(sample, {...sample, ...patch}), false, JSON.stringify(patch));
  assert.equal(sameRuntimeRegistration(sample, {...sample, token: "not accepted"}), false);
  assert.equal(sameRuntimeRegistration(null, null), false);
});

test("registry rejects unsafe, normalized or credential-bearing URLs before a target can be produced", () => {
  for (const baseUrl of [
    "http://staging.example.org/pbp/", "https://user:password@staging.example.org/pbp/", "https://staging.example.org/pbp/?token=x", "https://staging.example.org/pbp/#x",
    "https://staging.example.org/pbp/?", "https://staging.example.org/pbp/#",
    "https://127.0.0.1/pbp/", "https://2130706433/pbp/", "https://[::1]/pbp/", "https://192.168.1.10/pbp/", "https://metadata.internal/pbp/",
    "https://staging.example.org/a/../pbp/", "https://staging.example.org/pbp/%2e%2e/", "https://staging.example.org//pbp/", "https://staging.example.org/pbp\\other/",
    "https://STAGING.example.org/pbp/", "https://staging.example.org:443/pbp/", "https://staging.example.org/pbp",
  ]) assert.throws(() => validateRuntimeRegistrationSnapshot({...sample, baseUrl}), baseUrl);
});

test("unknown fields, malformed manifest declarations, reserved IDs and duplicate IDs fail closed", () => {
  for (const id of ["lab-flawed", "lab-fixed", "lab-policy-flawed", "lab-policy-fixed", "lab-future-example", "LAB-fixed"]) {
    assert.throws(() => validateRuntimeRegistrationSnapshot({...sample, id}), /cannot be overridden/u);
  }
  for (const patch of [
    {headers: {Authorization: "must not be stored"}}, {url: sample.baseUrl}, {testOnly: false}, {provenance: "cryptographic-attestation"},
    {projectId: "wrong/project"}, {id: " "+sample.id}, {registrationRevision: "rev/2"}, {label: "Hidden\u202e label"},
    {frontendBundleDigest: "A".repeat(64)}, {backendArtifactDigest: "short"}, {backendSourceCommit: "git-tag"},
    {backendSourceCommit: "C".repeat(40)}, {backendSourceCommit: "a".repeat(41)}, {expiresAt: "2026-11-03"},
    {expiresAt: "2026-11-03T01:00:00.000+01:00"}, {expiresAt: "2026-02-30T00:00:00.000Z"},
  ]) assert.throws(() => validateRuntimeRegistrationSnapshot({...sample, ...patch}), JSON.stringify(patch));
  const inherited = Object.create({hidden: true}); Object.assign(inherited, sample); assert.throws(() => validateRuntimeRegistrationSnapshot(inherited));
  assert.throws(() => parseRuntimeRegistrations(JSON.stringify([sample, {...sample, projectId: "another-project"}])));
  for (const value of ["null", "{}", "[null]", "invalid-json", "[\"url\"]"]) assert.throws(() => parseRuntimeRegistrations(value));
});

test("configuration is bounded in UTF-8 bytes and number of registrations", () => {
  const entries = Array.from({length: 20}, (_, i) => ({...sample, id: `merchant-${i}`}));
  assert.equal(parseRuntimeRegistrations(JSON.stringify(entries)).length, 20);
  assert.throws(() => parseRuntimeRegistrations(JSON.stringify([...entries, {...sample, id: "merchant-20"}])));
  assert.throws(() => parseRuntimeRegistrations(" ".repeat(32*1024+1)));
  const manyBytes = JSON.stringify(entries.map(row => ({...row, label: "中".repeat(100), deploymentRevision: "中".repeat(120), baseUrl: `https://staging.example.org/${"p".repeat(470)}/`})));
  assert.ok(manyBytes.length < 32*1024); assert.ok(new TextEncoder().encode(manyBytes).byteLength > 32*1024);
  assert.throws(() => parseRuntimeRegistrations(manyBytes), /32 KiB/u);
});
