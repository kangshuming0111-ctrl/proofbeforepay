import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { validateFirstUseSession, summarizeFirstUseSessions } from "../scripts/record-first-use-session.mjs";

// Validation fixtures only. No person participated, and these values are not research results.
const cli = path.resolve(import.meta.dirname, "../scripts/record-first-use-session.mjs");
function fixture(mode = "synthetic", persona = "buyer") {
  const ids = persona === "buyer" ? ["create-requirements", "interpret-evidence", "request-revision"] : ["integrate-staging", "submit-delivery", "repair-and-retest"];
  return { schema: "proofbeforepay-first-use-session-v1", sessionId: "session-validation-fixture", mode, persona,
    participantCode: "p-test001", unfamiliarWithProject: true, externalParticipant: true,
    consent: { status: "granted", recordedAt: "2026-11-05T02:59:00.000Z" }, buildTag: "validation-only",
    startedAt: "2026-11-05T03:00:00.000Z", endedAt: "2026-11-05T03:12:00.000Z",
    tasks: ids.map((id, i) => ({ id, startedAt: `2026-11-05T03:${String(i * 4).padStart(2, "0")}:00.000Z`, endedAt: `2026-11-05T03:${String(i * 4 + 3).padStart(2, "0")}:00.000Z`, outcome: "completed", helpCount: 0, blockerCode: "none", note: "Validation fixture; no participant." })) };
}
function run(args: string[]) { return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" }); }
async function withDirectory(action: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "pbp-first-use-validation-"));
  try { await action(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

test("operator/synthetic walkthroughs cannot create a human summary or score", () => {
  const synthetic = fixture(), operator = fixture("operator_walkthrough"); operator.sessionId = "session-operator";
  assert.throws(() => summarizeFirstUseSessions([]), /NO_HUMAN_FIRST_USE_SESSIONS/u);
  assert.throws(() => summarizeFirstUseSessions([synthetic, operator]), /NO_HUMAN_FIRST_USE_SESSIONS/u);
});

test("a manually attested human record requires prior consent, unfamiliarity and external participation", () => {
  for (const change of [
    (s: ReturnType<typeof fixture>) => { s.consent = { status: "not_requested", recordedAt: null as unknown as string }; },
    (s: ReturnType<typeof fixture>) => { s.consent.recordedAt = "2026-11-05T03:01:00.000Z"; },
    (s: ReturnType<typeof fixture>) => { s.unfamiliarWithProject = false; },
    (s: ReturnType<typeof fixture>) => { s.externalParticipant = false; },
  ]) { const s = fixture("human_first_use"); change(s); assert.throws(() => validateFirstUseSession(s)); }
});

test("human summaries count observed task outcomes/help without treating repeated participants as fresh users", () => {
  const first = fixture("human_first_use"), repeated = structuredClone(first), seller = fixture("human_first_use", "technical_seller");
  repeated.sessionId = "session-repeated"; repeated.tasks[0].helpCount = 12;
  seller.sessionId = "session-seller"; seller.participantCode = "p-test002";
  seller.tasks[0].outcome = "blocked"; seller.tasks[0].blockerCode = "setup"; seller.tasks[0].helpCount = 2;
  const s = summarizeFirstUseSessions([first, repeated, seller]);
  assert.equal(s.humanSessions, 2); assert.equal(s.excluded.repeated_participant, 1);
  assert.equal(s.byPersona.buyer.tasks[0].completedWithoutHelp, 1);
  assert.equal(s.byPersona.buyer.tasks[0].helpEvents, 0);
  assert.equal(s.byPersona.technical_seller.tasks[0].blocked, 1);
  assert.equal(s.byPersona.technical_seller.tasks[0].helpEvents, 2);
  assert.equal("score" in s, false); assert.equal("successRate" in s, false);
  assert.match(s.evidence, /not_identity_verified/u);
});

test("session/task identities, complete persona-specific tasks and timing are validated", () => {
  for (const change of [
    (s: ReturnType<typeof fixture>) => { s.sessionId = "A person name"; },
    (s: ReturnType<typeof fixture>) => { s.participantCode = "person@example.invalid"; },
    (s: ReturnType<typeof fixture>) => { s.tasks.pop(); },
    (s: ReturnType<typeof fixture>) => { s.tasks[1].id = s.tasks[0].id; },
    (s: ReturnType<typeof fixture>) => { [s.tasks[0].id, s.tasks[1].id] = [s.tasks[1].id, s.tasks[0].id]; },
    (s: ReturnType<typeof fixture>) => { s.tasks[0].id = "integrate-staging"; },
    (s: ReturnType<typeof fixture>) => { s.tasks[1].startedAt = s.startedAt; },
    (s: ReturnType<typeof fixture>) => { s.tasks[1].endedAt = "2026-11-05T04:00:00.000Z"; },
    (s: ReturnType<typeof fixture>) => { s.startedAt = "2026-02-30T03:00:00.000Z"; },
    (s: ReturnType<typeof fixture>) => { s.endedAt = "2026-11-06T03:12:00.000Z"; },
    (s: ReturnType<typeof fixture>) => { s.tasks[0].helpCount = -1; },
    (s: ReturnType<typeof fixture>) => { s.tasks[0].outcome = "blocked"; },
  ]) { const s = fixture(); change(s); assert.throws(() => validateFirstUseSession(s)); }
  const zero = fixture("human_first_use"); zero.tasks[0].endedAt = zero.tasks[0].startedAt;
  assert.throws(() => validateFirstUseSession(zero), /ZERO_DURATION_HUMAN_COMPLETION/u);
});

test("credential/PII-like notes, unexpected fields and unbounded entries are rejected instead of retained", () => {
  for (const note of ["person@example.invalid", "https://example.invalid/private?token=hidden", "Bearer abcdef", "sk-example-test-key", "password: example", "A".repeat(301)]) {
    const s = fixture(); s.tasks[0].note = note; assert.throws(() => validateFirstUseSession(s), /UNSAFE_OR_INVALID_TEXT/u);
  }
  assert.throws(() => validateFirstUseSession({ ...fixture(), guessedScore: 100 }), /INVALID_SESSION_SCHEMA/u);
  const extra = fixture(); Object.assign(extra.tasks[0], { guessedParticipantSatisfaction: 10 });
  assert.throws(() => validateFirstUseSession(extra), /INVALID_SESSION_SCHEMA/u);
  assert.throws(() => summarizeFirstUseSessions([fixture(), fixture()]), /DUPLICATE_SESSION_ID/u);
});

test("CLI records synthetic observations once, labels them excluded and refuses overwrite", async () => withDirectory(async dir => {
  const input = path.join(dir, "input.json"), output = path.join(dir, "record.json"), s = fixture();
  await writeFile(input, JSON.stringify(s));
  const r = run(["--input", input, "--output", output]); assert.equal(r.status, 0, r.stderr);
  const response = JSON.parse(r.stdout); assert.equal(response.eligibleForHumanAggregate, false); assert.equal(response.mode, "synthetic");
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), s);
  const again = run(["--input", input, "--output", output]); assert.equal(again.status, 1); assert.match(again.stderr, /RECORD_ALREADY_EXISTS/u);
  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), s);
}));

