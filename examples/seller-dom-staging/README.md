# Configurable DOM adapter reference

This is a second, differently structured JavaScript reservation frontend. Its
native form handlers issue real synthetic booking/cancel/move requests; the new
DOM executor only fills configured controls, dispatches input/change events and
clicks their existing submit buttons. It makes **no fetch calls** itself.

It is developer-operated and uses the existing lifecycle native SQL handler in
the public lab. It is not an independent customer, a general website scanner,
React integration evidence, browser attestation or deployment attestation.

## Try the actual form

Open the lab's `/seller-adapter/fixed/index.html` and choose **Start a fresh
practice session**. Submit a fictional reservation, then choose **Read saved
reservations**. Separate pinned `cancel-credit`, `move-loss`, `retry-duplicate`
directories use the existing controlled faulty native handlers. A URL query
cannot change the backend profile. All requests are synthetic; there are no
customer accounts, real funds, messages or automatic acceptance.

`scripts/build-guest-lab.mjs` copies these files, the unchanged existing
`examples/seller-lifecycle-staging/frontend/bridge.mjs`, and
`public/sdk/seller-dom-adapter.mjs`. It writes deployment-owned per-profile
configuration. The configured backend is `/seller-reference/{profile}/pbp/`.
The build also supplies `runtime-config.mjs`; loopback parents remain opt-in in
the existing operator-owned lab environment. No checker imports into this UI.

## Connect your own staging page

1. Copy `public/sdk/seller-dom-adapter.mjs` and the existing `bridge.mjs` to your
   dedicated, authorised staging origin. Serve JavaScript as an ES module.
   Retain your original form handlers and native datastore implementation.
2. Configure `createSellerDomExecutor` with the issued synthetic `runId` and selectors for create/cancel/move,
   retry, and result. Map selectors at deployment, never from a parent message.
   Each selector must match exactly one visible, enabled control. Use
   `beforeAction` to expose the relevant panel. Native value setters dispatch
   bubbling `input` and `change` events; each framework integration still needs
   real browser testing. Do not assume all React controlled inputs work merely
   because their DOM values change.
3. Implement `observe(command)` as a subscription to the **native operation's
   completion**. Return `{promise,cancel}` before the adapter clicks. Resolve
   once with `{sequence,actionId,requests,receipt?}` only after the real form
   operation finishes. Stamp the same result region with
   `data-pbp-sequence=sequence` and `data-status=success|error|unknown`. The
   adapter reads its actual visible text. Missing/stale/oversized completion,
   timeout or navigation closes this executor; writes are never auto-retried.
4. Pass `command => executor.execute(command)` to `installSellerBridge` using
   exact parent-origin configuration, frontend revision and backend base path.
   Keep the existing source/origin/nonce/sequence validation. Dispose the
   executor on page exit. The example `app.mjs` shows all of these connections.
5. Implement/map the fixed booking HTTP protocol on the **same staging origin**,
   submit the manifest and have the authorised operator approve its exact
   delivery digest. Registration, expiry and the main server's independent GET
   reconciliation are unchanged. An SDK download never registers a target.

Supported finite actions are the existing 11 named lifecycle form operations,
including repeated cancellation and one explicit original-key retry after a
lost response. The shared 20-step checker separately verifies readbacks. The
adapter does not accept arbitrary selector commands, scripts or URLs from its
parent and does not add any authority to accept work or pay.

## Evidence and limits

The completion journal and DOM are still controlled by the seller. A plausible
client journal is not proof that a request ran, and the backend read endpoint is
also seller-controlled. The server's separately retained reads can expose
inconsistencies; neither the SDK nor hashes establish that a remote deployment
was built from the uploaded source. Do not enable untrusted scripts in the main
static preview, remove origin restrictions, or connect production customer data
to make this example work.
