# Requirement-grounded booking policy checks

This implementation slice adds business-specific acceptance to the existing booking protocol. A backend can create, read back and replay records correctly while still accepting a booking that violates the buyer's agreed maximum. The policy check uses the buyer's original requirement to set the expected boundary; the tested backend's metadata does not choose that expectation.

The owner has paused video work to prioritize code and functional verification. No recording or Devpost draft edit is part of this slice. Local implementation and test results do not establish an updated deployment or submission.

## Agree the actual business rule

The buyer selects an included original requirement and chooses `booking-http-v2`. A deterministic proposal supports narrow complete clauses such as:

- `每笔预约最多6人`
- `Each booking accepts at most 6 people.`
- `Maximum party size per booking: 6 persons.`

The supported maximum is an integer from 2–12. The policy stores that value and an exact absolute UTF-16 source span. The server re-parses the complete included clause and compares both the value and citation. A caller cannot select a convenient digit from conflicting wording, substitute seven for a cited six or use a minimum as the maximum. Prices, project fees, negations, alternatives, compound limits and unfamiliar wording remain unsupported. Unsupported does not mean the requirement is satisfied: the buyer must clarify the source or choose the separately described basic protocol.

The proposal does not adopt a plan. The buyer separately confirms the technical eighteen-step agreement. Source, selected criterion, protocol or scope changes reset that confirmation. The seller sees the same locked maximum before joining and chooses only a compatible registered target when uploading. `lab-policy-flawed` and `lab-policy-fixed` implement v2; the old `lab-flawed`/`lab-fixed` targets remain v1-only. The application never accepts a caller-supplied URL or arbitrary executable script.

## Eighteen observations

The first eight steps retain the basic protocol structure. V2 uses a one-guest valid booking for the initial creation, so it also exercises the lower valid edge. It does not silently change stored v1 plans or reports.

| Step | Expected observation |
|---|---|
| 1. Declared revision | Matching registered revision before any booking writes. |
| 2. Missing appointment time |400/422 with `synthetic_validation_failed`. |
| 3. Malformed email |400/422 with `synthetic_validation_failed`. |
| 4. Valid one-guest creation |201, permitted receipt ID and exact expected fields. |
| 5. Independent readback |200 with the same ID and original one-guest record. |
| 6. Same-key replay |200/201 with the same ID and original fields. |
| 7. Conflicting same-key payload |409 with `idempotency_conflict`. |
| 8. Unchanged original |200 with the original record after the conflict. |
| 9. Zero guests |400/422 with `party_size_invalid`. |
| 10. Fractional guests |400/422 with `party_size_invalid`. |
| 11–12. One below the agreed maximum |Successful exact-field record, followed by an independent GET using only its receipt ID. |
| 13–14. Exactly the agreed maximum |Successful exact-field record and independent GET. |
| 15. One above the agreed maximum |400/422 with `party_size_exceeded`. A generic status or different error code is insufficient. |
| 16–17. Concurrent same-key requests |Two requests launched together, exactly one201 and one200, with the same ID and original fields. |
| 18. Concurrent record readback |Independent GET with the agreed ID and fields. |

For a six-person requirement the run therefore probes one guest, invalid zero and fractional counts, valid five and six, and invalid seven. HTTP readback requests do not send expected marker/record values for the backend to echo. The concurrent test establishes consistency of these responses and the subsequent readback; it does not prove that the entire database contains no hidden duplicate or orphan records.

The run permits at most eighteen requests, 30 seconds total, four seconds per request and 16 KiB per JSON response. It uses only registered disposable targets, generated fictional data and no provider keys or cookies. Redirects, malformed/oversized responses, timeouts and failed dependencies remain unavailable. A missing concurrent peer cannot establish either successful pair consistency or a proven duplicate-creation failure.

## Recovery does not invent first-run evidence

A 45-second persisted run lease is acquired through CAS before network writes. An expired run is retried with the same run identity and idempotency keys.

- On a fresh run,200 at the creation step does not prove that creation was observed; the expected first-creation result is201.
- On an explicitly resumed run, an exact200 recovered receipt may be used to continue independent checks, but creation is unavailable with `resumed_creation_not_observed`.
- A resumed concurrent pair returning200/200 does not recreate evidence of the original race. Those observations remain unavailable with `resumed_concurrency_not_observed`, even if later independent readback succeeds.
- Unverified boundary or concurrent records leave their dependent readbacks unavailable.

Reports retain these distinctions rather than turning a successful recovery into a fresh all-pass result.

## Protect space for the result and acceptance

Before acquiring the run lease, the server reserves 48 KiB for one bounded runtime report and measures the worst-case current acceptance snapshot. The measurement includes current criteria, evidence, assessment and risk reviews verbatim, plus bounded identifiers, exception text and all eighteen acknowledgements. It is checked against a shared 256 KiB evidence-history budget and a separate full-delivery size limit.

Every saved mutation applies the shared guard. Later browser/business/layout observations, AI assessments and risk reviews cannot consume reserved space; growth in material copied into acceptance is re-measured. Lease expiry does not release the reservation. Completing the same run consumes only its report allowance and retains required acceptance room. Explicit acceptance consumes its remaining reservation. A replacement delivery clears current-version reservations and evidence while preserving the archived old version. No arbitrary history deletion is used to make room.

The regression tests exercise near-full history, existing current observations, escaped exception-text sizing and later assessment/review growth. Passing these bounded storage checks does not establish unlimited storage or permit deleting prior evidence.

## Observed local checkpoint

The full real runner was connected to the actual controlled handlers through an in-process fetch adapter backed by native SQLite. These are executable runner/handler/database results; they did not issue external network requests and are not hosted v2 results.

| Buyer maximum | Independently configured backend | Local observed result |
|---|---|---|
|6 |Flawed six-person policy, incorrectly allowing seven |17 supported,1 mismatch. All eight basic steps succeed; the above-limit request returns201 and SQL confirms a stored seven-person record. |
|6 |Corrected six-person policy |18 supported,0 mismatch,0 unavailable. |
|5 |The same corrected six-person backend |Mismatch: a six-person request is accepted although this buyer's maximum is five. |
|7 |The same corrected six-person backend |Mismatch: seven is the buyer's exact allowed maximum, but the backend rejects it; dependent exact-boundary readback remains unavailable. |

Additional local cases exercise a server enforcing a ceiling below the buyer's requirement, resumed runs and a missing concurrent peer. Existing basic v1 tests remain separate. These synthetic engineering cases are not a general accuracy estimate, independent user research, frontend-form test, deployment attestation or security certification. The file digest binds an HTTP report to an uploaded delivery record but still does not prove that the deployed service was built from those files.

## Reproduce the relevant checks

With the supported Node version and locked dependencies installed:

```sh
node --experimental-strip-types --test tests/booking-policy.test.ts tests/runtime-checks.test.ts tests/runtime-actions.test.ts tests/runtime-feedback.test.ts tests/evidence-budget.test.ts
node --experimental-strip-types --test tests/runtime-policy-backend.test.mjs tests/booking-policy-backend.test.mjs tests/booking-lab.test.mjs
node tests/run-collaborative-sandbox-local.mjs --suite runtime-checks
```

The isolated API command creates fresh local D1 and uses only the harness's synthetic gateway identities. It blocks outbound fetch and verifies all18 unavailable steps, policy/digest persistence, target incompatibility, complete exception acknowledgement and the frozen report-A acceptance after supplemental report B. Never send its synthetic identity headers to production. Test totals and deployment observations belong to their dated execution artifacts, not this guide's source description.
