# Booking HTTP verification · 2 November 2026

The feature tests one concrete delivery promise: a synthetic booking that appears successful must also be independently readable and remain consistent under repeated or conflicting requests. It is an optional typed adapter, not a general website scanner. Contracts remain optional. A source AI assessment, a browser observation and this server HTTP report retain separate provenance.

## Buyer, seller and server responsibilities

1. The buyer enters original requirements, includes the relevant booking clause and separately confirms the fixed `booking-http-v1` protocol. The exact original substring and offsets are preserved; the technical protocol is an added, explicit agreement rather than invented contract wording. Changing the original source or chosen clause invalidates the confirmation.
2. The seller uploads a complete supported website folder and declares an operator-registered disposable backend target. Current entries are `lab-flawed` and `lab-fixed` in `lib/runtime-project.ts`. No arbitrary URL, caller-supplied script, live merchant data or ambient credentials are accepted.
3. A participant explicitly confirms an actual run. The server validates authentication, role, same origin, exact delivery and saved plan. A successful compare-and-swap saves a 45-second run lease before any HTTP request. A concurrent start loses the CAS without sending a duplicate run. A stale retry reuses the saved run and idempotency key.
4. The runner sends only fixed fictional booking data. After the run, the server re-reads the project and validates the run identity, exact uploaded-file digest, protocol, target and all steps before saving. Errors and timeouts remain unavailable; they are never converted into a pass.
5. The buyer inspects the exact report and human checks before accepting. Every failed or unavailable runtime step must be acknowledged, with a 10–500-character exception reason, if the buyer deliberately accepts despite it. AI and the test runner cannot accept work or initiate payment.

The source digest is SHA-256 over a canonical sorted representation of the saved uploaded-file map. It binds the report to that upload. It **does not prove that the separately deployed target was built from the uploaded files**, nor does a target's declared revision cryptographically attest its deployment. Those are explicit limits of the current operator-registered adapter.

## Fixed eight-step protocol

| Step | Request | Evidence required for observed support |
|---|---|---|
| Declared revision | `GET meta` |200 and the registered target's declared revision. A mismatch prevents booking writes. |
| Missing required field | `POST bookings`, omitting `slot` |400 or422 and JSON code `synthetic_validation_failed`. |
| Malformed email | `POST bookings`, malformed email |400 or422 and the same structured validation code. |
| Create | `POST bookings`, fixed synthetic payload and run-specific idempotency key |201, a permitted receipt ID and the exact expected fields. |
| Independent readback | `GET bookings/:id` |200, same ID and original fields. The request supplies only the ID, without the expected marker or booking fields. |
| Replay | Repeat the original POST and key |200 or201, same receipt ID and original fields. |
| Conflicting replay | Same key with changed party size |409 and JSON code `idempotency_conflict`. |
| Unchanged record | `GET bookings/:id` again |200 and the original record, unchanged after the conflict. |

Each run is bounded to eight requests, 30 seconds in total, four seconds per request and 16 KiB per JSON response. Redirects are rejected before a response body is accepted. No cookies, authorization headers or provider keys are sent. The report retains permitted receipt identifiers and matching/mismatching field names, not arbitrary response contents. Unknown, non-JSON, oversized or timed-out responses cannot establish support. A revision or creation failure can leave dependent steps unavailable rather than fabricating readback evidence.

The fixed data uses a UUID run ID, `PBP-<run ID>` marker, `PBP synthetic` customer, `pbp-test@example.invalid`, the 2099 test slot and party size 2. The fixture rejects arbitrary customer data and extra fields. This is not authorization to test a third party's production endpoint.

## Saved evidence and revisions

Reports include delivery ID, SHA-256 digest, run/report ID, plan, target, timestamps, all eight individual observations and counters derived from those observations. Saved history permits up to 20 immutable reports per delivery. A new run appends evidence; it does not rewrite earlier reports.

An acceptance snapshot retains the exact runtime report, target and digest used for that decision, plus any explicit exception. A supplemental report cannot silently rebind an earlier acceptance or its later payment. Replacing a delivery clears its current run, report and runtime history; the previous delivery remains archived with its original evidence. Pending runs block conflicting delivery, acceptance and payment mutations. Project-list summaries omit detailed runtime reports and leases.

## Actual controlled observations

Two hosted runs on 2 November 2026 used the same protocol against separately declared fixture revisions:

