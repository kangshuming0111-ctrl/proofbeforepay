# Controlled booking journey depth — 2026-11-03

This checkpoint adds an independent, account-free fictional website exercise. The new controller is designed to operate real JavaScript form buttons, retain their actual request/response traces, and independently query the same native booking records and occupancy. It remains separate from uploaded static deliveries and the existing 8/18/17/31-step server HTTP protocols.

This document records implementation and completed local test layers. The first CUA attempt exposed a missing `allow-forms` permission on the trusted fixture iframe; that permission was added only to the fixed platform-owned fixture. A fresh browser run and publication verification remain separate checkpoints at the time this document was written. Local tests below are not presented as a completed browser run or a new deployment. The release ledger records later observed states without rewriting this checkpoint.

## Scope and entry points

- The main workbench links to the separate lab page `/journeys.html`. It does not run the currently uploaded seller website, associate the result with its delivery digest, add an acceptance requirement or alter a payment state.
- `/journeys.html` controls one trusted, platform-owned `/journey.html` iframe for a fresh UUID namespace. It fills declared form controls and invokes their buttons; the fixture's form handlers make real same-origin network requests.
- The parent records visible form values, action identity, UI status and actual HTTP traces, then performs fresh receipt, merchant and occupancy GETs independently of the form's displayed success message.
- The iframe permits scripts, same-origin access and forms for this fixed fixture only. The existing protected upload preview continues to disable arbitrary uploaded JavaScript, form submissions and external subresources.
- Both pages are bilingual. A compact two-panel desktop view and a mobile form/report selector keep raw evidence expandable.

These controls are not an arbitrary-site scanner or a general browser automation service for separately operated sellers. Synthetic customer and merchant views are not two authenticated people.

## One explicit fictional agreement

The controlled recipe fixes at most 6 guests per booking and 8 active guests per time slot. A, B and C are the declared synthetic slots at 10:00, 11:00 and 12:00 UTC on 1 January 2099. Cancellation must release capacity once; a rejected move must retain the original booking; a successful move must keep its identity and change occupancy atomically; retrying the original creation key must not create another booking.

These are explicit fixture rules, not rules inferred from a customer's contract. The exact run, scenario and controlled frontend entry remain in the report. Duplicate or unknown frontend parameters and unsupported language values are rejected by the [pure evaluator](../lib/journey-checks.ts).

## Twenty independently described checkpoints

| Order | Checkpoint | Evidence sought |
| ---: | --- | --- |
| 1 | `meta` | One actual GET200 response matches the declared lifecycle protocol, revision, synthetic scope and native limits. |
| 2 | `create` | The page shows five guests in A, sends the matching POST and displays the returned receipt. |
| 3 | `create_readback` | Fresh receipt, merchant and occupancy reads retain that active five-guest booking. |
| 4 | `cancel` | The form cancels that same original booking. |
| 5 | `cancel_readback` | The original is cancelled and actual A occupancy returns to zero. |
| 6 | `rebook` | A new independent key creates five guests in A. |
| 7 | `fill` | Another independent key creates three guests, with a different receipt ID. |
| 8 | `full_readback` | Actual active merchant rows and occupancy agree on A8. |
| 9 | `cancel_repeat` | The page repeats cancellation of the already cancelled original. |
| 10 | `cancel_repeat_readback` | The original stays cancelled and A remains 8. |
| 11 | `reject_extra` | The page receives the capacity rejection for one extra guest; independent A evidence remains 8. |
| 12 | `source_create` | A distinct two-guest booking is created in B for rescheduling. |
| 13 | `move_full` | Moving it to full A returns the agreed capacity rejection. |
| 14 | `move_full_readback` | The original ID remains active in B; independent A/B totals are 8/2. |
| 15 | `move_free` | A real form request moves that same booking to C. |
| 16 | `move_free_readback` | The original ID is active in C and B/C independently read 0/2. |
| 17 | `response_loss_create` | A real POST commits one guest in B, returns controlled HTTP504 and leaves the UI unknown. |
| 18 | `response_loss_readback` | A fresh merchant query finds exactly one booking for that original creation key. |
| 19 | `response_loss_retry` | An explicit button retries the original key/body; fixed behavior returns the original ID once. |
| 20 | `final_merchant_readback` | Fresh merchant rows and all three occupancy readings reconcile to A8/B1/C2, four active and one cancelled receipt. |

Dependent writes are skipped after an unmet prerequisite and remain unavailable. Independent source creation, response-failure investigation and final reconciliation may still yield useful observations. A supported final state does not erase an earlier UI mismatch or unavailable operation; the overall summary retains each result.

## Six controlled scenarios

