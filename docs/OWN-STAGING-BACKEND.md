# Connect an authorised staging booking backend

This path extends the existing HTTP protocol to an operator-reviewed staging deployment owned or authorised by the project participants. It does not scan a URL supplied by the browser, run a seller's code inside ProofBeforePay, or certify a deployed build. The built-in fictional lab remains a separate controlled example.

## Export the agreed contract

First create a project, include its exact booking requirement, separately confirm the technical protocol, and lock the scope. A member can download `GET /api/proofs/{projectId}/runtime-contract`. The authenticated response is a JSON attachment containing the agreed source and policy, synthetic request schema, endpoint paths, response/error expectations, and the exact eight- or eighteen-step inventory. It does not make a test request or call a model or PayPal.

For eighteen-step checks, the supported original requirement contains one explicit maximum from 2–12, for example `Each booking accepts at most 6 people.` The current protocol checks one guest, zero and fractional guests, the maximum minus one, the maximum, and the maximum plus one. It independently reads accepted boundary records. Two same-key requests are initiated together, require exactly one creation response and one reuse response with the same ID, and are followed by a separate readback. These finite observations do not prove every input, database state or concurrency schedule.

## Implement the protocol in your own staging application

Use the downloaded contract as the developer specification. Under an explicit test-only HTTPS directory, implement:

- `GET meta`: return the exact declaration association shown below; v2 also returns `protocol: "booking-http-v2"`. A mismatch stops the run before any booking writes.
- `POST bookings`: validate synthetic inputs, invoke the application's actual staging booking logic, store the test record, and return the receipt and original fields. v2 must enforce the agreed maximum independently of anything declared by the checker.
- `GET bookings/{receiptId}`: independently query the staging test datastore by ID. Do not reconstruct expected values from a GET query or echo them from the checker.

The `meta` response must contain these exact values from the approved entry installed by the operator. `revision` is the HTTP field name for `deploymentRevision`; it is not the registration revision.

| HTTP response field | Required source in the installed registration |
| --- | --- |
| `revision` | `deploymentRevision` |
| `projectId` | `projectId` |
| `registrationRevision` | `registrationRevision` |
| `frontendBundleDigest` | `frontendBundleDigest` |
| `backendArtifactDigest` | Same value, required only if that field is declared |
| `backendSourceCommit` | Same value, required only if that field is declared |
| `protocol` | Agreed protocol; `booking-http-v2` is mandatory for a v2 response |

Configure these declaration values in the staging application after operator review. Do not derive them from a checker request: `GET meta` sends none of the expected declaration fields. The frontend digest covers the exact uploaded static file map, including canonical raster representations. At delivery upload the approved entry is pinned with that version. Each new run requires the entire pinned declaration to equal the current unexpired operator entry. Changing a revision, digest, commit, expiry, URL or any other declaration field requires a newly reviewed delivery. Matching metadata demonstrates declared association only; a service can report an identifier without proving that its running code was built from that identifier.

Accept only the generated canary customer `PBP synthetic`, email `pbp-test@example.invalid`, slot `2099-01-01T10:00:00Z`, and the matching run UUID/marker in this test namespace. Missing slot or malformed-email probes return `400/422` with code `synthetic_validation_failed`. v2 zero/fractional counts return `party_size_invalid`; above-limit counts return `party_size_exceeded`. Do not send notifications, make payments, consume real inventory or create real customer records. Use a separate test datastore or a strictly isolated namespace with bounded expiry and capacity.

Use `Idempotency-Key` as an atomic uniqueness constraint within the deployment's namespace. An identical request reuses the same receipt; different valid data under that key returns `409 idempotency_conflict` and leaves the original unchanged. The concurrent pair uses its own key, distinct from the earlier creation key. Two equal HTTP receipts alone do not attest that no hidden duplicate rows exist anywhere in a database.

Do not implement a memory map, canned status sequence or an adapter that bypasses the actual staging business handler merely to satisfy the checker. The HTTP evidence establishes only what that registered service returned during this run. ProofBeforePay does not inspect its source or prove the deployment was built from a supplied commit.

