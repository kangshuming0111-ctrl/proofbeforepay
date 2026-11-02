# Independent synthetic seller staging

This is a small, separately deployable seller-side booking service. It has its
own business policy, SQL migration and datastore. It does not import the
ProofBeforePay runner, checker expectations, or built-in lab fixture handlers.
It is a reference for implementing an agreed interface against a seller's own
authorised staging business handler. It is not a real merchant integration.

Only synthetic bookings are accepted. This code sends no email, calls no payment
provider, and makes no outbound network request. Do not connect it to customer
records, live inventory, notification jobs or production databases.

## Files and explicit deployment contract

- `worker/index.mjs` is the standalone Workers ESM entry point.
- `worker/booking-service.mjs` handles the three bounded HTTP routes.
- `migrations/0001_seller_staging.sql` creates an independent database. The native
  `seller_business_policy` row starts with a maximum of six guests.
- `wrangler.example.json` contains non-working placeholders. Nothing here
  provisions, installs, approves or deploys a service by itself.

The handler reads only these explicitly supplied bindings/values from `env`:

| Binding/value | Meaning |
| --- | --- |
| `SELLER_DB` | The separate D1 database, migrated before requests are served |
| `SELLER_PROJECT_ID` | Exact ProofBeforePay project ID |
| `SELLER_REGISTRATION_REVISION` | Exact operator-reviewed registration revision |
| `SELLER_FRONTEND_BUNDLE_DIGEST` | SHA-256 of the exact uploaded frontend bundle, using the project digest CLI |
| `SELLER_DEPLOYMENT_REVISION` | Seller's declared backend deployment revision |
| `SELLER_BACKEND_ARTIFACT_DIGEST` | Optional declared 64-character lowercase hexadecimal artifact hash |
| `SELLER_BACKEND_SOURCE_COMMIT` | Optional declared 40- or 64-character lowercase hexadecimal commit |

Project/registration IDs use 1–80 ASCII letters, digits, `_` or `-`, starting
with a letter or digit. Deployment revision uses 1–120 ASCII letters, digits,
`.`, `_` or `-`, also starting with a letter or digit. These association values
are not credentials. No process-wide environment or secret file is read here.

These identifiers and optional file hashes are declarations. They do not prove
that the deployed backend came from the uploaded frontend or from a particular
source commit. `deploymentAttestation` is explicitly false.

## Adopting the reference in a separate staging deployment

1. Lock the buyer's scope and download its backend contract from the project.
   This reference implements `booking-http-v2`; the seller's native policy must
   match the agreed requirement. Its default maximum is six guests.
2. Create an independent Worker workspace and a new, disposable D1 database.
   Copy these example files there. Do not bind the application or verification
   lab database. Copy the template to a working Wrangler configuration and
   replace all placeholders with the authorised staging configuration.
3. Explicitly apply the SQL migration to that separate database, using the
   deployment account's normal workflow. The request handler never creates or
   migrates schema automatically.
4. Compute the exact frontend bundle digest using
   `scripts/create-runtime-registration.mjs` as explained in
   `docs/OWN-STAGING-BACKEND.md`. Set the four required association values.
   Optional backend hashes, when supplied, must describe the seller's actual
   chosen build artifact/commit; they remain declarations.
5. Deploy only after the operator has authorised the endpoint and its disposable
   namespace. Ask the operator to review ownership, the absence of side effects,
   the deployment manifest and the `/pbp/meta` values. The existing registration
   CLI produces a proposal, not permission or an installed registration.
6. The operator can install an approved project-scoped `PBP_RUNTIME_TARGETS`
   entry with its own HTTPS `/pbp/` base URL, matching digest/revisions and a
   bounded expiry. Uploading the exact frontend then freezes that declaration.
7. A project member must explicitly authorise each bounded checker run. An
   expired, removed or changed registration permits no new HTTP run. Unknown
   results from an abandoned run can be retained by zero-network recovery.

No deployment, D1 binding, operator approval or external seller run is implied
by having this example in the source package or by passing its local tests.

## HTTP behaviour and safety bounds

`GET /pbp/meta` reads the seller's native policy and declares the configured
association. `POST /pbp/bookings` validates input, reads the native maximum and
atomically inserts a receipt. `GET /pbp/bookings/{id}` independently reads SQL
by generated receipt ID. It receives no expected field values from the checker.

The exact six request fields are `testRunId`, `marker`, `customer`, `email`,
`slot` and `partySize`. UUID, marker, synthetic customer, test email and far-future
slot must match the public contract. Idempotency keys must match that run and
one of the bounded protocol suffixes. Missing-slot, malformed-email, zero-size
and fractional-size probes are rejected before storage. Real contacts, arbitrary
fields, credentials/cookies, browser Origin headers, query strings, fragments
and bodies over 4 KiB are rejected. Accepted guest counts never exceed 12.

SQLite/D1 independently constrains the synthetic namespace, policy maximum and
unique `(manifest namespace, idempotency key)` pair. The same key/data returns
the original receipt; changed valid data returns 409 without rewriting it.
Rows expire after one hour. Each valid POST removes at most 100 expired rows,
and an atomic database trigger caps stored receipts at 1,000. An existing key
can still be replayed or rejected for conflict at capacity.

## Local verification and fault injection

From the repository root, with the supported Node runtime:

```sh
node --test tests/seller-staging.test.mjs
```

The tests execute the actual migration and service against native SQLite,
including persistence after reopen, simultaneous handlers on separate
connections, SQL namespace guards and capacity. Separate worker threads exercise
the atomic same-key insertion across independent SQLite connections.

For an intentional local fault, tests update **only the seller's own policy
row** to seven or five. Seven guests are then genuinely stored/read back, or a
six-guest booking is genuinely rejected. The buyer checker must continue to
derive its expected maximum of six from the agreed source; it must not learn
the expected answer from this service's metadata. There are no fixed/flawed
HTTP routes, no canned success responses and no fault flag accepted in requests.

Native SQLite and a local HTTP harness do not establish remote D1 scheduling,
independent merchant ownership, frontend-to-backend wiring, email delivery,
site-wide security or cryptographic deployment provenance.

An operator may also mount this handler under an existing controlled laboratory
URL by stripping the mount prefix and explicitly passing the configured
bindings. If that controlled deployment aliases an existing D1 binding, it uses
separate `seller_*` tables in a physically shared database. Describe that fact
accurately; it is not an independent database or a real third-party seller.