| Controlled target | Create | Independent read | Supported | Mismatched | Unavailable |
|---|---|---|---:|---:|---:|
| Flawed, `booking-flawed-v1` |201 |404 |2 |6 |0 |
| Corrected, `booking-fixed-v2` |201 |200 |8 |0 |0 |

The flawed implementation claims creation without storing the booking, generates a new receipt on replay and fails the conflict contract. The corrected fixture uses its own D1 table, atomic keyed insertion, stored readback and structured409 conflicts. Synthetic rows have a one-hour TTL and a 1,000-active-row cap; bounded cleanup is part of the fixture. A standalone native SQLite suite tests the same fixture logic, including reopening a file-backed database, idempotency and capacity. This does not establish permanent durability or the absence of every concurrency failure in a real customer system.

Reports were obtained from actual requests, not prefilled UI counters. These two purpose-built cases demonstrate the counterexample and its correction. They are not a population accuracy estimate, a customer trial, a penetration test or independent security certification.

## Public lab and authenticated workbench

[Open the isolated public lab](https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/). It is a separate deployment and database. It has no main-workspace records, model credentials or real payments.

- **Delivery comparison:** supplied fictional requirements and files are checked locally in the browser. Buyer/seller views are one visitor's simulated roles. Feedback, acceptance and simulated payment remain in page memory. This is not a live AI response, browser observation, authenticated collaboration or legal decision.
- **Actual HTTP panel:** after per-run consent, the worker sends genuine network requests to the lab's own registered synthetic API. Both returned reports can be compared and downloaded. The HTTP evidence is separate from the local static sample agreement.
- **Optional task recorder:** records content-free local events and monotonic task timing only when the visitor starts it. Operator type and outcome are self-declared; participant identity is unverified. No automatic analytics transmission or user-study success classification occurs. Refreshing the page resets its in-memory state. The reset control clears handoff and HTTP displays while retaining an already started task record for export.

The authenticated main workbench additionally stores buyer/seller membership, locked plans, exact-version delivery history, acceptance and separately confirmed test payment. Public lab interaction does not prove that full flow is usable by an unfamiliar participant. The main site's access audience remains unchanged.

## Verification and remaining evidence

At this implementation checkpoint the TypeScript suite passed 352 tests, the actual SQLite fixture suite passed 8 tests, and the isolated API/D1 suite passed 6 groups. The isolated API suite deliberately blocks outbound requests: its unavailable reports verify persistence, concurrency, invalid-input handling, exception acceptance, history and stale evidence protection, not live network behavior. The hosted reports above supply separate real-network evidence. The parent implementation record retains raw reports and test logs.

A genuine continuous interaction recording still requires capture, playback inspection and a verified output file. The existing 135-second public video is an edited still-image walkthrough. No unfamiliar-user study has been completed; the [first-use plan](FIRST-USE-TEST-2026-11-02.md) and its blank CSV remain plans, not results. Devpost remains an editable draft. Neither passing tests nor this protocol warrants a claim that the whole website is bug-free, secure, legally compliant or guaranteed to win a competition.

## Source map and reproducible checks

| Boundary | Source |
|---|---|
| Plan/report schema and validation | `lib/runtime-checks.ts` |
| Fixed network runner | `lib/runtime-runner.ts` |
| Registered targets, digest, exact report decision | `lib/runtime-project.ts` |
| Stored run lifecycle | `lib/runtime-actions.ts`, `app/api/proofs/[id]/runtime-checks/route.ts` |
| Main-workbench panel/history | `app/components/RuntimeCheckPanel.tsx`, `app/components/EvidenceHistoryPanel.tsx` |
| Isolated guest UI and HTTP entry | `app/guest-lab/`, `scripts/build-verification-lab.mjs` |
| Synthetic backend and SQL migration | `tests/fixtures/booking-backend/` |
| Optional local task record | `lib/first-use-trial.ts`, `tests/first-use-trial.test.ts` |

With the repository's supported Node version and installed dependencies, run the focused checks:

```sh
node --experimental-strip-types --test tests/runtime-checks.test.ts tests/runtime-actions.test.ts tests/first-use-trial.test.ts
node --test tests/booking-lab.test.mjs
node tests/run-collaborative-sandbox-local.mjs --suite runtime-checks
```

The isolated API command creates a fresh local test database and uses the harness's explicit local identities; never point those identities at production. To build a separate lab artifact, choose a new absolute directory: `node scripts/build-verification-lab.mjs --output /absolute/new-directory`. The builder refuses existing paths, including symlinks. Publication still requires the normal Sites source/package/version workflow; a local build alone is not a live deployment.
