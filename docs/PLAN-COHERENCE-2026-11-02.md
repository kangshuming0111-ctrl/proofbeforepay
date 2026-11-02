# One agreed plan through the website handoff

This iteration closes four specific product gaps. It does not claim a competition win or that every website bug can be detected.

## Observable changes

1. **Natural-language requirements to editable checks.** After reviewing the original included/excluded requirements and agreed HTML pages, a buyer can explicitly request DeepSeek suggestions. The model proposes literal copy or typed item/currency/price checks. The server grounds each value in its own full original requirement, supplies the source offsets, preserves unclear clauses and validates page choices. Suggestions are individually adopted or skipped, then edited and separately confirmed. They never choose a project fee, lock a scope, accept work or pay.
2. **The seller sees the same exact plan.** An authenticated invitation preview validates and displays the locked business checks, source requirements and exclusions before the seller confirms joining. The exact file, label, currency, price and copy are directly visible, rather than hidden behind a generic original clause. No source files or payment resources are exposed by this projection.
3. **Source AI uses that plan.** Delivery assessment receives each validated locked check once, linked to its original criterion. It compares the specified file with the precise expected value. Client browser observations are intentionally not supplied to this source-only model request and cannot become source citations. Existing runtime/visual abstentions, human confirmation and payment authority remain unchanged.
4. **A buyer can see what a revision actually changed.** Compare each requirement now includes the original business clause, agreed value, earlier actual excerpt and current actual excerpt. Matching observations, remaining mismatches, newly mismatched observations, different plans and missing/uncertain records stay distinct. Both preview widths retain their raw records; identical pairs are compactly grouped. This is an observation comparison, not automatic proof that a fix, acceptance or payment occurred.

## Real proposal evaluation and preserved failures

Six fictional cases were run against the real model, then repeated after fixes: clear bilingual menu/phone, missing currency, negative requirement, project-fee separation, alternative prices and an injected payment instruction. The first pass exposed positive over-abstention and two rejected model completions with placeholder-prefixed IDs. Those original results remain in `scripts/evaluation-results/2026-11-02-business-suggestion-baseline.json`.

The follow-up produced three grounded checks for the clear case; no guessed prices for missing-currency, negative or alternative cases; only the menu price for the fee-separated case; and only welcome copy for the injection case. Full raw model completions, validated proposals, unresolved items and usage are retained in the corresponding `followup.json`. Reference labels did not enter the model requests. This is a six-case engineering check, not a general accuracy estimate or an independent user study.

Server tests separately reject cross-criterion values, unknown pages/IDs, unsupported fields, isolated money-copy downgrades and conflicting currency. They also preserve a valid typed price when a model repeats a truly redundant price-copy suggestion, without allowing standalone untyped price assertions. A valid large Chinese request with exclusion reasons was independently measured above the old16KiB wire limit; the endpoint now accepts up to32KiB and still rejects oversized input.

The shared delivery matcher now treats adjacent unsupported Chinese-currency money tokens as uncertain, preventing a block containing `28元 AUD18` from matching an agreed AUD18 merely because the correct ISO token also appears. A dish name such as 元气牛肉面 remains a name, not a currency token.

## Verification boundaries

The new endpoint has no database writes. Isolated API/D1 tests exercise authentication, same-origin checks, malformed/stale input, the no-key manual path, the large-body boundary, unchanged project records, exact seller preview and the existing version-bound acceptance/payment flow. These use synthetic identities, browser blocks and mock provider responses, with outbound provider access blocked; they are not real independent accounts or genuine PayPal payments.

The actual browser exercise and model source assessments use one fictional restaurant and an agent-operated buyer/seller demonstration. Independent semantic review checks full explanations, risks, source positions and uncertainty rather than equating valid quotations with correct reasoning. Original model wording is retained when a later prompt is improved.

No arbitrary seller JavaScript, real form submission, email receipt, database persistence, image OCR, general security audit or escrow was added. Hidden/occluded text observation remains bounded and client-reported, not independently certified by the server.

## Competition comparison

The current PayPal rubric equally weights technology, design, impact, innovation and presentation; its working-build route allows complete local setup, while the public video must show functioning use. These are the official requirements, not a prescribed UI palette or agent count. [Official rules](https://paypalaihackathon.devpost.com/rules)

For a direct PayPal reference, CrawlerPal won first place at the separate PayPal Dev Days2025 event with a PayPal API paywall assistant. Google’s Jayu won Best Overall App in the2024 Gemini competition. Their public descriptions make AI’s action and the user task apparent; they do not establish that their implementations are universally more reliable. [PayPal announcement](https://developer.paypal.com/community/blog/winners-dev-days-hackathon/), [Google announcement](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/)

This iteration makes ProofBeforePay’s AI contribution and shared handoff more concrete. A new continuous interaction recording, unfamiliar merchant trials, unrestricted judge hosting and broader runtime/backend support remain unproven or outside the current scope. The existing135-second edited still-image video is unchanged, independent testers remain unavailable, hosting access stays restricted, and Devpost remains a draft. Code changes and screenshots do not fill those evidence gaps.
