import {DomainError} from "./domain.ts";
import {runtimeDeliveryDigest, runtimeIdentifier, validateRuntimeTarget, type RuntimeCheckPlan, type RuntimeCheckTarget} from "./runtime-checks.ts";

/** An operator-approved association between a submitted frontend bundle and a
 * separate staging deployment. Even matching backend hashes remain declarations,
 * not proof that the deployment was built from an uploaded source archive. */
export type RuntimeRegistrationSnapshot = {
  id: string;
  label: string;
  registrationRevision: string;
  projectId: string;
  protocol: RuntimeCheckPlan["protocol"];
  baseUrl: string;
  deploymentRevision: string;
  frontendBundleDigest: string;
  backendArtifactDigest?: string;
  backendSourceCommit?: string;
  expiresAt: string;
  testOnly: true;
  provenance: "operator-approved-declaration";
};

export type RuntimeRegistrationDescriptor = Pick<RuntimeRegistrationSnapshot,
  "id"|"label"|"protocol"|"registrationRevision"|"expiresAt"|"frontendBundleDigest"> & {
  revision: string;
  kind: "registered";
};

export const RUNTIME_REGISTRATION_LIMIT = 20;
export const RUNTIME_REGISTRY_BYTE_LIMIT = 32 * 1024;
const KEYS = new Set(["id", "label", "registrationRevision", "projectId", "protocol", "baseUrl", "deploymentRevision",
  "frontendBundleDigest", "backendArtifactDigest", "backendSourceCommit", "expiresAt", "testOnly", "provenance"]);
const CONTROL_OR_FORMAT = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/u;
const COMMIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new DomainError("A runtime registration must be a plain object.");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > max || CONTROL_OR_FORMAT.test(value)) {
    throw new DomainError(`${name} is invalid.`);
  }
  return value;
}
function protocol(value: unknown): RuntimeCheckPlan["protocol"] {
  if (value !== "booking-http-v1" && value !== "booking-http-v2" && value !== "booking-http-v3" && value !== "booking-http-v4") throw new DomainError("Choose a supported registered backend protocol.");
  return value;
}
function expiry(value: unknown): string {
  const result = text(value, "Runtime registration expiry", 24);
  const time = Date.parse(result);
  if (!ISO_UTC.test(result) || !Number.isFinite(time) || new Date(time).toISOString() !== result) {
    throw new DomainError("Runtime registration expiry must be a canonical UTC ISO timestamp.");
  }
  return result;
}

/** Strictly validate the saved shape without deciding whether it may be used
 * now. Expired historical snapshots stay readable and are never silently renewed. */
