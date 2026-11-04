# Deployment byte evidence: independent adjudication

## Plan discussion

The initial DeepSeek Flash plan response is retained in outputs/gap-closure-next-2026-11-04/plan-deepseek.json. It included an unsupported `suggestions` key, so its protocol/schema did not pass. Its source suggestions were inspected separately rather than labelled a valid review.

Accepted design advice: independently GET each explicitly derived uploaded-file URL; preserve per-file expected/observed byte hashes, distinguish mismatches from unreadable responses, bind exact project/delivery/digest and the full approved registration; cap streamed bytes and deadlines and block redirects. Do not recursively crawl HTML references or reuse the upload digest as observed-deployment proof.

Rejected assertions: integration approvals already disclose declaration-only semantics, not build attestation. A changed same-project seller cannot freely select another project's registration: production readProofCase enforces membership and projectJourneyRegistrations uses the scoped persisted store. Revoked requests retain history but approvedIntegrationRegistrations filters integrationTargetEnabled; history preservation does not keep admission. The response's hypothetical cross-project and revoked-registry conclusions were unsupported by the omitted store/delegation code. Registration config values remain operator-controlled.

## Implemented source review

DeepSeek Flash reviewed the seven selected implementation/test/dependency files plus the shared skill. deployment-review-1.json passed the exact review protocol and schema; it returned no findings. This is static advice, not runtime validation.

Independent verification added counterexamples for entry alias collisions, traversal, foreign response URLs, redirects, wrong MIME/status, chunked over-limit streams, uncooperative timeout, invented matched digests, omitted unknown records and cross-delivery metadata. An owned local HTTP server supplied one exact and one changed asset through a finite test-only transport adapter. This does not prove production HTTP execution.

The remaining trust limit is explicit: seller-controlled origins can selectively serve matching files, hashes are not signed build provenance, and this feature does not inspect backend source or decide acceptance/payment. Revocation stops subsequent GETs; an already issued GET can finish and remains a historical reading. A failed/expired/interrupted run retains unknowns and never silently counts them as matches.

## Independent persistence counterexample

A separate Codex review reproduced an internal-validator coercion issue: single-item arrays such as status=["complete"] and outcome=["matched"] passed String(...) membership checks, then bypassed strict result branches. Public POST routes never accept saved report objects, so this was a persisted-record validation defect rather than an existing route authorization bypass. Accepted and fixed with mandatory string checks before enum membership; arrays, objects, booleans and null now reject. Exact hashes and derived summaries remain checked. The focused suite was rerun after the change.

The history-count reservation enhancement passed a second valid DeepSeek review with no findings and three actual fresh-D1 API groups, including simultaneous buyer/seller200/409, duplicate replay, explicit fresh repeat, revocation, replacement and unchanged quote/payment. Its outbound transport was blocked and retained unreadable results; this is not hosted file-read evidence.

A third valid, narrowly scoped DeepSeek review of the strict enum repair returned no findings. No further broad review was requested after counterexamples and checks passed.
