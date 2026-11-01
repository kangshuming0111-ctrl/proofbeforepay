# ProofBeforePay

Evidence before payment for small-business website handoffs.

## Inspiration

A Melbourne florist hires an overseas developer. The developer says the website is finished, but the owner finds different opening hours, a policy welcoming walk-ins despite an appointment-only agreement, and a broken consultation destination. ProofBeforePay gives both sides one record connecting what was requested, what was delivered, what needs changing and which version the buyer accepted.

## What it does

Buyers describe a small static marketing website, optionally add contract text, and confirm requirements and price. Sellers upload bounded website folders with HTML/CSS and local PNG/JPEG/WebP photos. Deterministic rules check document presence, local targets and resource references; optional DeepSeek analysis compares agreed text with quoted source. Separate browser observations check widths, the agreed local link's destination/visible target, saved styles and page-image decoding. Buyers send specific feedback, compare criterion-level evidence across revisions and explicitly accept an exact version before separately authorizing test payment. Participants can append reasoned reviews of AI risks without changing the original model report or deciding acceptance automatically. Their latest positions remain separate when they disagree.

The initial screen uses a labelled hours-copy illustration to explain the handoff before asking for a form. The visitor can explicitly create a sample or enter their own requirements; merely viewing that illustration creates no project or model result. A completed human check can remain visible alongside AI uncertainty, so a participant can see who decided what.

The earlier showcase makes the difference visible: the first delivery has wrong hours, contradictory consultation copy, a missing target and mobile overflow. The revision repairs those issues. A later AI uncertainty remains visible for the buyer to examine, rather than being silently changed to a pass. A separate two-account hosted check also exercised version-bound human risk reviews and retained the original AI wording after participants recorded their own decisions.

## How we built it

The prototype uses TypeScript, React, Vinext, Cloudflare Workers and D1. New DeepSeek assessment requests receive the complete confirmed scope summary and every validated HTML/CSS file, plus criteria and inventory metadata; image pixels are excluded. Oversized requests fail before sending rather than silently truncating text. Citations must match saved files, and historical reports retain their original coverage. Roles, versions, amounts, browser-report plans and payment state are checked on the server. Client browser observations are version-bound and cannot accept work or move money. PayPal Sandbox orders use separate authorization and capture, with idempotent retries and reconciliation for uncertain results.

## Challenges

Exact quotations do not guarantee correct reasoning. One model response invented an exact-phrase requirement; another risk misdescribed a link's position despite quoting valid source. We preserved these failures, improved prompts and coverage handling, and kept AI advice separate from buyer decisions. A failed assessment was also retained as a failure with unknown usage, rather than reported as a successful test.

## Accomplishments

An earlier owner-operated hosted rehearsal completed v1 feedback, v2 inspection, exact-version acceptance, real PayPal Sandbox authorization and a separately confirmed AUD 480 virtual capture. The receipt and state survived refresh. The original imperfect AI report remained unchanged; acceptance followed separate buyer checks.

A separate hosted check on 2 November 2026 used two distinct authenticated app accounts, with the seller working in Safari. V1 had one rule mismatch, three AI change suggestions and 404 px overflow on the home and services pages at 375 px. The buyer recorded a confirmed CSS-risk review and four change requests; the seller uploaded and submitted v2. Each version received one genuine DeepSeek assessment, adding two calls separately from the earlier 31-attempt evaluation below. V2 had no rule mismatch or AI change suggestion. Three scope/coverage risks were human-rejected with reasons while their original report stayed unchanged.

The buyer inspected all three revised pages at 375 px, a loaded 400 × 267 local photo, the consultation link and equivalent policy copy. Six recorded page/width observations had no unavailable result or horizontal overflow. After explicitly accepting v2, the buyer separately approved and authorized Sandbox payment and confirmed an AUD 1 virtual capture. Both workspaces retained Test captured after refresh, and the receipt referenced the accepted v2. One developer operated both authenticated logins through an automation agent: this verifies the exercised two-account workflow, not two independent user trials. Payment went to the configured Sandbox test merchant, not the actual seller.

