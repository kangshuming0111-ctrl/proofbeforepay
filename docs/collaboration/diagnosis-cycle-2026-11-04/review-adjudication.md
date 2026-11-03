# Diagnosis cycle — independent review adjudication

Date: 4 November 2026, Australia/Melbourne. This record concerns the first priority from the preceding gap review: make existing concurrent-state evidence visible, explain exact business differences, and provide a report-bound repair/retest path. It does not declare the other product gaps completed.

Codex independently read the implementation and assessed the local DeepSeek Harness feedback. DeepSeek's source review is advisory. A valid review format is not proof of runtime correctness; an invalid review format is not a successful structured review. Existing stored model reports, the `release-vs-transfer-v1` definition and its digest remain unchanged. Diagnosis is a derived presentation of those records.

## Review inputs and status

| Artifact under `outputs/diagnosis-cycle-2026-11-04` | Recorded result | Treatment |
| --- | --- | --- |
| `deepseek-design.json` | `completed:true`, `reportValid:true`, empty findings | Design risks and suggestions, independently checked against source. |
| `deepseek-implementation.json` | `completed:false`, `reportValid:false`, `report_not_json` | Advisory text only. Its three concrete allegations were independently reviewed, then supplied with the missing store context for followup. |
| `deepseek-binding-followup.json` | `completed:true`, `reportValid:true`; three prior allegations withdrawn, one residual P3 | Withdrawals checked against source. Residual typed-array allegation rejected by source reasoning and an executed zero-provider counterexample. |

## Design advice accepted and qualified

Accepted the following design requirements, now represented in the implementation:

- Bind current diagnosis to actual canonical file bytes, current delivery, saved technical plan and project. `useModelDiagnosis` computes the current file-map digest; the server explanation context independently computes it through `runtimeDeliveryDigest` before forming model input. Pending or invalid binding is visible rather than a reassuring result.
- Preserve the existing oracle's compatible, violated and inconclusive outcomes. Partial/timeout/closed evidence never becomes confirmed original-booking loss merely because some raw fields look suspicious.
- Consider both legal serial alternatives, including their real invocation/completion precedence. A failed transfer that preserves the original is a legitimate result when it precedes cancellation.
- Keep frozen acceptance A separate from supplemental report B. New findings and explanations do not rewrite an existing acceptance, choose payment, or alter a stored verdict.
- Supply optional AI with a compact allowlist of derived diagnostic facts, finding IDs and observation IDs. Do not send raw seller response text, registration URLs, customer/email fields, receipt IDs or command keys. Validate returned groups against the exact finding inventory.
- Re-read membership/current context and reapply the store CAS after the asynchronous provider call; check saved-field and shared history capacity before provider I/O and again before saving.

Two design statements needed correction rather than adoption. `validateStoredModelCheckReport` already checks the registration's `frontendBundleDigest` against the report's delivery digest. The remaining caller responsibility is comparing that claimed digest with the actual current file map. Also, a historical completed report is not invalid merely because its original live run lease or registration approval has since elapsed. Admission/current execution expiry and retained historical readability remain distinct. No live-lease requirement was retroactively imposed on old reports.

## Implementation allegation 1 — stale quote or success after failed CAS

**Decision: rejected; DeepSeek withdrew it in followup.**

The initial advisory alleged that the route returns a stale `fresh.quote`, or returns HTTP201 after a failed save. The decisive code is `saveProofCase` in `lib/proof-store.ts`: after the database batch it throws HTTP409 when the update's `meta.changes` is zero, before assigning `record.quote = next` and incrementing `record.version`. On success those assignments deliberately update the record passed by reference. The explanation route awaits this function before building `proofResponse(fresh)`.

Consequently a store conflict cannot reach the successful response, and a successful save's response reflects the committed quote. The route also reads a fresh membership-authorized record after the provider call and passes its role to `saveModelEvidenceExplanation`. This does not claim exactly-once provider billing: two separately confirmed concurrent requests may both call a provider and one may later receive a conflict. No exactly-once billing guarantee is part of this change.

## Implementation allegation 2 — explanation budget preflight omits its bytes

**Decision: rejected; DeepSeek withdrew it in followup.**

`assertModelExplanationCapacity` replaces the current explanation on a cloned quote with a locally counted sentinel whose serialized size is exactly16KiB: `{"padding":"..."}` has14 bytes of envelope, so the padding contains `MODEL_EXPLANATION_BYTES - 14` bytes. The sentinel is neither saved nor sent to a model.

`histories().planning` in `lib/evidence-budget.ts` includes `modelExplanation`. Its individual limit is16KiB, and the same retained-history total also counts it alongside existing report and acceptance reservations. `modelEvidenceContext` applies this preflight before invoking the provider and rejects pending runtime/journey/model evidence runs. The post-provider path derives context again, validates the actual saved record, calls `assertQuoteEvidenceBudget(next)`, and uses the store CAS.

The sentinel is an optimistic admission check, not a persistent lock. Another authorized mutation between preflight and save can still require a conflict/capacity rejection after paid provider work; the original saved record and verdict remain unchanged. This limitation is distinct from the rejected claim that the maximum explanation bytes are absent from preflight.

