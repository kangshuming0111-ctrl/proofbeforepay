# A pinned third-party Flask tutorial adapter

This adapter runs the **unmodified official Pallets Flask tutorial** at tag 3.1.2,
commit `2c1b30d0503cfb064f1cb252e6614a06915a362a`. It is a separate third-party
framework example, not a customer production website or a claim to support every
Flask application. The upstream tutorial supports registration, login and blog
post creation. It does **not** support email; that stage must stay unsupported.

Primary sources:

- https://github.com/pallets/flask/tree/2c1b30d0503cfb064f1cb252e6614a06915a362a/examples/tutorial
- https://flask.palletsprojects.com/en/stable/tutorial/

## Prepare the isolated runtime

Clone the official project outside the ProofBeforePay source, check out the
fixed commit, and create a dedicated virtual environment. Install the official
PyPI Flask 3.1.2 release there. Keep the upstream BSD-3-Clause licence with the
source. Do not use a real application database, account or customer information.

```sh
git clone --branch 3.1.2 --depth 1 https://github.com/pallets/flask.git /absolute/path/flask-source
python3 -m venv /absolute/path/flask-venv
/absolute/path/flask-venv/bin/python -m pip install 'Flask==3.1.2'
```

Set `PBP_FLASK_SOURCE` to that absolute Git checkout and `PBP_FLASK_PYTHON` to the
isolated Python executable. These are paths, not service credentials. The adapter
checks the exact commit, refuses changes/untracked files in `examples/tutorial`,
and checks the installed Flask package version before starting anything.

Use the same CLI described in `../delivery-stage-staging/README.md`, with this
`adapter.mjs` and a plan declaring:

- `sourceRevision`: `2c1b30d0503cfb064f1cb252e6614a06915a362a`
- a new synthetic `runId` beginning `stage-`
- stages `submit`, `stored_record`, `fresh_readback` as `adapter`
- `email_receipt` as `unsupported`
- `payloadDigest`: SHA-256 of compact UTF-8 JSON `{"title":"YOUR-RUN-ID","body":"PBP synthetic body"}` in that key order.

```sh
PBP_FLASK_SOURCE=/absolute/path/flask-source \
PBP_FLASK_PYTHON=/absolute/path/flask-venv/bin/python \
node --experimental-strip-types scripts/run-delivery-stage-probe.mjs \
  --plan /absolute/path/flask-stage-plan.json \
  --adapter /absolute/path/proofbeforepay/examples/delivery-stage-flask/adapter.mjs \
  --output /absolute/path/new-flask-stage-report.json
```

The CLI executes a reviewed local module; it is not a sandbox. It reserves a new
output before import. On uncertain outcomes it does not retry native writes.

## What actually runs

The wrapper imports the original `flaskr.create_app`, providing only an isolated
SQLite path and a runtime-generated signing secret. It uses a fresh loopback
Werkzeug server, a synthetic randomly generated account and native HTTP routes.
No original Flask source is changed. Account passwords and cookies remain in
memory, are never reported, and the disposable database is deleted on close.

The submission stage registers/logs in, posts through the original `/create`
route, then finds the native post ID and actual title/body on the original page.
The stored-record stage opens a separate read-only SQLite connection and hashes
actual native title/body fields. The fresh-readback stage stops and restarts the
original application against that same database, makes a new public page request,
and queries through another new SQLite connection. Those actual steps support a
limited developer-observed persistence result. They are not browser button tests,
independent deployment attestation or a human usability study.

Email is deliberately **unsupported**. Do not add a fake mail row or claim that
an unimplemented upstream capability failed. A plan that genuinely requires
external delivery needs a separately implemented authorised inbox adapter and
its own evidence.

Reports are cooperative bounded observations. A report digest does not prove
that a third party actually executed the adapter, and matching identifiers do not
authenticate participants. Importing this report in the workbench does not bind it
to the current project's acceptance or change payment.
