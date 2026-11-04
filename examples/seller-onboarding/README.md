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

In the main workbench, open **Connect an existing booking page**, configure the
controls, run the local-only preflight and download four files. Copy the
existing `seller-dom-adapter.mjs` and `bridge.mjs` next to the generated
`pbp-connect.mjs` as instructed. `native-completion-example.mjs` shows the small
call needed after an **actual native operation** finishes. It cannot run until
the generated connector is present and the seller has a real native handler.

For a working native JavaScript/HTTP example, use
`examples/seller-dom-staging/`; for backend protocol mapping, use
`examples/seller-lifecycle-staging/`. This preparation does not replace either
implementation or request operator approval automatically.
