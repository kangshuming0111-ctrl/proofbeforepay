# Evidence-led product iterations — 2026-11-02

Code and functional verification are the priority. Video work and formal Devpost submission remain paused. This record is a comparison of inspectable capabilities, not a win probability or an assertion that unpublished competitor behavior is absent.

## Genuine comparison sources

The [PayPal AI Hackathon rules](https://paypalaihackathon.devpost.com/rules) give equal weight to technological implementation, design, potential impact, innovation and presentation. A working PayPal/AI product matters; test count alone cannot establish a better product.

- [CrawlerPal](https://developer.paypal.com/community/blog/winners-dev-days-hackathon/) won PayPal Dev Days 2025. Its [public server at a fixed revision](https://github.com/positiveblue/CrawlerPal/blob/2a5655f231128ecc339094a621177fffc5a38222/server/main.py) includes a payment-required response, Sandbox payment completion check and scoped access credentials. This comparison did not execute its payment flow or establish its reliability.
- [PHAROS_INC](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html) won the IBM Bob August 2026 challenge. Its [MIT source at a fixed revision](https://github.com/0xkinno/pharos/tree/2b3eb2dbf8afd9e9fc1c4a789da9fe59556d6f65) includes deterministic evaluators with measured values, thresholds, units and source clauses, plus an implementation-disclosure endpoint. Source inspection is not verification of scientific or regulatory correctness.
- Agent Receipt won the same IBM event's Most Innovative award. Use the organizer's independent description only. Public repository visibility does not make its materials open source or available for reuse in this product.

These are cross-event references. They are not winners of the current PayPal 2026 event, and there is no matched workload measuring all of them against ProofBeforePay.

## Round 1: valid HTML must not fail because it is not XML

Reproduced failures included named entities such as `&mdash;`, `&copy;` and `&eacute;`, and legal omitted HTML end tags. The checker now uses `parse5@8.0.0` with original source locations. Valid optional tag omissions and named references can pass. Missing required document content stays a failure. Browser parser recovery, base URL ambiguity and unsupported structure require direct inspection. Comments, raw-text containers, foreign namespaces and inert trees cannot create fake links or target IDs.

Original source excerpts remain literal; decoding does not rewrite uploaded files. Hidden or inert destination ancestors prevent a source-link pass. This is source evidence, not a rendered-visibility or complete conformance certification.

DeepSeek's review proposed several defects. Root accepted the hidden destination concern and reproduced it. Claims that a base URL was silently applied by the local resolver, an unrelated duplicate attribute invalidated another anchor, or a hidden ancestor link passed were rejected against actual code and regression tests. Model agreement was not used as a substitute for execution.

## Round 2: the seller can supply an approved staging backend

The earlier registry contained only controlled fixtures. There is now an optional, bounded server registry for a seller's authorised disposable staging deployment:

1. Buyer locks an original requirement and an optional 8- or 18-step protocol.
2. Seller downloads that project's HTTP contract and implements it in a separate staging business handler and datastore.
3. The local proposal helper hashes the exact supported frontend export. The output is explicitly not approval or installation.
4. An operator reviews ownership, test-only scope, project, protocol, declared deployment revision, frontend digest and expiry, then installs the declaration.
5. Seller explicitly chooses the approved target when uploading. The saved delivery freezes the complete declaration.
6. Before new external work, the server checks current approval and the exact saved declaration. Metadata must match before booking writes. No arbitrary caller URL, script or registration snapshot is accepted.
7. Reports and buyer acceptance preserve the declaration and exact uploaded-file digest. Subsequent registration changes cannot silently rebind accepted evidence.

An expired or revoked registration cannot authorise new HTTP. If an earlier persisted run lost its result and its lease has expired, a narrowly bound recovery can record all-unavailable evidence with zero network requests, preserving its original run identity and unknown external outcome. This releases the workflow without pretending that an external operation was rolled back.

Frontend digests and optional backend artifact hashes/commits are declarations, not proof of deployed code provenance. Historical reports remain inspectable after expiry. See [the independent seller staging guide](OWN-STAGING-BACKEND.md).

## Round 2 verification checkpoint (historical)

- Full automated command: `pnpm test` — **430 passed**, including the existing native SQLite suites.
- TypeScript: `pnpm typecheck` passed.
- Fresh exported-source Worker/D1 integration: `node tests/run-collaborative-sandbox-local.mjs --suite runtime-checks` passed eight groups. It uses synthetic identities and blocks outbound HTTP; unavailable observations remain unavailable. It does not establish real sign-in or payment.
- Registered-target integration used a real local HTTP socket with a separate synthetic handler. All 18 observations passed; incorrect project, registration revision, frontend digest or declared backend metadata stopped after metadata GET without booking writes. The test transport deliberately rewrites an approved example hostname to loopback. It is not an independently deployed third-party seller or durable storage proof.
- CUA exercised an isolated provider-free workbench: project creation, scope confirmation, seller target choice, five-file upload, project contract download and saved 18/18 HTTP observations against the existing public controlled lab. No model or payment provider was called in this browser check.
- CUA reproduced a narrow-screen overflow, then verified the fix: a 375px viewport and document both measured 375px; the long target selector measured 299px and the hidden file input 1px. The preview retains its own bounded horizontal scroll. This is one developer inspection, not a device study.
- DeepSeek completed focused runner, handoff and recovery reviews with no concrete outstanding findings in those packets. Malformed JSON review attempts are retained separately and do not count as successful structured approvals. UI feedback was independently adjudicated against per-delivery history and immutable project reference behavior.

## Round 3: inspectable evidence and a native-policy reference deployment

The [offline evidence format and CLI](OFFLINE-EVIDENCE.md) now let a reviewer check a current delivery without signing in or rerunning a model, backend or payment. The allowlisted envelope retains source files, original requirement spans, supplied observations, report history and acceptance references; it omits account-member, customer identity, transaction and provider-configuration fields. Original source text may itself contain user information, so this is not an anonymiser or an automatic public export.

The verifier recomputes the full file-map digest, replays the named static rules, resolves literal requirement and AI citations, recomputes outcomes from supplied browser/business/layout readings, and checks frozen HTTP bindings and acceptance history. One immutable assessment or human-annotation ID cannot fork its contents across current evidence and snapshots. Mandatory report references and pending/completed run identity are checked. Equivalent metadata key ordering is accepted; source bytes and array ordering remain significant. Controlled built-in manifests have narrow compatibility without enabling JSON in ordinary custom uploads.

The [retained v1 example](../tests/fixtures/recorded-seller-staging/v1-evidence.json) is internally consistent **with its failure still present**. A browser-downloaded package also passed all eight offline consistency checks. Editing its source made digest, static replay and runtime-binding checks inconsistent; recomputing a self-declared digest did not make contradictory saved evidence consistent. Neither result proves authentic issuance, real identity, actual HTTP execution, correct model judgment or successful payment. A fully fabricated but internally consistent package can pass: there is no trusted signature or external anchor.

A separate [seller-reference business handler](../examples/seller-staging/worker/booking-service.mjs) was exercised through the main application's bounded HTTP protocol. Its native policy comes from its own datastore rather than a maximum copied from the checker. The buyer's locked original maximum stayed six throughout:

| Retained run | Native handler maximum | Observed steps | Seven-person request | Same-key concurrent responses and readback |
| --- | --- | --- | --- | --- |
| `seller-native-v1` | 7, a deliberately planted mismatch | 17/18; one mismatch | HTTP 201; rejection expectation not met | HTTP 201 / 200, then independent HTTP 200 readback |
| `seller-native-v2` | 6, corrected native policy | 18/18; no mismatch in these steps | HTTP 422 with the expected structured rejection code | HTTP 200 / 201, then independent HTTP 200 readback |

The reversed arrival order in v2 is valid: the concurrent pair must contain one creation response and one replay response, not a predetermined first/second order. A separate read-only database inspection of v1 found five synthetic receipts, including the seven-person receipt. No claim that the entire datastore is free of duplicates follows from these checks. Tightening the native policy preserves same-key replay of an existing receipt before applying the new policy to new bookings.

These were actual controlled hosted HTTP observations, not just unit fixtures. The handler used separate `seller_*` tables in the public lab's **shared physical D1 database**. One developer operated a synthetic same-account buyer/seller role-play case. This was not a real third-party seller, a separately owned physical database or an independent user study.

Operator artifacts retain both raw records: `reference-v1-raw-record.json` and `reference-v2-raw-record-before-acceptance.json` under `outputs/winner-iterations-2026-11-02/`. At these checkpoints the records were `in_progress`, with no acceptance object and `unfunded` payment. The v2 report is evidence of these bounded observations, not evidence that the buyer accepted v2 or paid. No new application-model or PayPal call belongs to this reference comparison.

Independent review reproduced and fixed immutable-ID forks, a pending ID colliding with a completed run, impossible observed concurrent pairs, and the built-in-manifest export incompatibility. DeepSeek's claims that the CLI silently truncated oversized input, that unreferenced snapshots escaped checking, that a pending lease had an unchecked extra `runId`, or that the first concurrent request must always create were rejected against source and counterexamples. A follow-up protocol packet returned no findings; it remained a source-only review.

## Round 4: show the specific backend change in version comparison

The generic version summary could show zero static-rule mismatches in both versions while hiding the meaningful 17/18 to 18/18 backend change. The new read-only [runtime comparison](../lib/runtime-comparison.ts) sits before the requirement selector, beside the business-content comparison. With a runtime plan, opening version comparison shows the original maximum, both reports and delivery IDs, target revisions, file digests, boundary responses, concurrent response counts and an expandable view of all 18 steps.

Each side recomputes its own actual file digest and validates its own saved report against the same locked plan, exact target, frozen registration and current project. A registered pin from another project, missing or stale report, changed source, non-older version or unfinished run becomes unavailable. Current evidence never fills missing history. Asynchronous hashing captures input snapshots before awaiting and discards late UI results after the comparison context changes. A lower mismatch count does not establish a complete repair, acceptance or payment.

DeepSeek reviewed the selected source without executing it. Root independently rejected the proposed maximum-label normalization defect: numeric six is retained, while string `"6"` and numeric seven against the six-person clause are rejected by the existing validator. Rechecking after object identity changes is deliberate protection against showing old, unverified digest results. The claimed missing error path was contradicted by the existing catch/error branch, and limits remain visible outside the result conditional. The omitted `isOlderDelivery` definition was a packet-scope limitation; the actual helper and existing equal-timestamp ordering test were inspected and the focused test passed. A hypothetical hung native hash was not reproduced as a functional defect.

Layout diagnostics were also refined to distinguish response type, response identity, fetched source and rendered snapshot mismatches while retaining the old generic reason for historical reports. These diagnostic additions do not turn an unavailable observation into a pass.

## Latest recorded checkpoint and remaining gap

- The completed round 3 full-suite log records **466 passed**. The later completed round 4 full-suite log records **480 passed**, zero failures; the number is a regression checkpoint, not a product superiority score.
- The focused runtime comparison suite passed nine cases, including independently changed targets, source/digest/plan/registration/project mismatch, missing history, unfinished runs, older-version ordering, concurrent-pair consistency and input immutability. TypeScript checks passed for the affected slices.
- A fresh isolated Worker/D1 runtime API check passed eight groups with all outbound provider/backend traffic blocked. It preserves unavailable reports, exact-version replacement, consent, roles and acceptance associations; it does not prove real login or protocol execution.
- The separate round 4 browser-observation API suite passed eight groups and rejected 22 malformed payloads without an unintended saved change. It used synthetic identities/readings and ten mock-provider interactions, with zero external provider requests. Despite the suite name, it was not an actual browser, real login or Sandbox payment test.
- The native-policy reference and exported evidence results above are separately retained from those blocked-network integration tests. The new comparison panel's actual hosted viewport behavior remains a publication check; CSS inspection and synthetic UI/library tests are not a device study.
- Final peer review then found an optional acceptance-shape validation gap, and an observed CDN script append exposed a fetched-source mismatch. The stricter acceptance-shape guard and exact-artifact response `no-transform` hardening were being patched and tested for the next build. They are **not** included in the completed 480-test checkpoint here; neither the patch nor a header alone establishes that a hosted CDN will preserve the saved artifact until it is retested.
- At this checkpoint the new round 3/4 source was being prepared for the next publication. These results do **not** establish that v38 was deployed, that the public source or competition attachment was refreshed, or that v2 was accepted.

The controlled native-policy deployment and offline self-consistency tool narrow concrete gaps in inspectable input, deterministic evidence and revision explanation. The next missing evidence is an independently operated, authorised third-party staging integration and datastore, followed by unfamiliar-user outcomes. Cryptographic authenticity or a trusted report issuer has not been added. Neither the reference handler nor the offline verifier establishes AI correctness, legal finality, seller settlement or actual payment.

Unfamiliar-user outcomes remain unmeasured. Presentation is intentionally paused. Overall superiority to the cited winners has not been established.

## Round 5 — complete historical comparison and live chain

v38 was published from e086c20f66cc655772483b57119cbc65112b4f4c using its local 106-file build archive. The retained custom audience and environment revision3 were preserved. Live inspection found a CDN-added script in the saved preview; the narrow no-transform artifact response removed it while strict source/version/render checks remained enabled. A fresh layout report retained 375/375px and 900/900px, with2 measured and0 unavailable. This proves bounded document widths, not general mobile usability.

One new actual application DeepSeek source assessment was saved for v2. It supported document structure and retained insufficient evidence for mobile/backend behavior, independently of the18-step HTTP report. The developer operated both same-account simulated roles: seller submission, two actual bounded developer checks, explicit exact-v2 acceptance, then separate simulated authorization/capture. No PayPal request or money movement occurred in this run. The exported acceptance snapshot and report references passed8 offline consistency gates. The public fictional v2 fixture retains these references while omitting payment/account fields.

Live v38 also exposed an integration gap: the version list correctly omitted heavy file contents, but the new comparison received that lightweight summary. The v39 repair fetches exactly one authorized full old version, with project/current-delivery/role/archive identity, strict order,15s timeout and stale-response guards. Loading and retry do not substitute summary metadata for source. A recorded-data test covers lightweight list to full archive to17/18 versus18/18 and HTTP201 versus422, without replaying HTTP. DeepSeek's focused static review found no reproducible bug. The complete local suite passed491/491, and fresh typecheck passed. v39 publication and browser verification are separate pending checks at this source checkpoint.

The formerly stale static-resource and layout API fixtures now use exact current coverage and append-only layout history. Permanent commands run each suite in its own fresh isolated build/D1. Both passed:4 static-resource groups and6 layout groups, zero model/provider calls and zero mutation retries. The older unsuccessful attempts remain in private outputs and are not counted as passes. API layout inputs are synthetic and are not a browser measurement.