export function validateRuntimeRegistrationSnapshot(value: unknown): RuntimeRegistrationSnapshot {
  const input = object(value);
  if (Object.keys(input).some(key => !KEYS.has(key)) || input.testOnly !== true || input.provenance !== "operator-approved-declaration") {
    throw new DomainError("A runtime registration must retain its explicit test-only declaration and supported fields.");
  }
  const id = runtimeIdentifier(input.id, "Runtime registration ID");
  // The entire namespace is reserved so future built-in fixture IDs cannot be
  // shadowed by a registration that was accepted before that fixture existed.
  if (/^lab-/iu.test(id)) throw new DomainError("Built-in lab target IDs cannot be overridden by a runtime registration.");
  const label = text(input.label, "Runtime registration label", 100);
  const registrationRevision = runtimeIdentifier(input.registrationRevision, "Runtime registration revision");
  const projectId = runtimeIdentifier(input.projectId, "Runtime registration project ID");
  const selectedProtocol = protocol(input.protocol);
  const deploymentRevision = text(input.deploymentRevision, "Runtime deployment revision", 120);
  const baseUrl = text(input.baseUrl, "Runtime registration URL", 500);
  // URL.search/hash are empty for a dangling '?' or '#', while URL.href keeps
  // the delimiter. Such a base would never prefix its resolved protocol paths.
  if (/[?#]/u.test(baseUrl)) throw new DomainError("Runtime registration URL cannot contain a query or fragment delimiter.");
  const target = validateRuntimeTarget({id, label, baseUrl, revision: deploymentRevision, protocol: selectedProtocol, testOnly: true});
  // The trusted registry itself must be canonical. Do not silently normalize a
  // path, host or default port while retaining a different saved fingerprint.
  if (target.baseUrl !== baseUrl) throw new DomainError("Runtime registration URL must be a canonical HTTPS directory URL.");
  const frontendBundleDigest = runtimeDeliveryDigest(input.frontendBundleDigest);
  const backendArtifactDigest = input.backendArtifactDigest === undefined ? undefined : runtimeDeliveryDigest(input.backendArtifactDigest);
  const backendSourceCommit = input.backendSourceCommit === undefined ? undefined : text(input.backendSourceCommit, "Declared backend source commit", 64);
  if (backendSourceCommit !== undefined && !COMMIT.test(backendSourceCommit)) throw new DomainError("Declared backend source commit must be 40 or 64 lowercase hexadecimal characters.");
  const expiresAt = expiry(input.expiresAt);
  return {id, label, registrationRevision, projectId, protocol: selectedProtocol, baseUrl, deploymentRevision, frontendBundleDigest,
    ...(backendArtifactDigest === undefined ? {} : {backendArtifactDigest}), ...(backendSourceCommit === undefined ? {} : {backendSourceCommit}),
    expiresAt, testOnly: true, provenance: "operator-approved-declaration"};
}

function registrations(value: unknown): RuntimeRegistrationSnapshot[] {
  if (!Array.isArray(value) || value.length > RUNTIME_REGISTRATION_LIMIT) throw new DomainError("Runtime registry must contain at most 20 registration entries.");
  const result = value.map(validateRuntimeRegistrationSnapshot);
  if (new Set(result.map(item => item.id)).size !== result.length) throw new DomainError("Runtime registry IDs must be unique across projects.");
  return result;
}

/** Parse only explicitly supplied server configuration. This module never reads
 * environment variables, makes network requests or accepts a caller URL. */
export function parseRuntimeRegistrations(value: string | undefined): RuntimeRegistrationSnapshot[] {
  if (value === undefined || value === "") return [];
  if (typeof value !== "string" || new TextEncoder().encode(value).byteLength > RUNTIME_REGISTRY_BYTE_LIMIT) {
    throw new DomainError("Runtime registry configuration must be at most 32 KiB of JSON.");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new DomainError("Runtime registry configuration must be a JSON array."); }
  return registrations(parsed);
}

/** Resolve an explicitly approved project target. Supplying no digest is only
 * for listing available registrations; upload/run callers must supply the exact
 * saved frontend digest before external writes are allowed. */
export function approvedRuntimeRegistration(
  entries: readonly RuntimeRegistrationSnapshot[], projectId: unknown, targetId: unknown,
  selectedProtocol: RuntimeCheckPlan["protocol"], digest?: string, now = Date.now(),
): RuntimeRegistrationSnapshot {
  const project = runtimeIdentifier(projectId, "Runtime registration project ID");
  const id = runtimeIdentifier(targetId, "Runtime registration ID");
  const expectedProtocol = protocol(selectedProtocol);
  if (!Number.isFinite(now)) throw new DomainError("Runtime registration approval time is invalid.");
  const entry = registrations(entries).find(item => item.id === id && item.projectId === project);
  if (!entry) throw new DomainError("This runtime registration is unavailable for this project.", 404);
  if (entry.protocol !== expectedProtocol) throw new DomainError("This runtime registration does not support the agreed protocol.", 409);
  if (Date.parse(entry.expiresAt) <= now) throw new DomainError("This runtime registration has expired. Ask the operator to approve a new revision.", 409);
  if (digest !== undefined && entry.frontendBundleDigest !== runtimeDeliveryDigest(digest)) {
    throw new DomainError("The registered frontend bundle does not match this exact upload.", 409);
  }
  return structuredClone(entry);
}

/** Safe for an authenticated project-scoped selector; omit endpoint and backend
 * artifact/commit metadata rather than publishing the server registry. */
export function safeRuntimeTargetDescriptor(value: RuntimeRegistrationSnapshot): RuntimeRegistrationDescriptor {
  const item = validateRuntimeRegistrationSnapshot(value);
  return {id: item.id, label: item.label, protocol: item.protocol, revision: item.deploymentRevision,
    registrationRevision: item.registrationRevision, expiresAt: item.expiresAt, kind: "registered", frontendBundleDigest: item.frontendBundleDigest};
}

export function registrationTarget(value: RuntimeRegistrationSnapshot): RuntimeCheckTarget {
  const item = validateRuntimeRegistrationSnapshot(value);
  return {id: item.id, label: item.label, baseUrl: item.baseUrl, revision: item.deploymentRevision, protocol: item.protocol, testOnly: true};
}

/** Equality includes every frozen declaration, not merely its target ID or
 * registration revision. Invalid snapshots cannot compare as the same target. */
export function sameRuntimeRegistration(left: unknown, right: unknown): boolean {
  try { return JSON.stringify(validateRuntimeRegistrationSnapshot(left)) === JSON.stringify(validateRuntimeRegistrationSnapshot(right)); }
  catch { return false; }
}