Across the earlier 31 real API attempts, we recorded the original 19-case baseline, targeted retests and later small follow-ups. Baseline status agreement was 18/19; stricter source review accepted 17/19 complete answers. A six-case policy follow-up matched all six expected statuses, but two cases were already exemplified in the prompt. Two whole-project follow-ups produced 14/14 acceptable application verdicts and 13/14 raw verdict matches; one additional risk still required correction. These are descriptive engineering results, not general accuracy claims. The new two-account calls do not rewrite those results. Details and original failures are in the [dated evaluation](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/docs/EVALUATION-2026-11-02.md).

The latest local follow-up checked complete text inclusion for three licensed adapted templates: every HTML/CSS file was sent unchanged in intercepted request construction, with zero truncated/omitted HTML and no network call. Four new actual model calls then checked late hours text, cross-page conflict and one embedded instruction. Independent source review accepted all four recorded criterion answers, including explanations and exact citations; the unlogged full risk/limitation arrays were outside that decision. These four calls remain separate from the earlier 31 and the four intervening whole-project calls (two hosted and two local), with no pooled accuracy claim.

Three further genuine template calls supported the narrow shop-name and opening-hours checks and reasonably abstained on an ambiguous contact-page requirement. Exact citations were verified; broader explanation claims still need source context and are not counted as overall accuracy.

Actual application-triggered local browser checks distinguished correct, hidden/covered-link, hidden-target, wrong-target, missing-image and auto-navigation variants. The correct version returned eight matching steps before and after the seeded failures. An isolated API suite separately checked roles, malformed reports, 200/409 concurrency and immutable archives; supplemental reports on a mock-paid version did not change acceptance or payment state. These are bounded developer-operated checks. The [functional verification record](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/docs/FUNCTIONAL-VERIFICATION-2026-11-02.md) gives the exact results, synthetic/provider boundaries and still-pending checks; it does not certify a new hosted release.

## What we learned

The useful product is the shared, reviewable delivery record. Rules, source analysis, browser observations and buyer confirmation answer different questions. Keeping their evidence separate makes disagreement easier to explain and prevents uncertain AI advice from deciding payment.

## What's next

We plan independent first-use testing, an actual continuous interaction recording, stronger checks on generated risk explanations, additional policy cases and broader checks of supported asset packages. The three-person test plan is prepared but testers are unavailable; the new recording script is prepared and the user deferred recording while implementation and tests continue. Entry and workspace views were checked at 375px, 1063px and 1280px without horizontal page overflow; further form/error-state checks remain open. No AI simulation or developer walkthrough fills the human-test slots.

Current scope is a bounded static website folder with HTML/CSS and local PNG/JPEG/WebP images. The preview blocks scripts, form submission and external subresources; it cannot prove email delivery, backend behavior, security or absence of hidden bugs. Source AI reads text rather than image pixels. The earlier AUD 480 rehearsal used a simulated seller; the separate AUD 1 run used a distinct authenticated seller account operated by the same developer. Neither provides escrow or real seller settlement, and neither is an independent user study.

The hosted workspace restricts access to its owner and the specifically invited test viewer; its URL is not public judge access. The public repository provides a free [no-key local setup](https://github.com/kangshuming0111-ctrl/proofbeforepay/blob/codex/public-release/JUDGE-README.md). The new local helper, `node scripts/judge-demo.mjs`, adds an isolated provider-free startup path; macOS has been exercised, Linux is not independently validated and native Windows uses WSL2/manual setup. The public source manifest identifies the included source; hosted access and submission remain separate from local startup. Live providers are optional; recorded real-provider evidence is distinct from a new live request. The Devpost entry remains a draft rather than a formal submission.
