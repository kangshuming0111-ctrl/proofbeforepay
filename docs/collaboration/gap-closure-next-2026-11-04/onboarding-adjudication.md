# Cycle 1 — seller onboarding preparation

## Implemented slice

The existing seller DOM guide now has three compact bilingual stages: map the
controls and deployment metadata; optionally parse one local HTML file; download
four unverified preparation files. There is no upload, remote URL fetch,
automatic approval, project membership, acceptance or payment action. A changed
field/file clears the previous report and disables download until configuration
is checked again. The standalone Node CLI reads only two bounded local files.

Generated code uses the real shipped SDK and bridge interfaces. Sellers retain
their native handlers/backend and must capture the issued command before an
asynchronous operation. Their completion includes that exact captured command
and actual synthetic journal. Wrong/stale and duplicate completion is rejected;
the result gets the same sequence stamp the SDK expects. Runtime/backend
verification remain explicitly false in every static report.

## DeepSeek review and independent disposition

The first attempted source packet selected public/sdk directly. The existing
review CLI rejected that root before any Harness/model call. The allowed second
packet supplied the actual existing example usage and a generated-module smoke
test instead; no allowlist was weakened and no credential/private data was sent.

1. **Initial Flash review protocol invalid.** It returned an empty string in
   limitations and was retained as `onboarding-deepseek-review.json`. Its two
   opinions were independently considered; this is not a completed valid review.
   - **Accepted F1: native completion identity.** Earlier generated completion
     automatically applied the currently pending identity to whichever native
     completion arrived. Changed it to require the command captured before the
     request and compare the exact command before stamping/resolving; duplicate
     completion is also refused. The actual generated-module/SDK/bridge smoke
     now submits a wrong-sequence completion first, verifies refusal, and then
     verifies exactly one native click and one correct observation.
   - **Rejected F2: require a static HTML pass before any template download.**
     Configuration-only generation is intentional and useful for dynamic DOM
     integration; missing HTML/initially disabled controls are explicitly unknown
     and never counted as runtime success. Requiring all static matches would
     block ordinary staged controls without adding runtime evidence. To reduce
     ambiguity the download stage now explicitly calls all four files
     **unverified preparation templates**. Editing the configuration clears the
     report; every download uses that current configuration. No stale report
     grants downloads after an edit.
2. **Corrective Flash review valid.** Retained as
   `onboarding-deepseek-corrective-review.json`. It confirmed the completion
   capture/match/duplicate flow, but proposed one child-selector defect.
   - **Rejected: child combinator falls through to descendant matching.** The
     implementation literally returns from the `child` branch, so it cannot
     execute the following descendant loop. An element without an element
     parent also cannot match a preceding compound. Added a focused executed
     three-part counterexample covering both `section > form button` and
     `section form > button`, with positive/negative intermediate-wrapper
     variants. All four counts match the strict immediate-parent semantics.

## Verification actually completed

- Nine onboarding tests plus ten existing DOM-adapter tests: **19/19 passed**,
  zero skipped. Log: outputs/gap-closure-next-2026-11-04/onboarding-focused-tests.log.
- The generated connector was written to a temporary directory and imported
  with the real shipped DOM SDK and bridge. An isolated fake-DOM host issued
  the existing init/execute envelopes, drove exactly one actual SDK button
  invocation and got the expected observation; the network stub recorded zero
  requests. This is interface/integration evidence, not browser/backend proof.
- CLI tests actually ran a valid static fixture, missing controls, extra args
  and symlink refusal. Configuration tests cover placeholder/external/unsafe
  paths, extra authority, selector ambiguity, unsupported selector syntax,
  incomplete action options and incompatible native inputs.
- Whole-workspace `tsc --noEmit --pretty false` completed with exit0 after the
  concurrent source-visibility type correction. Build and live browser QA are
  integrated by the parent release workflow, not claimed here.

## Boundaries retained

Only the fixed booking lifecycle protocol is supported. The connector does not
generate arbitrary backend mappings, certify framework state or execute a site.
Static preflight cannot establish CSS visibility, final effects or stored data.
Actual stage/backend approval and browser/server reconciliation remain required.
No independent outside developer's onboarding time/success rate has been measured.

The successful static example deliberately has no native handlers or backend,
demonstrating why static readiness cannot be treated as functioning delivery.