Each response must be bounded JSON of at most 16 KiB. Redirects, cookies, ambient authorization headers and unregistered destinations are not used. A run has at most eight or eighteen requests, a 30-second total budget and four seconds per request. Endpoints requiring private authentication credentials are outside this adapter; never put a token in the registration URL.

## Generate a local registration proposal

Use the exact static frontend export that the seller will upload: root `index.html`, at most 40 HTML/CSS/PNG/JPEG/WebP files, and the existing delivery path and byte limits. The helper does not unpack archives, install dependencies, run code or fetch resources.

```sh
node --experimental-strip-types scripts/create-runtime-registration.mjs \
  --project-id PROJECT_ID \
  --target-id shop-booking-staging \
  --label "Shop booking staging" \
  --base-url https://staging.example.org/pbp-test/ \
  --deployment-revision build-2026-11-02 \
  --registration-revision review-01 \
  --expires-at 2026-11-09T00:00:00.000Z \
  --frontend-folder /absolute/canonical/frontend-export \
  --output /absolute/canonical/registration-proposal.json
```

Replace the illustrative project, URL, revision, future expiry and paths with the actual authorised values. `--protocol` defaults to `booking-http-v2`; use `--protocol booking-http-v1` for an agreed basic protocol. Optional `--backend-artifact-digest` accepts a lowercase SHA-256, and `--backend-source-commit` accepts a lowercase 40- or 64-character hexadecimal identifier. Both remain declarations.

The helper first inventories metadata and rejects unsupported, hidden/private, symbolic-link, hard-link or non-regular entries. It does not silently omit `.env`, `.git`, secrets, scripts or other files and then hash a different package. It reads only the explicitly named bounded frontend folder, verifies UTF-8 and raster structure through the same static-file validator used by uploads, and hashes the exact same saved file map. Text remains text; validated raster bytes use the same canonical data URL representation as browser uploads. Stop editing the export while creating the proposal; changed files are rejected.

The output contains `status: "proposal-awaiting-operator-review"`, `operatorApprovalRecorded: false`, `installed: false` and a `candidate` entry. Its provenance marker names the required installed-entry format; generating the file does not confer approval. File contents and environment credentials are not included. Without `--output`, the proposal is printed to stdout. An output path must be a new `.json` outside the frontend folder, under existing canonical directories; files and symlinks are never overwritten, and the new file uses owner-only permissions.

## Operator review and server installation

A project member cannot self-register an arbitrary endpoint through the web UI or runtime request. An operator must separately review the candidate's destination ownership/authorization, synthetic-only effects, expected protocol, frontend digest, deployment declaration and expiry. Only after that actual review may the operator install an approved entry in the server-only `PBP_RUNTIME_TARGETS` JSON array. Do not change this server configuration merely because a proposal contains an approval-format field.

The registry allows at most 20 entries and 32 KiB of UTF-8 JSON. Use canonical HTTPS directory URLs with the trailing slash and no credentials, query, fragment, encoded/dot path, private IP or loopback host. Every `lab-` ID is reserved for built-in examples. A syntactically public hostname is not ownership verification or a DNS-rebinding-safe arbitrary URL validator; operators must authorise and control the actual destination.

An entry binds project ID, protocol, target ID, registration revision, frontend bundle digest, deployment revision and expiry. The seller chooses the compatible registered target when uploading the exact frontend. A run checks the current server declaration again before external requests. Revocation, expiry or a changed declaration requires a newly reviewed target/delivery; an old ID is not permission to reuse changed configuration. Existing historical snapshots remain evidence of their original declaration and are not silently renewed.

## What this does and does not establish

This tooling has local contract/export and CLI tests. A generated proposal is not an installed registration, a successful staging integration, an operator approval, a production deployment, a new real-user study or proof of superiority to another product. A matching frontend hash does not attest backend deployment provenance. HTTP checks do not operate the seller's frontend form, verify email delivery, certify site-wide security, resolve a legal dispute or accept/pay for delivery automatically. Buyer acceptance and payment remain separate actions tied to the saved version and evidence.

No external staging endpoint, model or payment call is made by the proposal helper. Use the real developer's authorised staging deployment to establish actual integration evidence; do not present the built-in lab or a local fake as that external integration.
