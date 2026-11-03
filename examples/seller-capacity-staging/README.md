# Synthetic seller slot-capacity staging

This separate Workers/D1 example implements a native shared-capacity business
rule for the `booking-http-v3` wire contract. It imports no checker, expected
result generator or old seller handler. It performs no outbound fetch, email,
model or payment operation. It is a controlled reference, not a real merchant.

The default native rule permits six people per booking and eight guests total
in one synthetic time slot. Two different five-person orders cannot both fit.
An atomic SQL trigger enforces the sum across distinct idempotency keys; a
JavaScript read/check/insert sequence or in-memory mutex is not used.

## Explicit operator configuration

The handler reads only `CAPACITY_DB`, `CAPACITY_PROJECT_ID`,
`CAPACITY_REGISTRATION_REVISION`, `CAPACITY_FRONTEND_BUNDLE_DIGEST`,
`CAPACITY_DEPLOYMENT_REVISION`, `CAPACITY_POLICY_ID`, and optional declared
`CAPACITY_BACKEND_ARTIFACT_DIGEST` / `CAPACITY_BACKEND_SOURCE_COMMIT`.
The IDs/revisions and digests must match the operator-reviewed registration.
No process-wide environment or secret file is read. Optional backend hashes
are declarations, not cryptographic deployment attestation.

The native SQL policy view provides three clearly controlled reference choices:

| Operator policy ID | Per-booking maximum | Per-slot guest limit | Admission |
| --- | --- | --- | --- |
| `fixed` | 6 | 8 | SQL enforces the shared limit |
| `overbook` | 6 | 8 | Intentional reference fault: slot-limit guard disabled |
| `underlimit` | 6 | 7 | Intentional reference fault: rejects some agreed valid work |

Only the operator binding selects a policy. Request fields, query strings and
headers cannot select or alter it. The faulty choices are for detecting real
stored behaviour in a controlled scenario; they are not production settings.
Metadata does not reveal the enforcement flag, and the checker must derive its
expected limits from the buyer-confirmed original clauses, not this metadata.

The strict JSON Wrangler example contains unbound placeholders. Copy the files
into an authorised independent Worker workspace, bind a disposable database,
apply the SQL migration explicitly, configure the association and deploy only
within the operator-approved audience. No file here provisions a database,
installs a registration or publishes a service by itself. An existing lab may
mount the handler by stripping its prefix and explicitly passing bindings. If
that lab physically shares D1, disclose the sharing and separate tables; do not
call it a separate database or an independent third-party seller.

## Bounded HTTP contract

- `GET /pbp/meta` declares the configured association and native limits.
- `POST /pbp/bookings` receives exactly the six standard synthetic fields.
- `GET /pbp/bookings/{id}` reads the original saved receipt by generated ID.
- `GET /pbp/occupancy/{runId}/{a|b}` returns exactly
  `{testRunId, slot, revision, guestCount, bookingIds}` from one SQL snapshot.
  No expected count, expected ID or buyer policy is passed in the GET.

Only `2099-01-01T10:00:00Z` and `2099-01-01T11:00:00Z` are accepted. Customer,
test email, marker and run UUID are fixed by the synthetic contract. Keys must
be `pbp-{runId}-capacity-{above|race-a|race-b|fill|extra|slot-b}`. Real contacts,
extra fields, arbitrary dates, browser Origin, cookies and authorization headers
are rejected. These endpoints are intended for the approved server-side checker,
not direct credentialed browser forms.

The receipt namespace includes the exact manifest, operator policy and run UUID.
Within a run, all distinct keys for a slot share one capacity bucket; another
slot is independent. Separate synthetic runs do not consume one another's seats.
This isolation does not prove capacity across real production customers.

Existing active keys are replayed before new-order policy checks. SQL conflict
or capacity races re-read the same key before returning 200 or 409, preserving
original receipts without reserving seats twice. Rows expire after one hour;
each valid new POST removes at most 100 expired rows, prioritising its own
expired key. The global store cap is 1,000 rows. Occupancy output is bounded to
24 unique IDs and never silently truncated. Request bodies are limited to 4 KiB.
No schema is created by a request.

## Native verification

```sh
node --test tests/seller-capacity-staging.test.mjs
```

Tests execute the actual schema and service with native SQLite, including two
worker threads on independent connections racing different keys, full-slot
replay/conflict, stored overbooking, an overly strict native policy, slot/run/
manifest isolation, persistence, expiry, bounded cleanup/cap and SQL guards.
Native tests and bounded SQL observations are not remote-D1 scheduling proof,
site-wide testing, a real-user study or deployment-source attestation.
