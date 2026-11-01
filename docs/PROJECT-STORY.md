# ProofBeforePay

Evidence before payment for small-business website handoffs.

## Inspiration

A Melbourne florist hires an overseas developer. The developer says the website is finished, but the owner finds different opening hours, a policy welcoming walk-ins despite an appointment-only agreement, and a broken consultation destination. ProofBeforePay gives both sides one record connecting what was requested, what was delivered, what needs changing and which version the buyer accepted.

## What it does

Buyers describe a small static marketing website, optionally add contract text, and confirm requirements and price. Sellers upload HTML/CSS. Deterministic rules check document presence and local targets; optional DeepSeek analysis compares agreed text with quoted source. Browser-width observations are recorded separately. Buyers send specific feedback, inspect revisions and explicitly accept an exact version before separately authorizing test payment.

The showcase makes the difference visible: the first delivery has wrong hours, contradictory consultation copy, a missing target and mobile overflow. The revision repairs those issues. A later AI uncertainty remains visible for the buyer to examine, rather than being silently changed to a pass.

## How we built it

The prototype uses TypeScript, React, Vinext, Cloudflare Workers and D1. DeepSeek receives bounded source excerpts and confirmed criteria. Citations must match saved files; incomplete HTML coverage forces conservative content advice. Roles, versions, amounts and payment state are checked on the server. PayPal Sandbox orders use separate authorization and capture, with idempotent retries and reconciliation for uncertain results.

## Challenges

Exact quotations do not guarantee correct reasoning. One model response invented an exact-phrase requirement; another risk misdescribed a link's position despite quoting valid source. We preserved these failures, improved prompts and coverage handling, and kept AI advice separate from buyer decisions. A failed assessment was also retained as a failure with unknown usage, rather than reported as a successful test.

## Accomplishments

A fresh hosted rehearsal completed v1 feedback, v2 inspection, exact-version acceptance, real PayPal Sandbox authorization and a separately confirmed AUD 480 virtual capture. The receipt and state survived refresh. The original imperfect AI report remained unchanged; acceptance followed separate buyer checks.

Across 31 real API attempts, we recorded the original 19-case baseline, targeted retests and later small follow-ups. Baseline status agreement was 18/19; stricter source review accepted 17/19 complete answers. A six-case policy follow-up matched all six expected statuses, but two cases were already exemplified in the prompt. Two whole-project follow-ups produced 14/14 acceptable application verdicts and 13/14 raw verdict matches; one additional risk still required correction. These are descriptive engineering results, not general accuracy claims. Details and original failures are in the [dated evaluation](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/docs/EVALUATION-2026-11-02.md).

## What we learned

The useful product is the shared, reviewable delivery record. Rules, source analysis, browser observations and buyer confirmation answer different questions. Keeping their evidence separate makes disagreement easier to explain and prevents uncertain AI advice from deciding payment.

## What's next

We plan broader user testing, stronger checks on generated risk explanations, additional policy cases and carefully bounded asset support.

Current scope is flat HTML/CSS. The preview blocks scripts and form submission; it cannot prove email delivery, backend behavior, security or absence of hidden bugs. The seller perspective in the Sandbox rehearsal is simulated; there is no escrow or real seller settlement.

The hosted workspace remains owner-private. Judges can use the public repository's independently tested, free [no-key local setup](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/JUDGE-README.md). Live providers are optional; recorded real-provider evidence is distinct from a new live request.
