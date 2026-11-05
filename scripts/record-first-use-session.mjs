#!/usr/bin/env node
import { readFile, writeFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const TASKS = Object.freeze({ buyer: ["create-requirements", "interpret-evidence", "request-revision"], technical_seller: ["integrate-staging", "submit-delivery", "repair-and-retest"] });
const MODES = ["human_first_use", "operator_walkthrough", "synthetic"];
const OUTCOMES = ["completed", "blocked", "abandoned"];
const BLOCKERS = ["none", "unclear_next_step", "unclear_evidence", "setup", "authorization", "runtime_failure", "other"];
const MAX_BYTES = 16_384;
const unsafe = /[\u0000-\u001f\u007f]|\b(?:https?:\/\/|bearer\s|sk-[a-z0-9_-]{6,}|api[_ -]?key|password|secret|authorization|access[_ -]?token)\b|[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu;
const issue = (code) => Object.assign(new Error(code), { code });
function object(value, names) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join("|") !== [...names].sort().join("|")) throw issue("INVALID_SESSION_SCHEMA");
}
function safe(value, max, required = true) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim()) || unsafe.test(value)) throw issue("UNSAFE_OR_INVALID_TEXT");
  return value;
}
function instant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw issue("INVALID_TIMESTAMP");
  return Date.parse(value);
}

/** Validate manually entered observations. This cannot authenticate a person or prove a session occurred. */
export function validateFirstUseSession(input) {
  object(input, ["schema", "sessionId", "mode", "persona", "participantCode", "unfamiliarWithProject", "externalParticipant", "consent", "buildTag", "startedAt", "endedAt", "tasks"]);
  if (input.schema !== "proofbeforepay-first-use-session-v1" || !MODES.includes(input.mode) || !Object.hasOwn(TASKS, input.persona)
    || !/^session-[a-z0-9-]{1,60}$/u.test(input.sessionId) || !/^p-[a-z0-9]{6,20}$/u.test(input.participantCode)
    || typeof input.unfamiliarWithProject !== "boolean" || typeof input.externalParticipant !== "boolean"
    || !/^[a-zA-Z0-9._-]{1,80}$/u.test(input.buildTag)) throw issue("INVALID_SESSION_SCHEMA");
  object(input.consent, ["status", "recordedAt"]);
  if (!["granted", "not_requested"].includes(input.consent.status)) throw issue("INVALID_CONSENT");
  const start = instant(input.startedAt), end = instant(input.endedAt);
  if (end < start || end - start > 8 * 60 * 60 * 1000) throw issue("INVALID_SESSION_INTERVAL");
  if (input.consent.status === "granted") {
    if (instant(input.consent.recordedAt) > start) throw issue("CONSENT_AFTER_SESSION_START");
  } else if (input.consent.recordedAt !== null) throw issue("INVALID_CONSENT");
  if (input.mode === "human_first_use" && (input.consent.status !== "granted" || !input.unfamiliarWithProject || !input.externalParticipant)) throw issue("NOT_ELIGIBLE_FOR_FIRST_USE");
  if (!Array.isArray(input.tasks) || input.tasks.length !== TASKS[input.persona].length) throw issue("INCOMPLETE_TASK_SET");
  const seen = new Set(); let previousEnd = start;
  for (const [index, task] of input.tasks.entries()) {
    object(task, ["id", "startedAt", "endedAt", "outcome", "helpCount", "blockerCode", "note"]);
    if (task.id !== TASKS[input.persona][index] || seen.has(task.id) || !OUTCOMES.includes(task.outcome)
      || !Number.isSafeInteger(task.helpCount) || task.helpCount < 0 || task.helpCount > 20 || !BLOCKERS.includes(task.blockerCode)) throw issue("INVALID_TASK_OBSERVATION");
    seen.add(task.id); safe(task.note, 300, false);
    const taskStart = instant(task.startedAt), taskEnd = instant(task.endedAt);
    if (taskStart < previousEnd || taskEnd < taskStart || taskEnd > end) throw issue("INVALID_TASK_INTERVAL");
    if (input.mode === "human_first_use" && task.outcome === "completed" && taskEnd === taskStart) throw issue("ZERO_DURATION_HUMAN_COMPLETION");
    if (task.outcome !== "completed" && task.blockerCode === "none") throw issue("BLOCKED_WITHOUT_REASON");
    previousEnd = taskEnd;
  }
  return structuredClone(input);
}

