# ProofBeforePay

A shared acceptance record for small businesses outsourcing their website: agree the details, inspect the delivery, revise against evidence, accept the exact version, then separately confirm test payment.

## Inspiration

A Melbourne noodle-shop owner hires an overseas developer. The website opens and its links work, yet the Chinese menu lists AUD 28 instead of the agreed AUD 18 and the phone number is wrong. Both parties can point to a website and still disagree about completion. ProofBeforePay connects the original request, precise acceptance plan, submitted files, revision feedback and buyer decision in one versioned workflow.

## What it does

The buyer describes the website in ordinary language; a contract is optional. After reviewing which original requirements are included or explicitly excluded, the buyer may ask DeepSeek to draft checkable business details. Prices, currencies and copy must have literal source support. Unclear currencies, negative requirements or alternative prices stay unresolved. Each suggestion is individually adopted or skipped, edited and separately confirmed. Project fees remain a separate human input.

An invited seller sees the same locked pages, expected prices and copy before joining. The seller uploads a bounded HTML/CSS website folder with local images. Server rules check documents, local targets and resources. DeepSeek receives the complete validated text source, original scope and precise locked business plan, returning advisory findings with exact source quotations. Separate browser observations inspect saved pages at375px and900px, local navigation, resources and bounded visible text. They cannot become source quotations or independently certified server results.

A buyer can turn a concrete observation into editable feedback, request changes and inspect the replacement. The revision view places the original clause, expected value, earlier actual excerpt and current actual excerpt together. Missing evidence, changed plans, uncertainties and new mismatches remain explicit. Acceptance requires every relevant human confirmation; a buyer choosing to accept business exceptions must explain why. The acceptance snapshot retains the report that informed that decision even if later checks differ.

An optional booking requirement can also carry a separately confirmed, fixed eight-step HTTP acceptance protocol. For an operator-registered disposable backend, the server checks more than a success response: invalid input must be rejected, a newly created record must be independently readable, repeated submissions must retain one receipt, conflicting data must be rejected and the original record must remain unchanged. The report binds the observed target and uploaded-file digest to the exact delivery. The target is a seller declaration, not proof that the deployed backend was built from that source. Any failed or uncertain step needs an explicit buyer exception; the report referenced at acceptance remains immutable.

PayPal Sandbox is the payment part of the same handoff. Orders create buyer-approved authorizations; Payments separately captures or voids them. The server binds consent and receipts to the exact accepted delivery and preserves idempotent retries and reconciliation. AI never changes the amount, accepts work or moves funds. The configured Sandbox test merchant receives virtual funds; this is not escrow or actual seller settlement.

## How we built it

TypeScript, React, Vinext, Cloudflare Workers and D1 provide the workbench, stored versions, participant roles and server transitions. DeepSeek supplies optional requirements assistance, grounded business-check suggestions and source advice. Expected values come from buyer-confirmed scope; seller files cannot redefine them. Exact source citations are validated, oversized AI requests fail before sending, and historical model reports remain unchanged. The script-free preview does not execute arbitrary seller code or form backends.

## Evidence and what we learned

A real six-case proposal evaluation exposed two problems: redundant price-copy suggestions caused excessive abstention, and placeholder IDs could be copied literally by the model. We retained the failures, fixed the prompt and bounded parsing, and reran the same cases. The follow-up proposed the two intended prices and telephone, preserved unclear/negative prices, separated a menu price from a project fee and ignored an injected payment instruction. This small synthetic set is engineering evidence, not general model accuracy.

The two-version restaurant fixture includes a visible AUD 28 price, a hidden AUD 18 decoy and a wrong phone. Actual browser checks identified the two mismatches at both widths, then observed the corrected second version. Source AI and browser observations are reviewed separately; valid citations alone do not make every explanation correct. Full inputs, raw proposal completions and validated outputs are preserved. [Plan and evaluation details](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/docs/PLAN-COHERENCE-2026-11-02.md)

Earlier hosted checks completed genuine PayPal Sandbox authorization and capture, including a separate AUD 1 revision/acceptance/payment exercise with two authenticated app accounts. One developer operated both logins through an automation agent, so that is a two-account workflow check rather than independent user research. Earlier model evaluations retain their own successes and failures rather than being pooled into a new accuracy claim. [Dated evidence](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/docs/EVALUATION-2026-11-02.md)

Actual hosted HTTP runs exposed a more consequential discrepancy: the controlled flawed booking service returned 201 for creation but404 when independently queried. Six of eight steps mismatched; the corrected service supported all eight. The independent read request carries the receipt ID, without supplying the expected booking fields for the server to echo. A separate SQLite test exercises the actual fixture against a reopened file database. These observations apply to the controlled protocol and fixture, not to every customer backend, permanent durability or security. [Protocol and evidence boundaries](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/docs/BOOKING-HTTP-VERIFICATION.md)

## Try it and current limits

The public licensed source includes a provider-free local helper: `node scripts/judge-demo.mjs`. It creates a sanitized isolated build and fresh D1, printing a verified local entry. No shared password or API key is required for the simulated walkthrough. Live DeepSeek suggestions/source assessment and genuine PayPal Sandbox use require the tester’s own credentials in a separate manual checkout. The hosted workspace retains owner/invited-viewer access; it is not unrestricted judge access.

The separate [public verification lab](https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/) provides an account-free entry. It combines a browser-local fictional handoff with an independently labelled genuine HTTP test against its own synthetic backend. It has no main application records, provider credentials or real payment. Its optional local task recorder labels operator type and outcomes as self-declared and unverified; it does not create user-study results or prove usability of the authenticated workbench.

Supported uploaded delivery remains bounded static HTML/CSS plus local PNG/JPEG/WebP. Only the separately confirmed booking adapter performs the limited backend protocol against registered synthetic targets. Image OCR, arbitrary JavaScript execution, arbitrary third-party backend inspection, email delivery, general security certification and absence of hidden bugs are not established. Browser reports remain client-reported observations. The current 135-second public video is an edited still-image walkthrough; a new continuous recording and unfamiliar merchant trials are pending. No simulated users fill those gaps. The Devpost entry remains an editable draft, not a formal submission.
