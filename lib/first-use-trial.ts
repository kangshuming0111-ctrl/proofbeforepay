/** Local task notes, not verified participant research. No identity, private
 * content, analytics transport or automatic success classification lives here. */
export const FIRST_USE_TASKS = ["T01", "T02", "T03", "T04", "T05"] as const;
export type FirstUseTask = typeof FIRST_USE_TASKS[number];
export type TrialOperator = "unknown" | "developer" | "automation" | "self-declared-first-time";
export type TrialOutcome = "independent" | "with_help" | "not_completed" | "unavailable" | "stopped";
export const TRIAL_ACTIONS = ["agree_scope", "switch_buyer", "switch_seller", "submit_v1", "check_static", "draft_feedback", "send_local_feedback", "submit_v2", "accept_local", "simulate_payment", "http_flawed_started", "http_fixed_started", "http_completed", "http_error", "reset_case"] as const;
export type TrialAction = typeof TRIAL_ACTIONS[number];
type TrialEvent = {elapsedMs: number; kind: "task_start" | "help_open" | "task_stop" | "action"; task?: FirstUseTask; action?: TrialAction; outcome?: TrialOutcome};
type TaskAttempt = {task: FirstUseTask; startedMs: number; endedMs?: number; helpCount: number; declaredOutcome?: TrialOutcome};
export type FirstUseTrial = {
  schema: "first-use-local-v1"; sessionId: string; build: string; operator: TrialOperator; startedAt: string;
  monotonicOrigin: number; lastMonotonic: number; events: TrialEvent[]; attempts: TaskAttempt[];
};
const OPERATORS = new Set<TrialOperator>(["unknown", "developer", "automation", "self-declared-first-time"]);
const OUTCOMES = new Set<TrialOutcome>(["independent", "with_help", "not_completed", "unavailable", "stopped"]);
function clock(value: number) {if (!Number.isFinite(value) || value < 0) throw new Error("Use a nonnegative monotonic clock.");}
function active(trial: FirstUseTrial) {return trial.attempts.findLast(attempt => attempt.endedMs === undefined);}
function next(trial: FirstUseTrial, now: number): {copy: FirstUseTrial; elapsed: number} {
  clock(now); if (now < trial.lastMonotonic) throw new Error("The monotonic clock moved backwards.");
  if (trial.events.length >= 500) throw new Error("This local trial reached its 500-event limit. Export it and start another session.");
  const copy = structuredClone(trial); copy.lastMonotonic = now;
  return {copy, elapsed: Math.round(now - trial.monotonicOrigin)};
}
export function createFirstUseTrial(input: {sessionId: string; build: string; operator: TrialOperator; startedAt: string}, now: number): FirstUseTrial {
  clock(now);
  if (!OPERATORS.has(input.operator) || !/^[a-zA-Z0-9-]{1,64}$/u.test(input.sessionId) || !/^[a-zA-Z0-9._-]{1,64}$/u.test(input.build) || !Number.isFinite(Date.parse(input.startedAt))) throw new Error("Use a valid local trial session, build, operator and time.");
  return {schema: "first-use-local-v1", ...input, monotonicOrigin: now, lastMonotonic: now, events: [], attempts: []};
}
export function startFirstUseTask(trial: FirstUseTrial, task: FirstUseTask, now: number): FirstUseTrial {
  if (!FIRST_USE_TASKS.includes(task) || active(trial)) throw new Error("Choose one task after ending the current task.");
  const {copy, elapsed} = next(trial, now); copy.attempts.push({task, startedMs: elapsed, helpCount: 0}); copy.events.push({elapsedMs: elapsed, kind: "task_start", task}); return copy;
}
export function noteFirstUseHelp(trial: FirstUseTrial, now: number): FirstUseTrial {
  if (!active(trial)) throw new Error("Start a task before recording help.");
  const {copy, elapsed} = next(trial, now), attempt = active(copy)!; attempt.helpCount += 1; copy.events.push({elapsedMs: elapsed, kind: "help_open", task: attempt.task}); return copy;
}
export function finishFirstUseTask(trial: FirstUseTrial, outcome: TrialOutcome, now: number): FirstUseTrial {
  const current = active(trial);
  if (!current || !OUTCOMES.has(outcome)) throw new Error("Start a task and choose its observed outcome.");
  if (outcome === "independent" && current.helpCount > 0) throw new Error("A task with recorded help cannot be declared independent.");
  const {copy, elapsed} = next(trial, now), attempt = active(copy)!; attempt.endedMs = elapsed; attempt.declaredOutcome = outcome;
  copy.events.push({elapsedMs: elapsed, kind: "task_stop", task: attempt.task, outcome}); return copy;
}
export function recordFirstUseAction(trial: FirstUseTrial, action: TrialAction, now: number): FirstUseTrial {
  if (!TRIAL_ACTIONS.includes(action)) throw new Error("Only known, content-free task actions can be recorded.");
  const {copy, elapsed} = next(trial, now), attempt = active(copy); copy.events.push({elapsedMs: elapsed, kind: "action", ...(attempt ? {task: attempt.task} : {}), action}); return copy;
}
export function exportFirstUseTrial(trial: FirstUseTrial) {
  return structuredClone({schema: trial.schema, sessionId: trial.sessionId, build: trial.build, operator: trial.operator, startedAt: trial.startedAt,
    evidence: {participantIdentityVerified: false, operatorTypeSelfDeclared: true, outcomesUserDeclared: true, independentUserStudy: false, scope: "Optional guest-lab task record only; not usability evidence for the authenticated main application or a population success rate."},
    attempts: trial.attempts.map(attempt => ({task: attempt.task, startedMs: attempt.startedMs, ...(attempt.endedMs === undefined ? {} : {endedMs: attempt.endedMs, elapsedMs: attempt.endedMs-attempt.startedMs}), helpCount: attempt.helpCount, ...(attempt.declaredOutcome ? {declaredOutcome: attempt.declaredOutcome} : {})})), events: trial.events});
}
