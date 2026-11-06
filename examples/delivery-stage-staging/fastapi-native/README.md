# Official FastAPI SQL tutorial, native HTTP and SQLite

This opt-in local adapter runs the unchanged official FastAPI SQL tutorial from
tag0.115.12, commit `628c34e0cae200564d191c95d7edea78c88c4b5e`.
The included `upstream.py` is byte-identical to
[the official file](https://github.com/fastapi/fastapi/blob/628c34e0cae200564d191c95d7edea78c88c4b5e/docs_src/sql_databases/tutorial001_py310.py).
Its original MIT licence and source hashes are included. This is a third-party
framework example, not a merchant website or general FastAPI integration.

Using Python3.10+, create a separate virtual environment and explicitly install
the locked official PyPI dependencies from `requirements.txt`. Set
`PBP_FASTAPI_PYTHON` to that environment's absolute Python path. No installer,
application, or adapter runs automatically when a report is viewed or uploaded.

In the workbench's optional developer tools, prepare a plan for one current
criterion. Keep its generated synthetic run marker. Set declared source revision
to the commit above, and leave test inbox **unsupported**. The payload digest is
SHA-256 of compact UTF-8 JSON with this exact field order:

```json
{"name":"YOUR-PLAN-RUN-MARKER","age":18,"secret_name":"PBP synthetic label"}
```

The `secret_name` field is an upstream model field populated with this public
synthetic label; never use a real secret or customer data. You can calculate the
digest with `fastapiPayloadDigest(runMarker)` exported by `adapter.mjs` (importing
it alone does not start Python or perform any request). Enter the digest into
the plan form, then download the current-criterion plan.

Run from the repository root, using new absolute local output paths:

```sh
PBP_FASTAPI_PYTHON=/absolute/isolated-venv/bin/python \
node --experimental-strip-types scripts/run-delivery-stage-probe.mjs \
  --plan /absolute/pbp-current-stage-plan.json \
  --adapter /absolute/proofbeforepay/examples/delivery-stage-staging/fastapi-native/adapter.mjs \
  --output /absolute/new-fastapi-report.json
```

The existing CLI validates the plan and reserves a new owner-only output before
executing the reviewed local adapter. It is code execution, not a sandbox. The
adapter verifies source bytes and package versions, starts an ephemeral loopback
ASGI application with a disposable SQLite directory, submits one native HTTP
POST, reads native fields from a new read-only SQLite connection, stops/restarts
the application against that same database, and performs a fresh HTTP read and
another independent SQLite connection. It never retries a write. An uncertain
outcome remains unknown and must be reconciled before any new execution.

The app has no email or authentication workflow. Email remains unsupported, not
failed and not fabricated. A successful result is three separately matching
cooperative observations, one unsupported stage. This does not prove browser
buttons, external email, deployed source identity or whole-site correctness.

Select the output JSON in the same current project/version and explicitly share
it. The server binds the participant's claim to the current upload digest and
exact criterion. Both project participants can reopen it; replacement archives
the original version. The binding is an association, not an independent backend
attestation. Existing acceptance/payment evidence is never rewritten or passed
by this appendix. The standalone local viewer remains available without saving.
