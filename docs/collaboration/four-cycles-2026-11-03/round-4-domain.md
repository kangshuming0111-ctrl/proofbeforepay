# Round 4: model evidence persistence and acceptance bindings

This record covers the domain, storage, budget and offline-export slice. It does not claim a new hosted model run, independent seller, authenticated two-party exercise or PayPal transaction. The fixtures below are synthetic domain transcripts; runner/native/API/browser evidence belongs to its separately recorded layer.

## Saved result and limits

- `ProofDelivery` has independent `modelRun`, `modelReport`, `modelHistory` and `modelEvidenceReservation` fields. It does not reuse a twenty-step journey report or change either existing protocol's meaning.
- A run reserves a 32 KiB report and a measured worst-case acceptance snapshot before any external I/O. There are at most four retained model reports. Existing reports are never pruned to fit another run.
- The run UUID is its exclusive lease. Checkpoints retain an invocation intent before I/O and may settle that same incomplete observation once; completed observations cannot be removed or rewritten. Expired closure uses only the retained checkpoint and produces an inconclusive report without network requests or write replay.
- Runtime, journey and model runs are mutually exclusive. Pending model evidence blocks replacement, submission, acceptance and financial actions. The shared readiness projection exposes that same pending state.
- Replacement clears all current model fields while the previous version's archive retains them. Project/version lists omit model transcript payloads.

## Client consent and frozen evidence

`AcceptanceBasis` now has an explicit `modelReportId`, including `null` before the first report. A null-to-report or A-to-B change rejects the old client's acceptance basis. Historical snapshots are not backfilled.

Every new acceptance of present model evidence requires:

```json
{
  "modelDecision": {
    "reportId": "the exact current report",
    "acknowledgeServerCheck": true
  }
}
```

A violated or inconclusive result also requires an explicit 10–500 character exception reason. A compatible result still requires the acknowledgement. The snapshot freezes `modelReportId`, `modelSpecDigest`, `modelDeliveryDigest` and the complete `modelDecision`.

Once accepted, report A remains the financial evidence even if a later report B is supplemental. Capture uses the already frozen acceptance snapshot ID. Historical-reference validation resolves A from retained history and rejects a missing or changed reference. No financial state-machine operation was added or redefined.

`model-agreement` feedback is a separate technical item. It binds the current `modelReportId`, rejects original-clause citations and journey-report fields, and works before a twenty-step journey report exists. Feedback on an original criterion cannot carry a model-report attribution.

## Offline evidence

The current-delivery allowlist includes model reports/history and a bounded pending lease. Verification invokes the independent core validator to regenerate the seed parameters, evaluate the two serial alternatives and compare the saved result. It validates exact delivery/file/plan/registration bindings, unique completed run identities, and retained acceptance A references.

Offline verification remains self-consistency verification. It does not execute HTTP, verify a database or source deployment, sign a report, authenticate a participant, accept work or prove payment.

## Executed domain verification

Eight focused tests in `tests/model-check-actions.test.ts` passed. They cover:

1. Pre-I/O report/acceptance reservation and stale identity, seed, target, upload and concurrent-run rejection.
2. Intent-to-settled checkpoint preservation, expired zero-network closure and rejection of late completion after closure.
3. Four-report bounds and conflicting immutable report IDs.
4. Null/A/B client-view invalidation and explicit acknowledgement for a compatible result.
5. Bounded explicit exceptions for violated and inconclusive reports.
6. Frozen model A across supplemental B and payment-consent validation; missing A is rejected.
7. Separate model feedback, source-attribution boundaries and replacement/archive preservation.
8. Offline recomputation, tampered seeds/results/references, and a pending lease with unknown completion.

The focused integration selection of these tests plus acceptance-basis, evidence-budget/export, readiness, workflow, journey and runtime tests passed **88/88**. The domain transcript fixture makes no network/provider call. A fresh standalone rerun of the immutable-history case also passed after the test was corrected to create a same-ID conflict with the latest report; mutating an unreferenced unique historical record is checked by the core/offline validator, not by the history identity collector alone.

During independent UI inspection, the failure-recovery refresh used a nonexistent `/api/proofs/{id}` read endpoint. Root was notified to use `/api/quotes/{id}`. Root subsequently reported fixing recovery and UI busy/unmount handling, and separately reported a fresh **785/785** full-suite pass, successful typecheck and build. Those final aggregate checks are root's executed record, separate from this agent's focused runs.

No commit, deployment, external model call or payment operation was performed by this domain slice.
