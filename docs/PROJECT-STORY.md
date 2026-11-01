# ProofBeforePay

Evidence before payment for small-business website handoffs.

## The problem

A florist in Melbourne commissions a website from a developer overseas. The developer says the work is complete. The buyer points to the opening hours, the consultation policy and a broken contact destination. Neither has one shared record connecting the requirement, the delivered version, the evidence, the requested revision and the final decision.

## What the prototype does

The buyer describes a small static marketing website, optionally adds contract text, and confirms a checklist and price. The seller supplies saved HTML/CSS files. The application checks narrow document and local-link requirements. A separately requested DeepSeek assessment compares explicit text requirements with bounded source excerpts and returns exact citations. Browser width observations are recorded independently. The buyer can send specific feedback, inspect a new immutable delivery version, and explicitly accept that version. Authorization and capture are separate PayPal Sandbox confirmations after acceptance.

## Why AI is useful

The showcase contains a semantic conflict: the agreed copy says consultations are by appointment only, while the first delivery welcomes visitors without an appointment. The revision expresses the correct policy in different words. The model is asked to explain that relationship and cite the actual source, rather than search for one prescribed sentence. Missing local destinations remain deterministic rule findings. Runtime and subjective requirements remain uncertain unless separately observed or checked by a person.

## What PayPal does

The owner-scoped Sandbox rehearsal connects the same project and accepted delivery to a real Sandbox order, authorization and capture or void. Amounts and workflow permissions come from the server. Changing a delivery invalidates stale evidence and acceptance. Pending payment operations retain their original retry and reconciliation path. Financial consent is separate from accepting the website.

The seller perspective in this rehearsal is simulated. The payee is the configured Sandbox test merchant. This is not marketplace seller onboarding, escrow or real seller settlement. The demonstration uses test funds only.

## How to try it for free

Use the sanitized public source distribution and its `JUDGE-README.md`. The built-in two-sided demo works locally without provider credentials. Open the loopback development sign-in, confirm the scope, switch to Seller, save a flawed delivery, submit it, return it with feedback as Buyer, save the revision, inspect it, accept it and confirm simulated payment.

Optional live DeepSeek and PayPal Sandbox integrations require the reviewer's own appropriate test configuration. The local default does not make billable model requests, create PayPal orders or move real funds. Recorded real-provider evidence must be clearly distinguished from a new live request. No production credentials, customer contracts or payment credentials are distributed.

## Evaluation and evidence

The repository includes a labelled synthetic evaluation corpus and a runner that uses the application's actual assessment request and validation. The runner defaults to a zero-network dry run. A live run requires explicit call and USD limits, records the model's original status separately from the application's conservative policy, and reports literal content, untrusted source, runtime/subjective and truncated-source cases separately.

Status agreement on a small synthetic set is not a production accuracy claim. A reviewer must inspect semantic reasoning and citations, report failures and abstentions, and distinguish the model's behavior from application safeguards. Published results should identify the exact model, source snapshot, coverage, latency and usage-based cost estimate.

## Current scope

This version supports flat HTML/CSS marketing-site packages. The isolated preview blocks scripts, external subresources and form submission. It cannot prove booking completion, email delivery, backend persistence, comprehensive accessibility, security or absence of hidden bugs. A width measurement does not establish mobile usability. AI advice never accepts a delivery or authorizes payment.

## Built with

TypeScript, React, Vinext, Cloudflare Workers and D1, DeepSeek's API and PayPal Orders/Payments Sandbox APIs. The source uses the MIT License; retained vendor assets keep their own notices.
