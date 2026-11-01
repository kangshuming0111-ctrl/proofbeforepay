---
name: proofbeforepay-delivery
description: Implement and review ProofBeforePay website-delivery features as a verifiable buyer/seller flow. Use in this repository for requirements intake, delivery evidence, revision, acceptance, or the Codex–DeepSeek collaboration workflow.
---

# ProofBeforePay delivery workflow

Turn the requested change into an observable user action and a saved result. The current product prioritizes static website delivery: original requirements → buyer-confirmed checklist → seller files → evidence checks → revision → buyer acceptance → separate test payment. Read only the relevant sections of `README.md`; use [the code map](references/code-map.md) to find the boundary being changed.

Apply this workflow within the current user's scope. A read-only task remains read-only; the steps below do not independently authorize external model calls, edits or publication.

## Make one useful slice concrete

- State the actor, action, expected result and how to observe it. Choose the smallest complete user flow that meets the request; do not expand into a general marketplace unless requested.
- Check current code and a relevant test or live state before calling an idea a missing feature. Existing immutable versions and feedback are not a gap merely because a summary omitted them.
- Keep the existing bilingual workbench and the user's compact desktop layout. Use `frontend-design` for an actual UI change, preserving the existing palette and components. A buyer defines and inspects requirements; a seller supplies delivery files. The top-right perspective switch does not grant real membership.

## Preserve these product boundaries

- The server derives real role, amount, provider mode, delivery IDs and workflow stage. Client role headers apply only to explicitly marked, owner-scoped demos. Never make the browser the authority for these fields.
- Keep the exact original and truthful source references. Edited or newly added checks must not inherit a false contract citation. An unclear clause stays visible for clarification.
- Distinguish static-file evidence, browser observations, model explanation and human confirmation. None of these implies the others. AI may provide grounded quality suggestions when requested, but final acceptance of appearance, copy quality and unsupported behavior stays with a human.
- Requirements extraction cannot decide price, accept work or initiate payment. Acceptance and payment remain separate, tied to the exact delivery. Replacing files invalidates stale review/acceptance; prior snapshots remain readable by authorized participants.
- Keep rules/demo/live labels truthful. Harness sign-in is a review capability, not an application API key. Do not copy its credentials into the app. Do not claim local/mock checks prove a live model, Sandbox payment, seller settlement, judge access or Devpost submission.

## Collaborate without blindly following the reviewer

After each coherent change, send DeepSeek the selected relevant source and acceptance conditions, not the whole chat or private configuration. Use `python3 scripts/deepseek-review.py --help` for the review CLI when it is available. Use an explicit file list and review goal; do not send `.dev.vars`, `.env`, credentials, invitation tokens, private client contracts or authenticated URLs.

Ask for source-based findings with reproduction steps, severity and limits. Independently classify each as accepted, rejected or needs verification. Reproduce accepted findings, explain counterexamples for rejected findings, and record why a proposed change remains unverified. An AI review is advisory, never a permission to alter funds, memberships or acceptance. Re-review the affected boundary after a meaningful fix; do not keep requesting broad reviews after the checks pass.

## Verify the result at the right layer

- For changed domain rules, use a focused counterexample or state-transition test. For API/storage/role changes, use the relevant existing isolated local API harness with empty provider configuration. Never run synthetic identity headers against production.
- Browser interactions in Codex use CUA. For UI changes, verify the affected action, error/empty state and saved result; check desktop panel scrolling and mobile overflow when layout is affected. Preserve the observed state after an asynchronous mutation before choosing the next action.
- Complete the normal typecheck/build for application changes. Development-tool or documentation-only changes need their own relevant validation, not an unrelated website deployment.
- Publish website changes with the existing Sites workflow and preserve its audience. A deployment success is only one check; verify the live user result before claiming it works online.
- Finish in plain Chinese with the observable change, how to try it, evidence, and material limits. Record useful decisions in the repository's collaboration artifacts. Do not update persistent personal memories without an explicit user request.
