# Stem Room: independent Python/SQLite workshop

This invented florist runs on Python 3.9+ with only the standard library. Its
native datastore uses **sessions, enrolments and command_log**, independently of
the JavaScript/D1 seller reference. The same fixed M6/C8 lifecycle wire protocol
is a small adapter over those actual native records. It imports no checker,
expected verdict, provider, application account or payment code.

For an independent browser-witness counterexample, start the fixed native
backend with the additional `--browser-mode no-save` flag and a separate
disposable database. The native form then displays success without issuing its
booking POST. Merchant and occupancy readbacks remain empty. This deliberately
broken, startup-only UI profile tests whether independently observed screen
claims are corroborated by native state. It is never selected by a query or API
request, and it is not evidence of an actual customer's incident. The default
`--browser-mode normal` retains the original working form.

## Start and stop

From the repository root, run these commands in two terminals. Each profile must
have a different SQLite file. Startup creates the schema once, before accepting
HTTP requests; later requests never create or migrate tables.

```sh
python3 examples/seller-workshop-python/server.py --profile fixed --db /tmp/stem-room-fixed.sqlite --port 8765
```

```sh
python3 examples/seller-workshop-python/server.py --profile move-loss --db /tmp/stem-room-move-loss.sqlite --port 8766
```

Open `http://127.0.0.1:8765/workshop.html` and choose **Start a fresh practice
session**. Use the forms to reserve, cancel or move fictional participants.
The second service at port 8766 intentionally loses an original booking when a
transfer targets a full workshop. Stop either process with Ctrl+C. Restarting
with the same file preserves saved records. Delete only that disposable file
and its `-wal`/`-shm` siblings while the process is stopped to reset the exercise.
`--port 0` selects an ephemeral port; the first stdout line is a JSON ready record.

To connect a separate local parent, pass its **exact origin** explicitly:

```sh
python3 examples/seller-workshop-python/server.py --profile fixed --db /tmp/stem-room-fixed.sqlite --port 8765 --parent-origin http://127.0.0.1:3000
```

The default approved parent is the existing ProofBeforePay main origin. Multiple
`--parent-origin` arguments form a fixed operator allowlist; there is no wildcard
or message/query override. For an authorised HTTPS reverse proxy, add
`--host 0.0.0.0 --public-origin https://your-staging-host.example.org` and preserve
that exact Host header. Frontend and API must stay on the same origin. This
stdlib server is a disposable staging example, not a production hosting service.
The main Cloudflare Worker does not run this Python process. Downloading a
template or linting its manifest does not install or approve a registration.

## Native storage and wire mapping

`schema.sql` is the actual workshop schema. `sessions` gives each named flower
class a `session_code`, `starts_at` and independent eight-place `seat_limit`.
`enrolments` stores the exercise, participant, chosen session, seat count and
native `confirmed`/`withdrawn` state. `command_log` records successful native
`enrol`/`withdraw`/`transfer` commands, their intent fingerprint, enrolment
reference and result. The original creation reference stays on the enrolment.

| Canonical receipt | Real native source |
| --- | --- |
| id | enrolments.enrolment_ref |
| testRunId | enrolments.exercise_id |
| marker | enrolments.exercise_tag |
| customer | enrolments.participant_label |
| email | enrolments.participant_contact |
| slot | sessions.starts_at, joined by session_code |
| partySize | enrolments.seat_count |
| status | enrolments.enrolment_state: confirmed → active, withdrawn → cancelled |
| idempotencyKey | enrolments.creation_command, equal to the original command_log.command_ref |

There are three distinct version declarations:

- `nativeSchemaRevision`: `florist-enrolments-v1` describes native field/state layout.
- `nativeRevision`: `florist-workshop-python-fixed-v1` or
  `florist-workshop-python-move-loss-v1` identifies the actual native profile.
- Canonical `revision`: `lifecycle-fixed-v1` or `lifecycle-move-loss-v1` identifies
  the existing HTTP adapter contract required by the unchanged checker.

The two `manifest.*.json` files declare those native mappings and the independent
`pbp-seller-bridge-v1` frontend protocol. Their example URLs must be replaced by
the actual authorised staging origin before operator review. The manifests
contain no credentials. A local JSON preflight checks declarations only, not
SQL, adapter correctness, ownership, deployment provenance or runtime execution.

## HTTP contract and behavior

The API uses `/pbp/`:

- `GET meta`: protocol, canonical/native revisions, native limits and synthetic scope.
- `POST bookings`: exactly `{testRunId,marker,customer,email,slot,partySize}`.
- `GET bookings/{enrolment_ref}`: saved receipt from native storage.
- `POST bookings/{enrolment_ref}/cancel`: exactly `{testRunId,marker}`.
- `POST bookings/{enrolment_ref}/move`: exactly `{testRunId,marker,slot}`.
- `GET merchant/{run}`: every saved enrolment for that fictional exercise.
- `GET occupancy/{run}/{a|b|c}`: real confirmed seat totals and enrolment IDs.

