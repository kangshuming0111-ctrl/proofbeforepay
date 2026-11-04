# Evidence-chain improvements and verification — 2026-11-04

This implementation closes gaps found in the previous product review. It does not assert a competition result or replace external user validation. Devpost and video work remain deferred.

## Observable user flow

1. The seller uploads the website delivery. A separate build-file selector calculates JS/MJS file hashes locally and saves only bounded metadata, without executing or uploading the script source.
2. The platform can compare those declared scripts together with the uploaded static files against the approved staging deployment. Missing scripts, unsupported references, changed manifests and the uninspected dependency graph remain explicit unknowns.
3. The buyer sees a complete catalog of text-visibility observations, deployment-byte reports and time-policy sessions. The buyer chooses which exact reports to include or exclude. Every included mismatch/unknown needs individual acknowledgement and a reason; exclusion also needs a reason. A planned policy is not executed evidence; running checks block acceptance.
4. The buyer can turn a real mismatch/unknown into a versioned repair task, associated with a genuine agreed criterion or a separately labelled technical supplement. The seller uploads a new delivery, runs its checks and proposes an exact retest finding. The buyer confirms an unchanged-plan supported repair, explicitly accepts an exception, or requests further work. Missing checks and changed scope cannot be automatically marked repaired.
5. Acceptance freezes report references, the complete reviewed catalog, the current artifact manifest and exact repair-task heads. Open tasks require separate explicit acknowledgement. The reviewed public objects are archived independently; later session versions cannot overwrite the evidence reviewed at signing. Payment remains a separate action.
6. Participants can download one server-assembled, bounded evidence bundle. The CLI and public browser verifier inspect its current delivery files, native report conclusions, precise frozen references and repair history. Metadata key reordering is harmless; changes to facts, ordered events or source bytes are not.

## Additional issues found and fixed during review

- Collaborative acceptance can be recorded before `acceptedDeliveryId`: both artifact submission and repair UI now lock against the real collaboration stage.
- Late mutation replies could restore an old project or perspective: component context fences discard obsolete callbacks.
- Live browser testing exposed a miswired catalog refresh URL: the metadata save succeeded, but refresh requested a missing route and received HTML. Refresh now uses the existing `GET /api/quotes/:id` route; the request-path regression test is tied to that real route contract.
- A late catalog GET could overwrite a newer accepted state in the same project: the parent now uses an apply revision plus latest-refresh sequence. Executed deferred-request tests cover both response orders, accepted-state preservation and context changes.
- Composed SQL predicates could exceed D1 parameter limits at retained maximum size: `json_each` keeps the full report/task freshness guard bounded. The maximum tested composition uses 41 parameters.
- Canonical public hashes and native object comparisons previously disagreed about JSON key order: native structural comparisons now preserve array order while ignoring object-key order.
- A caller could mutate an object during asynchronous offline hashing: the verifier now captures a validated synchronous clone before its first await; injected getter execution is tested to remain zero.
- Original time-interface bodies could contain unrelated private fields: public projections retain only validated protocol evidence and are replayed before export.

## Executed checks

- Full repository suite: **989/989 passed**, including the final refresh-route correction, with zero skipped or cancelled tests.
- TypeScript: zero diagnostics; normal isolated application builds passed.
- Fresh, independently built Worker/D1 suites: artifact/deployment chain (6 groups), acceptance catalog/archive chain (3), linked repair/retest/export chain (3), existing time-policy regression (4) and existing source-visibility regression (3). These are scenario groups, not a benchmark accuracy score.
- Focused tests include actual owned HTTP where HTML/CSS stay identical and only `app.mjs` changes, independent native SQLite time-rule observations, atomic stale-catalog/task counterexamples, immutable archive constraints, legacy v1 export compatibility, v2 tampering negatives and browser verifier/controller checks.
- DeepSeek reviewed limited source packets after coherent implementation changes. Findings were independently reproduced, rejected with counterexamples, or explicitly retained as invalid/unverified. Final targeted followup, catalog and export reviews returned no findings in their supplied packets. The AI reviews did not execute the tests.

The fresh API tests use explicit synthetic gateway identities and blocked outbound HTTP. They do not prove a real DeepSeek call, a new PayPal transaction, independent two-human sign-in or unfamiliar-user usability. The scripted/native fixtures are limited evidence, and an offline-consistent bundle does not prove authenticity or complete website correctness.

## Remaining product limits

Dynamic checks cover declared file bytes; they do not recursively inspect imports, attest a backend build, prevent selective serving, or run arbitrary seller JavaScript. Website aesthetics, copy quality and unsupported business requirements still require human review. External unfamiliar users and a genuinely independent seller onboarding remain the principal evidence gaps; no AI simulation is counted as a human study.

Detailed advisory decisions are in `docs/collaboration/evidence-chain-cycles-2026-11-04/`. Reproducible tests and CLI scripts are included in the public source export. Deployment IDs, screenshots and live verification records are retained separately in the local release ledger.
