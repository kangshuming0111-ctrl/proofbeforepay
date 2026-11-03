# Booking HTTP coverage expansion — 2026-11-03

This checkpoint adds a wider, explicitly confirmed booking protocol. It records source behavior and actual controlled local tests; publication of this new source and its current hosted/browser behavior remain separate checks. It does not establish all website functionality, a coverage percentage, model accuracy, independent seller adoption or a new payment.

## Protocols retain their original meaning

| Buyer-confirmed protocol | Canonical steps | Bounded purpose |
| --- | ---: | --- |
| `booking-http-v1` | 8 | Basic input rejection, creation, independent reads, replay and conflict. |
| `booking-http-v2` | 18 | One explicit party-size maximum, boundaries and same-key consistency. |
| `booking-http-v3` | 17 | Two original clauses: party maximum and total slot capacity, including distinct-key contention and later-write witnesses. |
| **`booking-http-v4`** | **31** | The existing 17 capacity steps plus 14 additional validation, same-key and valid-boundary observations. |

Fresh capacity examples propose v4, but adoption still requires the buyer to inspect two separate included source clauses and explicitly confirm the technical agreement. The v3 option remains available. Existing agreements, canonical step inventories, saved reports, registration pins and acceptance snapshots are not silently upgraded or relabelled.

Both capacity protocols retain complete source spans for per-booking maximum M and per-slot capacity C. The bounded recipe requires M 2–12, C 3–12 and M ≤ C < 2M. The example locks M6/C8. Unsupported or contradictory wording, excluded clauses and incompatible numerical combinations require clarification rather than substituted values. See [the proposal helper](../lib/runtime-plan-draft.ts), [capacity validation](../lib/booking-capacity.ts) and [canonical step definitions](../lib/runtime-capacity.ts).

## Fourteen additional observations

V4 retains every original v3 step and adds:

- **Six invalid inputs:** `missing_slot`, `invalid_email`, `party_zero`, `party_fraction`, `party_negative`, `party_string`. Rejections need the specified status and structured error code; coercing a string into a number is not accepted.
- **One changed-data replay:** `winner_conflict`. The actual winning key must reject changed data without replacing its original receipt.
- **Three same-key concurrency observations:** `same_key_first`, `same_key_second`, `same_key_readback`. The expected pair contains one 201 creation and one 200 replay with the same fields and ID, followed by independent readback.
- **Four valid lower-bound observations:** `party_one`, `party_one_readback`, `party_below`, `party_below_readback`. The original upper bound is also exercised by the maximum-size booking in independent slot B.

Different-key capacity contention remains separate: two 5-person requests compete for slot A with capacity 8; one should return 201 and the other 409. A 3-person fill reaches 8, an additional guest is rejected, and another slot is checked. V4 uses additional isolated slots C/D/E for same-key and lower-bound requests. Final receipt reads follow all writes, so later requests cannot silently replace earlier records. Zero-write recovery does not recreate unobserved initial requests or races.

The [native handler](../examples/seller-capacity-staging/worker/capacity-service.mjs) enforces its own configured policy and SQL state. It does not copy expected M/C values from the checker into an adapter or fabricate persistence in memory.

## Seven explicit coverage groups

The [coverage helper](../lib/runtime-coverage.ts) partitions each canonical ID into one group. The v4 plan contains:

| Group | Planned steps |
| --- | ---: |
| Target declaration | 1 |
| Invalid-input rejection | 6 |
| Per-booking boundaries | 5 |
| Replay, conflicts and same-key concurrency | 6 |
| Distinct-key capacity and full-slot checks | 8 |
| Independent reads and retained original records | 2 |
| Independent slot B at the party maximum | 3 |
| **Total** | **31** |

