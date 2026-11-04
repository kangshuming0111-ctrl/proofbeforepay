# Unified evidence export: implementation and independent adjudication

Date: 2026-11-04. Scope: source implementation and local verification only; this document does not assert deployment, a real model execution, payment, or competition submission.

## Observable result

The main download now requests a server-owned, member-authorized `GET /api/proofs/:id/evidence-bundle`. The server reads the exact current catalog, immutable supplemental archives, JavaScript byte manifests, and append-only repair tasks. It performs a final quote-version/membership/report-head/task-head guard after assembling the download. A changed or incomplete snapshot fails explicitly.

`proofbeforepay-evidence-bundle-v2` wraps the unchanged `proofbeforepay-evidence-export-v1` core. The original core verifier and existing recorded v1 examples retain their previous scope. Both the CLI and guest local verifier dispatch explicitly by schema; raw project JSON is not silently accepted as evidence.

The new wrapper retains all three report families: source-text visibility, deployed file bytes, and time/calendar policy. Exact public projection SHA-256 references identify each family/id/version/payload, including an excluded planned policy's older archived version. Acceptance snapshots hash their restored supplemental decision as well as the v1 snapshot, so directly replacing the decision with `null` fails. Native report validators recalculate stored derived conclusions. Current-delivery visibility targets and deployment plans are replayed against the exact exported source files.

Repair/retest source, proposal, and every event observation resolve to an exact native report and the same derived plan/finding. Historical task heads are reconstructed from the original event prefix, then hashed again. Older deliveries contribute only task-referenced reports; their earlier source files are explicitly outside the exported file scope and are not claimed to have been replayed.

The wrapper rejects unknown context/extension fields, foreign projects, unrelated delivery reports, dangling references, duplicate family/id/version identities, unrelated/duplicate artifact manifests, mutable payload substitutions, getters, sparse arrays, cycles, nonfinite numbers, and data beyond its explicit structural/8 MiB total limit. No record is silently dropped to fit the limit. Original requirements/source and free-text buyer/seller notes remain deliberate user content; known account-member and payment-record fields are not included. Time-policy HTTP bodies use the shared semantic public projection and omit unrelated response fields.

## Validation artifacts

- `outputs/evidence-chain-cycles-2026-11-04/export-tests-final.txt`: focused unified/core/viewer test run, including CLI JSON round trip and guest multi-entry build.
- `outputs/evidence-chain-cycles-2026-11-04/export-typecheck-final.txt`: `tsc --noEmit --incremental false --pretty false` output; an empty successful file means no diagnostics, not deployment.
- `outputs/evidence-chain-cycles-2026-11-04/export-valid-v2.json`: fictional, public-projected 3-family packet with a v2 JavaScript hash manifest; 25,079 compact JSON bytes when generated; no `PRIVATE-` canary retained.
- `outputs/evidence-chain-cycles-2026-11-04/export-missing-frozen-report-v2.json`: counterexample with a frozen time-policy record removed.
- `outputs/evidence-chain-cycles-2026-11-04/export-fixture-results.json`: positive consistency and negative inconsistency results, with exact failed gates.

The final focused suite has 41 tests: 12 new unified-bundle tests, 21 existing core export tests, and 8 guest verifier/controller/build tests. These are developer-created synthetic checks; they are not external merchant tests, independent user trials, browser attestation, or a full system verdict.

## DeepSeek review 01

Artifact: `outputs/evidence-chain-cycles-2026-11-04/export-review-01.json`. Protocol-valid, completed source review; DeepSeek did not execute the code.

Finding: P3, the server's catch-all message suggested the 8 MiB limit even when an inconsistent catalog or a concurrent change caused the export failure.

Independent decision: **accepted**. The same catch handled both the explicit budget assertion and the creator's post-build consistency failure. The former is a capacity problem; the latter is an inconsistent/mixed read and needs a different user action. Added a typed `EvidenceBundleBudgetError`. The server now gives a bounded-limit message only for that type and a separate refresh/retained-reference message for other failures. Internal details are not exposed.

