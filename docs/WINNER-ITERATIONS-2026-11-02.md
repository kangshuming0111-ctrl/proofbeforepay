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

## Verification checkpoint

- Full automated command: `pnpm test` — **430 passed**, including the existing native SQLite suites.
- TypeScript: `pnpm typecheck` passed.
- Fresh exported-source Worker/D1 integration: `node tests/run-collaborative-sandbox-local.mjs --suite runtime-checks` passed eight groups. It uses synthetic identities and blocks outbound HTTP; unavailable observations remain unavailable. It does not establish real sign-in or payment.
- Registered-target integration used a real local HTTP socket with a separate synthetic handler. All 18 observations passed; incorrect project, registration revision, frontend digest or declared backend metadata stopped after metadata GET without booking writes. The test transport deliberately rewrites an approved example hostname to loopback. It is not an independently deployed third-party seller or durable storage proof.
- CUA exercised an isolated provider-free workbench: project creation, scope confirmation, seller target choice, five-file upload, project contract download and saved 18/18 HTTP observations against the existing public controlled lab. No model or payment provider was called in this browser check.
- CUA reproduced a narrow-screen overflow, then verified the fix: a 375px viewport and document both measured 375px; the long target selector measured 299px and the hidden file input 1px. The preview retains its own bounded horizontal scroll. This is one developer inspection, not a device study.
- DeepSeek completed focused runner, handoff and recovery reviews with no concrete outstanding findings in those packets. Malformed JSON review attempts are retained separately and do not count as successful structured approvals. UI feedback was independently adjudicated against per-delivery history and immutable project reference behavior.

## Next gap, not a claim of victory

The next useful evidence is the full protocol against an independently deployed, authorised staging handler and datastore, rather than a built-in fixture. A separate offline verifier could also let a reviewer check downloaded source digests, literal citations and report/acceptance associations without trusting the running application. Neither capability would by itself prove report authenticity, AI correctness, legal finality or actual payment.

Unfamiliar-user outcomes remain unmeasured. Presentation is intentionally paused. Overall superiority to the cited winners has not been established.
