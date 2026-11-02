# Buyer-confirmed business content checks

This slice checks agreed business copy in an exact saved static website, rather than only asking whether files and links exist. The buyer confirms every expected value before locking scope. Seller uploads never redefine the expected answer.

## Complete flow

1. Describe requirements; the optional noodle-shop button fills synthetic requirements without creating or confirming a project.
2. Confirm original requirement coverage, then optionally add up to eight business checks. Each points to an included original requirement, an exact source quote and one agreed required HTML page.
3. Choose visible literal copy (telephone, address, opening-hours text or policy copy), or an item label plus explicit AUD/USD price in integer cents. The project fee and menu prices are separate values.
4. Lock the scope. Seller uploads files and may run the same checks; the server derives the reporting role from membership.
5. The browser loads the saved HTML and active saved CSS in the existing script-free sandbox at 375px and 900px preview widths. It reports bounded local visible text blocks. The server validates a complete plan, current delivery and previous report, then derives comparisons from those reported blocks.
6. Inspect expected and observed copy. A buyer can draft editable, criterion-linked feedback, return the version and ask the seller to replace it. A replacement starts without previous observations or acceptance; the earlier version retains its records.
7. A configured project needs a current business report before acceptance. Mismatches and unavailable observations require either a revision or an explicit 10–500 character reason for accepting exceptions. They are never relabelled fixed. All existing human checks and explicit acceptance remain necessary.
8. Acceptance freezes its report reference and any exception reason. Later supplemental reports remain append-only and cannot replace that reference at payment capture. Acceptance does not initiate payment.

## What the observation means

Visible-copy comparison normalizes NFKC, case and whitespace. It does not decide whether different wording has the same meaning. A menu price must appear with the agreed label within a bounded local block and explicit ISO currency. Multiple conflicting values, unsupported currency tokens, symbolic extra prices, clipping, occlusion or uncertain extraction do not silently pass. Text hidden by CSS, zero font size or very low opacity is not visible evidence. The program never joins the whole page or an unrelated footer into a price row.

These remain **client-reported static-page observations**, not independent server certification or a browser attestation. A nonce cannot prove that client DOM claims are true. Exact snapshot verification occurs in the normal probe; the server does not pretend it ran that browser. Reports and acceptance therefore retain provenance and require explicit buyer judgment. The two widths are preview widths, not real-device tests.

No OCR, semantic translation equivalence, full pixel/contrast proof over images or gradients, arbitrary JavaScript, form delivery, database persistence, backend security audit, legal ruling or escrow is claimed. A buyer may deliberately accept an exception; that is recorded as a decision, not proof that the delivery was correct.

## Reproducible synthetic example

`tests/fixtures/noodle-business/project.json` matches the form's explicit example button. Upload the five files in `v1` together, then later the five files in `v2`.

- v1: English Beef noodles AUD18 is correct. Chinese 牛肉面 is visibly AUD28, with a hidden AUD18 decoy. Telephone ends 9999 instead of 0000.
- v2: Chinese price and phone are fixed; each version retains separate identifiers and reports.
- CUA run on 2026-11-02: v1 six actual observations, two as agreed and four mismatches, zero uncertain. The wrong Chinese price and wrong telephone were retained as actual excerpts. Feedback was drafted and submitted for both original requirements. v2 six actual observations as agreed; the old report did not carry forward. Existing navigation/resource probe also observed all14 planned steps as expected. These were agent-operated browser checks on fictional data, not unfamiliar human usability tests.

Domain tests cover provenance tampering, excluded criteria, stale IDs, complete plan/CAS, 18 versus118, wrong currency, absent currency, conflicting/symbolic/unsupported money and immutable acceptance. The isolated API/D1 suite uses synthetic roles, blocked outbound fetch and a mock payment provider; it does not prove real account sign-in or PayPal Sandbox payment.

Commands (Node22.13+):

```sh
node --experimental-strip-types --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
node tests/run-collaborative-sandbox-local.mjs --suite business-checks
```

## Codex–DeepSeek review decisions

Three selected-source reviews were run: direction, implementation, follow-up. DeepSeek recommended bounded buyer-confirmed rendered business copy rather than executing seller JavaScript in the current same-origin environment. Codex accepted that direction. The price ambiguity above was independently found and fixed with regression cases.

Codex rejected the initial claim that an empty-block mismatch can be accepted without an exception: the actual server checks issues or unavailable and requires a reason. Unit tests and the isolated API exercise this refusal. DeepSeek withdrew that finding in the follow-up. Empty item blocks produce mismatch; conflicting price blocks produce unavailable. Both require the reason.

Codex also retained unavailable for ambiguous was/sale pricing rather than making an unsupported claim that the current price is wrong. The client-observation trust limitation was accepted and kept explicit; server nonces were not presented as DOM attestation. The final source-only review had no supported new findings. Its result is advisory, not a runtime or competition guarantee.
