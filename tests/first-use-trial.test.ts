import assert from "node:assert/strict";
import test from "node:test";
import {createFirstUseTrial, startFirstUseTask, noteFirstUseHelp, finishFirstUseTask, recordFirstUseAction, exportFirstUseTrial, type TrialAction} from "../lib/first-use-trial.ts";
const create = () => createFirstUseTrial({sessionId:"synthetic-session",build:"guest-lab-v1",operator:"automation",startedAt:"2026-11-02T00:00:00Z"},100);
test("only actually started tasks exist; elapsed time uses monotonic differences and outcomes are explicitly declared",()=>{
  const initial=create(); assert.deepEqual(initial.attempts,[]);
  let trial=startFirstUseTask(initial,"T03",120); trial=recordFirstUseAction(trial,"draft_feedback",145); trial=finishFirstUseTask(trial,"independent",220);
  const exported=exportFirstUseTrial(trial); assert.equal(exported.attempts.length,1); assert.equal(exported.attempts[0].elapsedMs,100); assert.equal(exported.attempts[0].helpCount,0); assert.equal(exported.attempts[0].declaredOutcome,"independent");
  assert.deepEqual(initial.attempts,[]); assert.equal(exported.evidence.independentUserStudy,false); assert.equal(exported.evidence.participantIdentityVerified,false); assert.equal(exported.operator,"automation");
});
test("recorded help cannot be relabeled an independent completion and tasks cannot overlap",()=>{
  const started=startFirstUseTask(create(),"T01",130); assert.throws(()=>startFirstUseTask(started,"T02",140));
  const helped=noteFirstUseHelp(started,150); assert.throws(()=>finishFirstUseTask(helped,"independent",180));
  const finished=finishFirstUseTask(helped,"with_help",190); assert.equal(finished.attempts[0].helpCount,1); assert.equal(finished.attempts[0].declaredOutcome,"with_help");
});
test("clock regression, content-bearing arbitrary actions and invalid metadata are rejected",()=>{
  assert.throws(()=>recordFirstUseAction(create(),"check_static",99)); assert.throws(()=>recordFirstUseAction(create(),"private@example.com" as TrialAction,150));
  assert.throws(()=>createFirstUseTrial({sessionId:"private@example.com",build:"v1",operator:"unknown",startedAt:"2026-11-02T00:00:00Z"},1));
  assert.throws(()=>noteFirstUseHelp(create(),110)); assert.throws(()=>finishFirstUseTask(create(),"stopped",110));
});
test("an unfinished task remains unfinished on export, with no invented end time or outcome",()=>{
  const trial=startFirstUseTask(create(),"T05",140), result=exportFirstUseTrial(trial); assert.equal(result.attempts[0].declaredOutcome,undefined); assert.equal(result.attempts[0].elapsedMs,undefined);
  assert.equal("monotonicOrigin" in result,false); result.events[0].task="T01"; assert.equal(trial.events[0].task,"T05");
});
test("a self-declared newcomer is never silently promoted to verified independent research",()=>{
  const trial=createFirstUseTrial({sessionId:"synthetic-human-slot",build:"v1",operator:"self-declared-first-time",startedAt:"2026-11-02T00:00:00Z"},1);
  const output=exportFirstUseTrial(trial); assert.equal(output.evidence.operatorTypeSelfDeclared,true); assert.equal(output.evidence.independentUserStudy,false); assert.equal(output.evidence.outcomesUserDeclared,true);
});
