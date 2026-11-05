# Four independently listed delivery stages

This is an invented native enquiry application for synthetic, loopback-only tests.
It uses Node's HTTP server and SQLite datastore plus an explicitly local test-mail
sink. It does not import the verifier, expected verdicts, application accounts,
model credentials, payment code, or the booking lifecycle protocol.

The probe separates native submission, stored-record inspection, a **fresh SQLite
connection**, and receipt inspection. An accepted POST cannot establish all four.
Its fixed and seeded failure profiles are `fixed`, `no-store`, `wrong-readback`,
and `no-email`. A local test-mail row is not proof of external email delivery.

## Run the adapter tool

Use Node 24.22.1 or another compatible Node with TypeScript stripping and
`node:sqlite`. From the repository root, create a plan JSON such as:

```json
{
  "schema": "pbp-delivery-stage-plan-v1",
  "runId": "stage-reference-1",
  "syntheticOnly": true,
  "scope": {
    "projectId": "synthetic-enquiry",
    "deliveryId": "reference-1",
    "criterionId": "manual-1",
    "sourceRevision": "enquiry-reference-v1",
    "requirement": "Submit an enquiry, retain it, read it from a new connection, and record its receipt in the local test inbox."
  },
  "payloadDigest": "b219470c065d3f47d9f3ad6db5d70ef7aab485bad300667f6cec76758af27fa2",
  "stages": [
    {"stage": "submit", "coverage": "adapter"},
    {"stage": "stored_record", "coverage": "adapter"},
    {"stage": "fresh_readback", "coverage": "adapter"},
    {"stage": "email_receipt", "coverage": "adapter"}
  ]
}
```

This example uses the SHA-256 of the canonical JSON object
`{"subject":"PBP synthetic enquiry","message":"Synthetic staged delivery test"}`,
not a secret or real enquiry. The native reference stores those actual fields;
the adapter recalculates the digest from returned or queried values. A real adapter must calculate the agreed canonical content digest
from the **actual native fields**, not just repeat the plan's expected digest.

```sh
node --experimental-strip-types scripts/run-delivery-stage-probe.mjs \
  --plan /absolute/path/plan.json \
  --adapter /absolute/path/to/proofbeforepay/examples/delivery-stage-staging/adapter.mjs \
  --output /absolute/path/new-report.json
```

The CLI explicitly **executes the selected local adapter module as code**. Review
that module first, and point it only at an isolated synthetic staging system. It
is not a sandbox. The browser report viewer accepts JSON data only and never
loads adapters. An existing output is refused before adapter import, and output
errors are not a license to repeat a native write. Unknown outcomes require
manual reconciliation; the runner never retries a submission automatically.

The reference adapter starts its own ephemeral loopback server and disposable
SQLite file, then closes both. To test a fault profile programmatically:

```js
import {createAdapter} from "./adapter.mjs";
import {createDeliveryStageProbe} from "../../lib/delivery-stage-probe.ts";
const adapter = await createAdapter({plan, profile: "no-store"});
try {
  const report = await createDeliveryStageProbe(adapter.stages).run(plan);
  // Keep the mismatching stored-record stage; do not flatten it to success.
} finally { await adapter.close(); }
```

## Adapt another native application

Implement `createAdapter({plan})` in a reviewed local module. Return
`{stages: {submit, stored_record, fresh_readback, email_receipt}, close?}`. Each
stage receives `{plan, previous, signal}`. Stages are invoked once in plan order,
with a timeout (default five seconds). Honour `signal`, use the exact synthetic
marker, and never replay an unknown write. An exception or unknown outcome closes
the probe and leaves later stages unknown; it does not prove that an earlier
side effect was cancelled.

Each observed record must contain the original native record ID and canonical
payload digest, actual marker, and declared revision. Stored-read and fresh-read
observations must declare different connection IDs. The verifier checks these
**cooperative declarations**; a string saying “fresh” does not itself establish a
new connection. The reference's SQLite code actually opens/closes a new one.

Keep every stage in the plan. Use `coverage: "unsupported"` for a capability the
native system does not have, and `"manual"` when no adapter can check it. Returning
only the stages that succeeded would hide gaps and is rejected.

## View without executing anything

In the workbench, open the booking integration guide, then **Check submission,
storage, readback and test inbox separately**, and choose the JSON report. It is
read only in browser memory (UTF-8, at most 64 KiB). Report data is not uploaded,
code is not executed, and no model or payment service is called. The viewer does
not bind an imported report to the current project's acceptance evidence.

The report preserves project/delivery/criterion IDs and declared revision so
future explicitly authorised integrations can bind them exactly. The current
viewer does not authenticate those declarations. SHA-256 proves internal
consistency only; it is not a trusted signature, independent backend observation,
real user study, website-wide acceptance, or proof of a bug-free product.

## Verify the implementation

```sh
node --experimental-strip-types --test \
  tests/delivery-stage-evidence.test.ts tests/delivery-stage-probe.test.ts \
  tests/seller-onboarding-ui-state.test.ts
```

The tests execute actual loopback HTTP, SQLite writes and fresh readback, plus
all three fault variants. They also cover absent/manual adapters, wrong markers,
wrong revisions, record/content mismatch, malformed/oversized objects, getter
rejection, timeouts, concurrent reuse, no automatic retry, and fixed error codes.
They are developer tests with synthetic data, not external developer onboarding
or novice-user results. Reuse `scripts/record-first-use-session.mjs` for genuine
human sessions; do not fill human records with these automatic runs.