| Scenario | Controlled behavior |
| --- | --- |
| `fixed` | Correct cancellation, atomic rejected/successful move and same-key retry. |
| `cancel-credit` | The native service really stores an erroneous second cancellation credit, permitting a ninth active guest. |
| `move-loss` | The native service really cancels the old booking before a failed full-slot move. |
| `retry-duplicate` | The native service really inserts a second booking when the original post-commit-failure key is replayed. |
| `fake-success` | The fixture page claims creation success without sending the corresponding request; the native target remains fixed. |
| `wrong-party` | The fixture page shows five guests but sends one for the selected creation; the native target remains fixed. |

The independent [native service](../examples/seller-lifecycle-staging/worker/lifecycle-service.mjs) imports no checker or browser-controller code. Native faulty policies change actual storage; their merchant and occupancy endpoints read that storage rather than returning expected counts from the checker. The page-only counterexamples are separate from those native policies.

Every profile deliberately commits the first `loss-create` and returns HTTP504 with `response_lost_after_commit` and no receipt ID. This is a planned, disclosed HTTP failure after commit. It is not a dropped socket, observed production outage or permission for unrestricted retries. Fresh per-run consent explicitly covers this injection and one same-key retry.

## Executed local test layers

The direct native SQLite suite has **10 passing tests**. It covers correct lifecycle behavior, the three stored native defects, intent-bound replay, failed atomic changes, explicit schema/limits, guards and independent-connection same-key concurrency. See [seller-lifecycle.test.ts](../tests/seller-lifecycle.test.ts).

The separate pure-evaluator and bundled guest-Worker suites have **10 passing tests**. In the corrected HTTP stand-in, the 20 declared milestones require **39 actual HTTP requests: 11 POST and 28 GET**. Five receipts persist, one cancelled and four active; A/B/C totals are 8/1/2. The first controlled504 is followed by an independent query and one same-key retry, leaving only one booking for that key. These HTTP/SQLite tests stand in for the form observer; they do not prove that a browser clicked its buttons.

Their native counterexamples independently confirm an actual A9 and excess credit, an actually cancelled original after a failed move, and two different stored IDs sharing the retry key. Foreign/missing Origin, unknown profiles/targets/fields, caller clocks, oversized or malformed bodies and credentials are rejected with the complete three-table state unchanged and no native `.run` attempt. The tests are [guest-lab-journey.test.ts](../tests/guest-lab-journey.test.ts) and [journey-checks.test.ts](../tests/journey-checks.test.ts).

Pure mutations also cover missing or failed metadata GETs, UI/action/field and wire-body discrepancies, wrong displayed receipts, unavailable prerequisites, merchant/occupancy disagreement, report identity and summary tampering, duplicate frontend parameters and JSON object-key order. A dedicated case preserves a supported final readback alongside an earlier operation issue, with the report still unclean.

The direct native/HTTP defect flow can continue commands to examine later bad effects. The browser controller stops dependent writes after a failed prerequisite. For example, cancellation-credit HTTP tests can later move the source booking to C, while the browser may skip those moves and retain it in B. Those different final totals must not be blended into one claimed browser observation.

## Report, persistence and trust

The report uses `proofbeforepay-journey-report-v1`, `browser-controlled-booking-lifecycle-v1` and `booking-lifecycle-http-v1`. Its complete JSON envelope is bounded to 512 KiB. Validation reconstructs the canonical twenty-step results, scope, brief and derived summary from supplied observations; JSON object-key order does not matter. Each expanded milestone retains actual form fields, request/response details and the corresponding independent reads when available.

This remains client-controlled evidence, not a signature, independent identity proof or trusted deployment attestation. Optional controlled-frontend digests must not be described as proof that an arbitrary backend was built from a seller's uploaded files. The controller retains the latest result for each scenario in browser memory; refreshing clears those results, so download is the persistence mechanism for this experiment. It does not append these reports to private project history or acceptance snapshots.

Stopping means stop waiting. Already sent writes may have committed; stop does not roll them back. No pass is manufactured for a missing result, and a fresh run needs new consent and a new UUID. No model, PayPal request, real order, customer email or payment is involved.

## Storage and remaining limits

The standalone [0001 lifecycle migration](../examples/seller-lifecycle-staging/migrations/0001_lifecycle.sql) and identical hosted-fixture [0006 lifecycle migration](../tests/fixtures/seller-staging-hosted/0006_lifecycle.sql) append separate lifecycle tables. Existing capacity migrations, v4 protocols, saved reports, private project membership and acceptance/payment semantics remain unchanged. A hosted lab can share a physical synthetic D1 database while retaining separate tables and run namespaces; physical sharing is disclosed.

Not implemented or established by this slice: arbitrary seller frontend scanning, general JavaScript execution in upload previews, real customer/merchant authentication, timezone/calendar rules, email delivery, security certification, backend source provenance, independent seller adoption or unfamiliar-user research. Browser success and hosted publication must be recorded from actual later observations, not inferred from the local tests above.
