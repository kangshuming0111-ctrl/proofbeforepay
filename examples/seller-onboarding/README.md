# Seller onboarding preparation example

`controls.html` is deliberately **static**: it has no native handlers, browser
SDK, network calls or backend. It is a counterexample to treating a successful
static preflight as a working website. Its selector configuration is
`pbp-onboarding.json`.

From the repository root, run:

```sh
node --experimental-strip-types scripts/seller-onboarding-preflight.mjs examples/seller-onboarding/pbp-onboarding.json examples/seller-onboarding/controls.html
```

Exit 0 means the bounded HTML contains the configured controls with compatible
static shapes. It **does not** mean the booking flow ran or saved a record.
The JSON always declares `runtimeVerified:false` and `backendVerified:false`.
The actual DOM example initially disables its retry button until a lost
response exists; that is correctly reported as an unknown operation-state
condition instead of silently counted as a completed runtime check.

In the main workbench's optional booking area, use the four-step preparation
navigation to review scope, open **Connect an existing booking page**, prepare
controls, submit staging details, and inspect actual run prerequisites. The
13 controls are grouped as create (4), cancel (3), move (4), and retry/result (2).
Each still requires explicit confirmation; opening a group confirms nothing.

Run the local-only preflight, then choose **Download complete preparation kit
(ZIP)**. It contains the current configuration, connector, setup instructions,
protocol checklist, pinned `seller-dom-adapter.mjs` and `bridge.mjs`, and a
SHA-256 inventory. Fixed dependencies are downloaded and hash-checked before
the browser is offered the ZIP. The four individual template downloads remain
available without dependencies; only for that optional export must you obtain
and place the named SDK/bridge files yourself. Follow `PBP-SETUP.md` to connect
your actual native handlers. `native-completion-example.mjs` shows the small
call needed after an **actual native operation** finishes. It cannot run until
the generated connector is present and the seller has a real native handler.

For a working native JavaScript/HTTP example, use
`examples/seller-dom-staging/`; for backend protocol mapping, use
`examples/seller-lifecycle-staging/`. This preparation does not replace either
implementation or request operator approval automatically. Preparation, local
preflight and navigation do not prove a backend connection or test execution.