The interface derives observed, mismatched and unavailable counts from the exact named saved steps, rather than the reported aggregate or an HTTP status alone. A successful status can still be a mismatch. An absent, pending or incompatible report shows the plan without result counts; earlier success is not substituted. Explicitly skipped steps can display “Not executed” while their stored outcome remains unavailable. The compact disclosure is a description of these bounded protocol paths, not a percentage of the website or a claim that AI ran the checks.

## Actual local evidence: a gap the shorter recipe did not expose

The retained run uses actual native SQLite, separate-connection worker-thread races and an owned ephemeral loopback HTTP server. The buyer's M6/C8 remains unchanged. An operator-only `email-gap` profile deliberately accepts the one fictional malformed token `not-an-email`; ordinary requests cannot select that profile or supply real contacts.

| Native configuration and recipe | Requests | Supported / mismatched / unavailable | Separate saved-database observation |
| --- | ---: | --- | --- |
| Email gap, shorter **v3** valid-email baseline | 17 | 17 / 0 / 0 | Three valid-email synthetic receipts; slot A contains 8. The invalid-email case was not in this recipe. |
| Same email gap, expanded **v4** | 8 | 6 / 2 / 23 | One malformed-email receipt really persisted; slot A contains 1. The invalid-email response was 201, then the supposedly empty initial slot was not empty. |
| Correct strict handler, **v4** | 31 | 31 / 0 / 0 | Six distinct synthetic receipts; slot A contains 5 + 3 = 8, slot B 6, and C/D/E contain 1/1/5. |
| Deliberate overbooking, **v4** | 22 | 19 / 3 / 9 | Both 5-person contenders persisted, making slot A 10. These are independent of the same-key 201/200 results. |

The second row is a detected validation problem, not a 23-step successful execution: once the initial slot is contaminated, dependent capacity writes remain unexecuted and unavailable. The final row retains the actual post-race aggregate; two 201 responses alone do not establish the guest total.

The native SQL/HTTP checkpoint passed 27 tests: 16 preserved v3 cases and 11 new cases. The main UI/helper checkpoint passed 38 focused tests and a nonincremental TypeScript check. Its 128 feedback-format combinations retain every exception ID, actual status and the technical-agreement note within 1000 characters; this is formatting validation, not 128 website scenarios. Independent source review remained advisory, and disputed findings were adjudicated against code and execution.

These tests establish the exercised local implementation and protocol. They do not establish remote D1 scheduling, a separately operated seller, frontend-form integration, a trusted deployment attestation, real model/provider execution or general absence of bugs. The reproducible tests are [native v4 behavior](../tests/seller-capacity-v4.test.ts), [owned loopback v3/v4 comparison](../tests/runtime-capacity-v4-native.test.ts), [coverage states](../tests/runtime-coverage.test.ts), and [feedback bounds](../tests/runtime-feedback.test.ts).

## Append-only state and evidence budgets

The standalone [0002 expanded migration](../examples/seller-capacity-staging/migrations/0002_capacity_expanded.sql) and hosted-fixture [0005 expanded migration](../tests/fixtures/seller-staging-hosted/0005_capacity_expanded.sql) add separate expanded state. The standalone 0001 and hosted 0004 capacity migrations retain their prior bytes and meaning. New protocol/profile namespaces prevent expanded runs from silently changing old pins or receipts; schema changes are applied explicitly rather than created automatically during a request.

Before v4 external work, the server reserves 96KiB for its report, versus 48KiB for older protocols, plus a measured worst-case acceptance snapshot with space for acknowledgement of all 31 exceptions. The shared evidence-history budget remains 256KiB. Existing evidence is not evicted to admit a new run, and lease expiry does not discard an unknown external outcome. See [the reservation implementation](../lib/evidence-budget.ts).

Buyer exceptions must explicitly acknowledge the complete current exception set and give a reason. Per-version histories remain independent; later supplemental reports cannot overwrite the evidence frozen at an earlier acceptance. These state and storage protections do not themselves prove business correctness, accept work or authorize payment. Current publication, browser operation, external-user outcomes and submission status must be established separately from this local checkpoint.
