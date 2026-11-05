# Independent synthetic enquiry backend

This is a separate `enquiry-http-v1` service, not a booking adapter. It persists fictional enquiries in a native SQLite/D1 schema and implements its own input validation and idempotency. It imports no ProofBeforePay checker, expected result or evaluation code.

It does **not** execute a delivered website form, deliver email, authenticate real customers, prove backend honesty or grant acceptance/payment. Random run and receipt IDs isolate fictional exercises; they are not a real customer authorization model. Do not place customer data, credentials, payment data or production integrations in this service.

## Deploy an authorized disposable service

1. Copy `wrangler.example.json` to your local staging configuration and replace the Worker/database placeholders with a dedicated disposable service and database. Apply `migrations/0001_enquiries.sql` using your normal authorized deployment workflow.
2. Keep `ENQUIRY_PROFILE:fixed` and choose an immutable, bounded `ENQUIRY_REVISION`. The profile is server configuration, never a caller-selected parameter. Other profiles are explicit faulty fixtures for controlled tests.
3. Provide the ProofBeforePay operator with the staging base URL, declared revision, current delivery digest, project ID, authorization for the fixed synthetic POSTs and an expiry. The operator registers an exact scoped entry in `PBP_ENQUIRY_TARGETS`. Downloading or deploying this example does not register or approve it.
4. The buyer separately confirms the optional backend-only agreement in the current delivery. Each test step is manually authorized through the workbench; the retry after readback needs an additional explicit original-key confirmation. Stopping retains unknowns and does not undo committed writes.

Example operator entry (replace all identifiers; never put credentials in it):

```json
{
 "id":"seller-enquiry-staging-1",
 "label":"Authorized disposable enquiry backend",
 "projectId":"REPLACE_WITH_CURRENT_PROJECT_ID",
 "deliveryDigest":"REPLACE_WITH_64_LOWERCASE_HEX_CURRENT_DELIVERY_DIGEST",
 "baseUrl":"https://your-authorized-staging-host/pbp/",
 "revision":"seller-enquiry-v1",
 "registrationRevision":"operator-approval-1",
 "expiresAt":"REPLACE_WITH_CANONICAL_FUTURE_UTC_ISO",
 "protocol":"enquiry-http-v1",
 "testOnly":true,
 "authorisedSyntheticMutations":true,
 "provenance":"operator-approved-declaration"
}
```

The base must be a canonical public HTTPS directory on a separate approved staging origin. The workbench never accepts an arbitrary URL, query, forwarded session or client-selected body. Registration pins a declaration, not attestation of deployed source or native storage truth. Operators must use authorized synthetic-only targets; fixed public host syntax is not DNS ownership proof.

## Wire contract

`GET /pbp/meta` returns exactly `{protocol:"enquiry-http-v1",revision,syntheticOnly:true,emailDelivery:false}`.

`POST /pbp/enquiries` accepts exactly `{testRunId,marker,name,email,subject,message}` with UUID run, `marker:"PBP-"+run`, `name:"PBP synthetic"`, `email:"pbp-test@example.invalid"`, `subject:"Website enquiry"` and a nonempty message up to500 characters. The `Idempotency-Key` must equal `pbp-{run}-enquiry-normal`, `...-loss` or `...-invalid`. Successful create returns201, same-key same-body replay200, same-key different-body409 `{code:"idempotency_conflict"}`, invalid body400 `{code:"invalid_enquiry"}`.

Each receipt is `{id,testRunId,marker,name,email,subject,message,revision,idempotencyKey,status:"received"}`. `GET /pbp/enquiries/{id}` independently reads one native row. `GET /pbp/runs/{run}` queries its native records and returns `{testRunId,revision,enquiries}`; more than8 records fails rather than truncates. Requests carrying Cookie, Authorization or a foreign Origin are rejected. Credential-free server requests are allowed. No email is sent.

The first successful `...-loss` commit deliberately returns504 `{code:"response_lost_after_commit"}` without the receipt ID. This is a controlled HTTP response after a real commit, not a production network outage. Query the original key before an explicit retry. The fixed implementation's unique command INSERT and receipt trigger commit atomically; concurrent same-key losers do not insert another receipt.

Fault profiles execute inspectable behavior: `fake-success` returns an invented success without persisting; `wrong-fields` actually stores a different message; `duplicate-retry` really inserts a second loss-key receipt on replay. Do not use these fixtures as an external seller result. Data expires after1hour, cleanup is bounded, global receipts are limited to500 and request JSON to2KiB.

Run the repository's `tests/enquiry-*.test.ts` with the pinned Node runtime. They execute actual local SQLite and the service's native SQL. They do not prove remote D1 deployment, unfamiliar-seller adoption, website-form wiring, mailbox delivery, real account roles or payment.