Additional independent hardening completed before review 02: hash the supplemental decision with its snapshot, reject unrelated artifact manifests, and expose named bilingual gates for task replay and exact historical references.

## DeepSeek review 02

Artifact: `outputs/evidence-chain-cycles-2026-11-04/export-review-02.json`. Protocol-valid, completed directed source review; DeepSeek confirmed the preceding error classification, snapshot commitment, manifest reference, native historical scope, and final guard changes. It did not execute tests or exercise D1.

Finding: P3, immutable archived objects reach a deliberate 400-object/8 MiB project budget; the reviewer proposed reclaiming records not referenced by the current bundle.

Independent decision: **rejected as a defect**. The archive is project history, not a cache of the current download. An object unused by the latest bundle may still be an exact reference of an earlier accepted delivery or archived version. Reclaiming it solely because the current download omits it would break historical verification. The documented bounded-store behavior is to preserve existing records, reject additional acceptance when full, and explain the need for a new project. Current packet filtering prevents unrelated historical objects from appearing in a download; it does not make those objects safe to delete. No unbounded retention or silent eviction was added.

## Additional independent counterexamples

Metadata reordering: recursively reversing object key order, while retaining every array order and exact source byte, initially caused `supplemental-objects` to fail. Public payload digests are canonical by key, so this was a false negative in native validators' `JSON.stringify` structural comparisons. The native source-visibility summary now checks the exact four named counters; time-policy structural equality uses canonical object keys without sorting arrays; the artifact manifest compares its exact file list using its existing canonical representation. The unified positive test now passes for a completely key-reordered packet. Reversing the time-case array still fails, as it changes the declared ordered plan.

Async mutation: the wrapper initially retained caller-owned objects while awaiting digests. The verifier now synchronously clones the already budget-checked plain JSON before its first await. A test inserts a throwing getter into the caller's original object immediately after verification begins: the verifier completes against the captured snapshot, and the getter runs zero times. This closes an execution boundary rather than making a later mutated object appear checked.

The directed review of these two final changes is recorded separately in `outputs/evidence-chain-cycles-2026-11-04/export-review-03.json`. It completed with a valid protocol and zero findings. Independent decision: **confirmed within the tested scope**, supported by the two executable counterexamples and final 41/41 focused suite. DeepSeek's source review itself did not execute tests. No additional broad review or unbounded improvement loop was opened.

## Independent root follow-up red-team review

Read-only inspected `EvidenceFollowupPanel`, follow-up store/storage/SQL guards, its route, and the parent page callback. Two UI issues were sent to the root agent for correction:

1. A pending POST response could call `onQuote` after project/role switch and restore the previous project's projection. Component remounting does not revoke an already-running async callback. A mounted/context generation check must suppress stale completion while preserving the server action's truthful status.
2. `locked` originally checked the payment-confirmation `acceptedDeliveryId` but omitted `collaboration.stage === "accepted"`. Delivery acceptance sets the latter before payment confirmation, so the UI offered actions that the server correctly refused as view-only. The UI must use the same accepted-stage boundary.

The server paths reviewed already derive the real member role, select observations from the current server catalog, reject planned/running source proposals, bind every task update to the previous version/payload and current catalog guard, and refuse task changes after acceptance/closure. Terminal report sources are retained as native records and cannot be rerun under the same identifier. This source review found no additional reproducible server permission bypass. Root owns final repair and regression evidence for its UI files.

## Remaining boundaries

This remains unsigned internal consistency. A fully fabricated but internally coherent packet may pass. No offline gate proves who issued it, whether the HTTP/model/browser calls actually happened, complete website correctness, legal acceptance, or payment. Earlier task-report source files, all external user testing, live API role checks, and deployed UI verification require their own evidence. Devpost/video were outside this task.