/** No simulated/operator result enters the human count; no score or inferred usability claim is produced. */
export function summarizeFirstUseSessions(records) {
  if (!Array.isArray(records) || records.length > 200) throw issue("SESSION_COLLECTION_LIMIT");
  const checked = records.map(validateFirstUseSession), ids = new Set(), people = new Set();
  const excluded = { operator_walkthrough: 0, synthetic: 0, repeated_participant: 0 };
  const accepted = [];
  for (const session of checked.sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (ids.has(session.sessionId)) throw issue("DUPLICATE_SESSION_ID"); ids.add(session.sessionId);
    if (session.mode !== "human_first_use") { excluded[session.mode]++; continue; }
    if (people.has(session.participantCode)) { excluded.repeated_participant++; continue; }
    people.add(session.participantCode); accepted.push(session);
  }
  if (!accepted.length) throw issue("NO_HUMAN_FIRST_USE_SESSIONS");
  return { schema: "proofbeforepay-first-use-observation-summary-v1", evidence: "manually_entered_observations_not_identity_verified", humanSessions: accepted.length,
    byPersona: Object.fromEntries(Object.keys(TASKS).map(persona => {
      const sessions = accepted.filter(s => s.persona === persona);
      return [persona, { sessions: sessions.length, tasks: TASKS[persona].map(id => {
        const tasks = sessions.flatMap(s => s.tasks.filter(t => t.id === id));
        return { id, observed: tasks.length, completed: tasks.filter(t => t.outcome === "completed").length,
          completedWithoutHelp: tasks.filter(t => t.outcome === "completed" && t.helpCount === 0).length,
          blocked: tasks.filter(t => t.outcome === "blocked").length, abandoned: tasks.filter(t => t.outcome === "abandoned").length,
          helpEvents: tasks.reduce((sum, t) => sum + t.helpCount, 0), elapsedMilliseconds: tasks.reduce((sum, t) => sum + Date.parse(t.endedAt) - Date.parse(t.startedAt), 0),
          blockers: Object.fromEntries(BLOCKERS.filter(code => code !== "none").map(code => [code, tasks.filter(t => t.blockerCode === code).length])) };
      }) }];
    })), excluded, limits: ["Participant identities, familiarity and actual occurrence are observer attestations, not independently verified by this tool.", "Small convenience samples and selected tasks do not establish customer-distribution usability or superiority over another product."] };
}

async function readSession(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw issue("INVALID_SESSION_FILE");
  let value; try { value = JSON.parse(await readFile(file, "utf8")); } catch { throw issue("INVALID_SESSION_JSON"); }
  return validateFirstUseSession(value);
}
export async function runFirstUseCli(args) {
  if (args.length === 2 && args[0] === "--summarize") {
    const names = await readdir(args[1]);
    if (names.length > 200) throw issue("SESSION_COLLECTION_LIMIT");
    const records = await Promise.all(names.filter(name => name.endsWith(".json")).sort().map(name => readSession(path.join(args[1], name))));
    return summarizeFirstUseSessions(records);
  }
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output" || !args[1] || !args[3]) throw issue("USAGE: --input <session.json> --output <record.json> OR --summarize <records-directory>");
  const session = await readSession(args[1]), bytes = JSON.stringify(session, null, 2) + "\n";
  await writeFile(args[3], bytes, { flag: "wx", mode: 0o600 });
  return { recorded: true, sessionId: session.sessionId, mode: session.mode, eligibleForHumanAggregate: session.mode === "human_first_use", sha256: createHash("sha256").update(bytes).digest("hex"), researchClaim: "No occurrence or identity verified; aggregate separately." };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runFirstUseCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error?.code === "EEXIST" ? "RECORD_ALREADY_EXISTS" : error?.code?.startsWith?.("E") ? "SESSION_FILE_IO_FAILED" : error?.message ?? "SESSION_RECORD_FAILED"); process.exitCode = 1; }
}
