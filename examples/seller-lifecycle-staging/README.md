# Disposable native booking lifecycle reference

This independent Worker implements `booking-lifecycle-http-v1` against native SQL. It imports no checker or browser-controller code. It does not run uploaded website JavaScript, contact providers, send email, accept real customer data, authenticate real customers, accept work or move money.

Apply `migrations/0001_lifecycle.sql` explicitly to a new disposable D1 test database before serving `worker/index.mjs`. The handler never creates or migrates tables during a request. The hosted fixture copy is `tests/fixtures/seller-staging-hosted/0006_lifecycle.sql`; previous migrations and capacity tables retain their original meaning. A shared physical lab D1 must be disclosed as shared, even though lifecycle tables and run namespaces are separate. Copy the example Wrangler configuration and replace its database placeholders; no account secrets belong in source.

The service receives only `DB` and the operator-pinned `LIFECYCLE_PROFILE`: `fixed`, `cancel-credit`, `move-loss` or `retry-duplicate`. Each profile retains a separate `lifecycle-{profile}-v1:{runId}` namespace. A caller cannot select a fault through JSON, query arguments or headers. The public lab chooses an explicitly labelled controlled target path; its HTTP route passes the pinned profile. A fresh run uses a UUID and only fictional `PBP synthetic` / `pbp-test@example.invalid` data. Slots are fixed: A `2099-01-01T10:00:00Z`, B `2099-01-01T11:00:00Z`, C `2099-01-01T12:00:00Z`. Each booking allows 1–6 people and each slot allows 8 active guests.

## Wire contract

- `GET /pbp/meta` declares the protocol, revision, native limits and synthetic-only scope. Its declarations do not attest deployment provenance.
- `POST /pbp/bookings` accepts exactly `{testRunId,marker,customer,email,slot,partySize}`. Marker equals `PBP-` plus the run UUID. Use `Idempotency-Key: pbp-{runId}-lifecycle-{suffix}`. Creation suffixes are `cancel-create`, `cancel-five`, `cancel-three`, `cancel-extra`, `source-create` and `loss-create`.
- `GET /pbp/bookings/{id}` independently reads a stored receipt.
- `POST /pbp/bookings/{id}/cancel` accepts exactly `{testRunId,marker}` and suffix `cancel-first` or `cancel-repeat`.
- `POST /pbp/bookings/{id}/move` accepts exactly `{testRunId,marker,slot}` and suffix `move-full` or `move-free`.
- `GET /pbp/occupancy/{runId}/{a|b|c}` independently returns `{testRunId,slot,revision,guestCount,bookingIds}` from active stored rows.
- `GET /pbp/merchant/{runId}` independently returns `{testRunId,revision,bookings}` including active and cancelled receipts. This is a synthetic merchant readback, not a separate authenticated merchant account.

A receipt contains `{id,testRunId,marker,customer,email,slot,partySize,status,revision,idempotencyKey}`. `status` is `active` or `cancelled`; `idempotencyKey` remains the original creation key even after a move/cancellation. Ordinary create returns 201, exact replay 200, changed successful intent under the same key 409 `idempotency_conflict`, insufficient capacity 409 `slot_capacity_exceeded`, and a move of an already cancelled booking 409 `booking_state_conflict`. Failed commands do not become successful operation-log records; their conditions may be reevaluated on an explicitly retried request.

All profiles deliberately commit the first accepted `loss-create` operation and then return **HTTP504 `{code:"response_lost_after_commit"}` without the receipt ID**. This is an explicit controlled HTTP failure after commit, not a real dropped socket, arbitrary network emulator or proof that a client should blindly retry. Query the merchant run and original creation key to observe the outcome. The fixed profile then returns the same receipt on exact replay and leaves one booking. Missing or failed evidence must remain unknown rather than a pass.

## Native behavior and counterexamples

Successful operations are keyed uniquely in `seller_lifecycle_operations`. One command INSERT and its SQL triggers commit atomically; concurrent same-key losers cannot run the `AFTER INSERT` state transition a second time. The fixed capacity guards sum active booking rows. A failed fixed move rolls back the command and booking change together, preserving the original slot and status. Repeated cancellation changes neither occupancy nor old receipt identity.

The three intentionally faulty profiles execute real, inspectable bad writes:

- **`cancel-credit`** persists an erroneous extra capacity credit when a second accepted cancellation targets an already cancelled receipt. Admission subtracts this credit, so a ninth active guest is really stored. Occupancy still sums actual active rows and exposes 9. The same bad admission rule may also wrongly permit a move into the overfull slot; tests must retain those additional effects rather than assume only one mismatch.
- **`move-loss`** commits cancellation of the old reservation before attempting a move into an already full slot. The move fails, but the original is really cancelled. A subsequent move cannot restore it automatically.
- **`retry-duplicate`** bypasses the successful-operation uniqueness mechanism on a `loss-create` replay and really inserts another booking with the same original key. Independent merchant/occupancy reads reveal both rows.

The direct native test deliberately continues some faulty branches to expose their later effects. A browser controller may stop dependent writes after a failed prerequisite and record them as unavailable; its final row counts can therefore differ from the direct test without changing the underlying defect.

The direct fixed flow creates A5, cancels it, creates A5+A3, repeats the original cancellation, rejects A+1, creates B2, rejects its move to full A while retaining B2, successfully moves it to C, then commits B1 with a controlled504 and recovers it by the same key. Final native storage contains five receipts: one cancelled original and four active receipts; A8, B1, C2.

Records expire after one hour. Writes perform bounded cleanup; exact expired operation keys are released before the global backlog. Limits are 1,000 bookings, 3,000 successful operation rows, 1,000 faulty credit rows, 4 KiB request JSON and 24 receipts per readback. Oversized readbacks fail instead of silently truncating. Matching same-origin browser requests are allowed; authorization, cookies and foreign origins are rejected. The hosting write route must additionally require an Origin header. Non-browser test clients may use credential-free requests. Random IDs and run namespaces isolate fictional exercises; they are not an application authentication model.

Run `node --experimental-strip-types --test tests/seller-lifecycle.test.ts` from the source root for actual native SQLite behavior, atomic failed changes, controlled counterexamples, input guards and independent-connection concurrency. These tests do not establish arbitrary seller-site correctness, real account permissions, mailbox delivery, trusted frontend/backend provenance or payment.
