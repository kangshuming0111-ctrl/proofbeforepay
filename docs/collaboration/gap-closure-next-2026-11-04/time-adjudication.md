# Calendar time-policy v2 — independent adjudication

## Implemented slice

Explicit `policy.calendar.version:2` opts into overnight intervals and up to32canonical distinct closed local dates. The opening date owns the weekday. A closed civil date suppresses its entire local day, and a closed opening date cannot create a next-day tail. Civil gap/fold rejection precedes opening rules. Cancellation of an already existing reservation remains governed by its cancellation notice. No holiday calendar or contract clause is invented.

V1 policies omit the new field, retain the original cases/labels/order, protocol `time-policy-http-v1` and40HTTP/18POST limits. The frozen plan/cases were extracted from source commit b07a73b03425682bcaf4069fa2661a7a859a93ce into `tests/fixtures/time-policy-v1-frozen.json`; old valid reports revalidate without mutation. V2 uses affirmative `time-policy-http-v2` metadata,50HTTP/24POST limits and the same already-approved finite backend paths. The default overnight plan has17cases/41HTTP/20POST. No database migration, acceptance, price or payment change occurs.

## DeepSeek attempt1

`time-review-harness.json` did not complete: unallowed_tool_call, wait_not_returned, turn_not_completed, missing_final_assistant_text. It is retained as a failed attempt and provides no valid findings or success claim.

## DeepSeek attempt2 — accepted narrowly, incorrect consequence rejected

`time-review-harness-02.json` completed with one P2. It correctly identified that the runner's native-record check was weaker than the replay validator (UUID shape and missing exact instant). Its proposed consequence that a loose runner result would be displayed as an observed pass was rejected: every terminal runner return already calls `evaluateTimeTrace`, discarding the local speculative conclusions.

A narrower actual defect was accepted independently: a malformed-ID or wrong-instant cancellation setup could authorize a dependent cancel POST before the final replay rejected that baseline. The fix shares `timePolicyRecordMatches` between the runner and replay. It requires exactly one civil instant, the exact UTC instant, strict UUID, run/case/marker/localStart/status and optional expectedID. A failed setup now sends no cancel POST; the existing per-case unknown branch remains.

## DeepSeek corrective review — two findings rejected with executed counterexamples

`time-review-final.json` completed with P2 and P3, but both rely on incorrect control-flow reading and case arithmetic.

- P2 claims `continue` after a failed cancellation setup misaligns replay. Rejected: `evaluateTimeTrace` independently applies the SAME shared native-record predicate to BOTH setup responses; on failure it records `cancellation_setup_not_established` and also `continue`s. The trace remains aligned. No skip-marker protocol or terminal stop is needed.
- P3 claims25HTTP/12POST is unreachable in v1 and that earlier observations are lost. Rejected: v1 has9create probes (4opening/closing +3lead +2DST) and3cancel probes. A normal run is1metadata +9*2 +3*4 =31HTTP, with9+3*2 =15POST. Skipping each dependent cancel POST+GET removes6HTTP/3POST, yielding25HTTP/12POST.

An additional executed regression tampers ONLY active `-setup` records with either a forged36dash ID or wrong instant. Each trace has25HTTP/12POST, zero `/cancel` writes,9earlier observed create conclusions,3per-case unknown cancellation conclusions, and validates successfully through saved-session replay. An untampered control sends3`/cancel` POSTs and supports all12cases. These are actual isolated native SQLite tests, not an unexecuted disagreement or a manufactured model consensus. No additional review was requested merely to obtain an empty findings array.

## Verification

Final focused result:22tests passed,0failed (`outputs/gap-closure-next-2026-11-04/time-focused.log`); repository `tsc --noEmit` passed after the final source change.

Focused domain/native/publicHTTP tests cover v1 freeze, v2 validation, overnight weekdays, closed-day and closed-start precedence, closing-at-midnight, DST gaps/folds (Melbourne/Lord Howe), Kathmandu offset, bounds, strict native setup records and separate defective native services. The public route executes actual HTTP with a test-only owned-loopback mapping and independent SQLite; no arbitrary URLs, credentials, expected answers or policy are sent in synthetic booking inputs.

Fresh-D1 API suite passed4groups: actual v2 plan save/readback for both project roles, rejection of unversioned overnight/duplicate closure/closed ordinary baseline, exact replacement binding, unchanged old v1 traces and quote/payment payload. Outbound network is explicitly blocked in this suite; it does not prove a remote target or a real login.

The corrected calendar service supports17/17observations,41HTTP/20POST,9native rows. Wrong-weekday service yields5mismatches+3unknown cancellation dependencies,35HTTP/17POST,2native rows. Ignored-closure service yields3mismatches,41HTTP/20POST,12native rows. Hosted/browser verification is owned by the parent task and is not implied by these local results.

## Limits

One opening interval, years2025–2035, no equal-minute all-day mode, explicit closures only, at most32dates. This is a cooperative synthetic staging protocol, not independent seller adoption, a legal holiday calendar, arbitrary-site scanning, trusted deployment proof, real refunds or automatic final acceptance.