Run identifiers are lowercase UUIDs, marker is `PBP-{run}`, participant is always
`PBP synthetic` / `pbp-test@example.invalid`. The three wire timestamps are
`2099-01-01T10:00:00Z`, `2099-01-01T11:00:00Z` and `2099-01-01T12:00:00Z`.
Each party has 1–6 people; each workshop permits eight confirmed seats per run.
Commands require a same-origin `Origin`, JSON content type and a named
`Idempotency-Key: pbp-{run}-lifecycle-{suffix}`. Creation suffixes are
`cancel-create`, `cancel-five`, `cancel-three`, `cancel-extra`, `source-create`,
`loss-create`; cancellation uses `cancel-first`/`cancel-repeat`, transfer uses
`move-full`/`move-free`. These are explicit synthetic exercise commands.

Fixed commands run in `BEGIN IMMEDIATE` transactions. SQL capacity triggers
independently guard inserts and transfers. A full target rolls back the fixed
transfer and leaves the original enrolment unchanged. Cancellation moves the
native state to withdrawn; repeating it creates no capacity credit. Successful
command keys are unique and bound to verb, enrolment reference and full body.
Same-key concurrent requests yield one creation and one replay; changed intent
returns 409. Failed fixed commands append no successful log entry.

Both profiles deliberately commit the first accepted `loss-create`, including
its command log, then return HTTP 504 `{code:"response_lost_after_commit"}`.
This is an explicit controlled failure, not an observed production outage.
Independent GETs expose the actual saved enrolment. An explicit identical retry
returns 200 and the original ID. There is no automatic write retry.

The **move-loss** operator profile implements a real faulty two-transaction
transfer: it first commits withdrawal, then attempts admission to the target.
If the target is full, the second transaction fails but the original remains
withdrawn in SQLite. Receipt, merchant and occupancy GETs read that bad state;
they do not manufacture failed counts or expected checker outcomes. Profile is
pinned in the database at startup and cannot be selected by a query or JSON.

Cookie/Authorization, foreign Origin, unrecognised paths, query-injected faults,
unknown JSON fields, duplicate keys, non-JSON/encoded/chunked bodies and bodies
over 4 KiB are rejected. Only `/workshop.html?run=<uuid>` accepts a query. Stored
data is bounded to 1,000 enrolments, 3,000 successful commands and 24 enrolments
per exercise. Records do not automatically expire; the operator resets a stopped
disposable database. IDs and exercise namespaces isolate synthetic runs; they
are not real customer authentication.

## Frontend bridge and verification

The native page uses one tabbed workshop form, rather than the reference site's
three side-by-side forms. The adapter selects those real controls and clicks
their normal submit buttons. It validates exact parent origin/window, run,
nonce, sequence, action identity and bounded command shape. It does not execute
caller code or accept caller endpoints. Requests use `credentials:"omit"`.
The driver supports eleven named UI actions; the main server owns the remaining
readback steps of the unchanged 20-step recipe.

Run from the repository root:

```sh
node --experimental-strip-types --test tests/seller-workshop-python.test.ts
```

The tests spawn actual Python HTTP processes on loopback, make real HTTP calls
and inspect native SQLite. They feed **programmatically constructed UI-shaped
claims**, plus actual HTTP/native readbacks, into the existing unchanged checker.
For that evaluator copy only, `/pbp/` trace paths map to the canonical laboratory
prefix, just as registered private reports map their approved base path. This
is adapter/HTTP/checker coverage, **not a browser observation**. A separate CUA
form exercise is needed to claim actual browser use. Client bridge records are
cooperative declarations, not independent browser/database attestation, proof
of deployed source, real account authentication, delivery acceptance or payment.

### Independent competing-transfer experiment

The optional `transfer-competition-v1` model is separate from the older release-versus-transfer model. Metadata explicitly advertises both supported families. In the new family, X and Y each hold p places in two different sessions, Z holds 8−p places in a third session, and X/Y concurrently try to move into that target. The legal result is one successful move, one capacity rejection, an intact losing source reservation and an unchanged Z reservation.

`race-fixture.py --variant competing-fixed --db /tmp/pbp-competing-fixed.sqlite --port 0` retains the actual native update-capacity SQL trigger. The disposable startup-selected `competing-overbook` variant removes that update trigger and uses a controlled overlap barrier after a non-atomic pre-check. Two real SQL updates then exceed capacity. It is a deliberate synthetic counterexample; the ordinary server and insert guard remain unchanged. No request or query can activate this fault.

The new checker performs at most five synthetic writes and 24 requests, compares receipts, merchant rows and all three occupancies with both real-time-consistent legal orders, and never automatically retries an unknown write. `tests/transfer-competition-native.test.ts` checks seeds 0, 4 and 17 against actual HTTP and SQLite state. These local fixtures demonstrate a bounded race, not general concurrency safety or deployed-source attestation.