## Implementation allegation 3 — proposal and saved-envelope limits disagree

**Decision: rejected as a correctness defect; DeepSeek withdrew it in followup.**

The proposal is conservatively bounded at14KiB; the complete stored explanation, including identity, model, timestamp, exact report/file/plan/spec/revision and finding inventory, is independently bounded at16KiB. Per-group finding IDs are unique and drawn from the bounded derived inventory. This is deliberate layered validation, not a promise to accept every possible16KiB proposal. The final stored-byte check is still necessary and a failed validation never saves a partial explanation or changes a verdict/payment decision.

Length/byte limits can reject an overly verbose provider response, so this is not an unlimited explanation channel. Provider failures, unknown IDs, duplicate groups, missing limitations and forged authority fields are explicitly rejected in the focused tests.

## Followup P3 — typed arrays bypass the plain-object guard

**Decision: rejected. The allegation contradicts the guard and its own reproduction.**

The `object` helper in `lib/model-evidence-explanation.ts` accepts only objects with `Object.prototype` or a null prototype, rejects arrays, checks every own key and rejects accessors. A `Uint8Array` retains `Uint8Array.prototype` even if expected-looking named fields are assigned to it. JSON parsing cannot manufacture a typed array.

An executed, zero-provider local check passed both a normal `Uint8Array(2)` and a typed array with named `findings`, `limitations` and `payment` properties to `parseModelEvidenceProposal`. Both were rejected with `DomainError`, HTTP400. The review's proposed `Uint8Array.prototype.set.call(...)` example returns `undefined`, not a new plain object; that value is also rejected by the first guard.

No guard was weakened. In particular, the suggested JSON round-trip was not added: normalizing arbitrary objects before validating them can invoke accessors or silently discard unsupported keys, contrary to the existing explicit plain-data contract.

## Independent counterexample accepted during implementation

An independent test found a genuine overstatement risk in the first diagnostic projection: a query intended for original booking X could return cancelled booking Y while the merchant view also showed X cancelled. Merely seeing two cancelled statuses is insufficient to call them two views of the same original.

Accepted and fixed: the strongest original-loss conclusion now requires the original immutable identity, original party size and original creation key to agree in both the receipt and merchant row. An incorrect returned identity produces `original_booking_identity`; a different receipt's cancelled status is not represented as original-booking confirmation. This was reproduced before the fix and covered by the independent regression suite.

Other accepted implementation protections include bounded alias displays, a maximum of eight AI packet findings with an omitted count, and a1000-character feedback draft that retains the explicit fresh-namespace retest/no-unknown-write-replay instruction even when its body is shortened.

## Additional source issues accepted before release

Root corrected the next-action navigation after independent review: an unfinished model run now routes to inspection/explicit closure before the generic locked-delivery action. A non-compatible current model report awaiting acknowledgement is prioritized ahead of the journey acknowledgement, while compatible evidence keeps the ordinary journey-first sequence. This changes navigation selection only. Actual file-digest validation and verdict display remain in the diagnosis projection/hook, and acceptance/payment guards are unchanged.

The comparison view also treats a pending current run as unfinished before considering earlier completed reports. A previous saved report cannot establish the current run's outcome or repair evidence.

The offline viewer had another concrete presentation issue: its old logic treated any check ID missing from its display-name table as an early bounded-JSON failure. New optional `journey-plan-source-mapping` and `model-evidence-explanation` checks could therefore produce a misleading warning despite a consistent verifier result. The current `app/guest-lab/evidence-viewer.ts` names these optional checks, only presents the actual schema/failed-structure cases as early failures, and describes unfamiliar future check IDs separately. It does not reinterpret those unknown IDs as malformed JSON. The underlying verifier remains authoritative; this presentation fix does not prove authenticity or execute historical HTTP requests.

## Verification and evidence layers

- The projection owner executed the combined projection and independent regression tests:16/16 passed at that checkpoint. The independent regression includes actual loopback HTTP to the controlled Python fixture and a separate native SQLite query confirming the source enrolment was withdrawn. It is a deliberately constructed mutant, not a sampled real customer incident or browser attestation.
- Root's saved `full-tests.log` records817/817 passing at the reviewed checkpoint. This record reports that log, not a second independent execution of the full suite. Source/typecheck/build and publication evidence belong to the root release record.
- The isolated API log is outbound-blocked with synthetic actors and no real authenticated accounts asserted. Provider fixtures exercise validation/saving; they are not fresh live DeepSeek calls.
- `create-ui-fixtures.mjs` explicitly constructs local UI-only transcripts for loss, unknown, comparison and pending states. The local screenshots verify rendering and interaction with those supplied records. They must not be described as fresh hosted HTTP/native/model/payment executions.
- The prior genuine Sandbox checkout/authorization/capture remains separate evidence from the previous completed cycle. This diagnosis review did not move funds or create a new payment claim.

No output of this review establishes that all bugs are absent, that arbitrary external websites can be verified, or that the project will win an award.