test("CLI empty/synthetic-only folders cannot emit a successful human report", async () => withDirectory(async dir => {
  assert.equal(run(["--summarize", dir]).status, 1);
  await writeFile(path.join(dir, "synthetic.json"), JSON.stringify(fixture()));
  const r = run(["--summarize", dir]); assert.equal(r.status, 1); assert.equal(r.stdout, "");
  assert.match(r.stderr, /NO_HUMAN_FIRST_USE_SESSIONS/u);
}));

test("CLI strict parsing and bounded private input failures do not leak raw input or create a record", async () => withDirectory(async dir => {
  const input = path.join(dir, "bad.json"), output = path.join(dir, "record.json");
  for (const args of [[], ["--input"], ["--summarize", dir, "unexpected"], ["--input", input, "--output", output, "--force"]]) assert.equal(run(args).status, 1);
  await writeFile(input, '{"private":"person@example.invalid",');
  const invalid = run(["--input", input, "--output", output]); assert.equal(invalid.status, 1); assert.doesNotMatch(invalid.stderr, /person@example/u);
  await assert.rejects(readFile(output));
  await writeFile(input, " ".repeat(16_385));
  assert.match(run(["--input", input, "--output", output]).stderr, /INVALID_SESSION_FILE/u);
  const linked = path.join(dir, "link.json"); await symlink(input, linked);
  assert.match(run(["--input", linked, "--output", output]).stderr, /INVALID_SESSION_FILE/u);
}));

test("CLI summary of validation fixtures keeps real-first-use counts separate from owner walkthroughs", async () => withDirectory(async dir => {
  const records = path.join(dir, "records"); await mkdir(records);
  const attestedFixture = fixture("human_first_use"), operator = fixture("operator_walkthrough"); operator.sessionId = "session-owner";
  await writeFile(path.join(records, "attested-validation.json"), JSON.stringify(attestedFixture));
  await writeFile(path.join(records, "operator-validation.json"), JSON.stringify(operator));
  const r = run(["--summarize", records]); assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout); assert.equal(s.humanSessions, 1); assert.equal(s.excluded.operator_walkthrough, 1);
  assert.equal(s.byPersona.technical_seller.sessions, 0); assert.equal(s.byPersona.technical_seller.tasks[0].observed, 0);
  assert.match(s.limits.join(" "), /observer attestations/u);
}));
