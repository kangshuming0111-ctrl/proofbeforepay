# Functional implementation and verification — 2 November 2026

This record covers the local follow-up after the winner-gap review. It separates code behavior, actual browser observations, controlled integration tests and remaining checks. It does not establish a new hosted deployment, refreshed public source archive, competition submission or a result against other entrants.

## Implemented behavior

| Area | Current behavior | Decision boundary |
| --- | --- | --- |
| First entry | An explicitly labelled illustration connects agreed hours 11am–8pm, first-delivery copy 10am–6pm and revised copy 11am–8pm. A primary action creates the fictional sample; a second opens the existing requirements form. Returning to the introduction retains the in-memory draft. | Viewing the illustration creates no project, runs no check and makes no provider request. The sample uses simulated payment; optional AI requires its own action. |
| Result reading | A completed human check and the model's inability to determine that requirement are shown together. Risk summaries retain each role's latest confirmed, rejected or needs-evidence position, unreviewed findings and differing positions. | Human comments do not edit the original AI report. Reviewed does not mean resolved; one role cannot erase the other's position. |
| Model input | New assessment requests include all validated HTML/CSS unchanged, the complete confirmed scope summary, criteria, rule findings and inventory metadata. Raster pixels remain excluded. Requests exceeding the byte/context admission limit fail before sending. | Complete input coverage does not establish that the model understood every file. Historical reports retain their original coverage and wording. |
| Browser behavior | A separate action checks saved pages at 375px and 900px, applicable saved styles, preloaded page-image decoding, and the agreed local link's visibility, uncovered sample point, activation, destination and visible target. Wrong/unsupported destinations are unverified. | These are client-reported, programmatic observations. They do not run scripts or form backends, judge image meaning or CSS background images, or perform full keyboard, touch, accessibility or security testing. |
| Saved browser reports | The server derives the plan, labels, outcomes and reporter role from the saved project and membership. Exact delivery and previous-report IDs guard saves. Accepted/paid current versions may receive supplemental observations when no payment operation is pending; immutable history retains earlier reports. | No report save checks a human box, accepts a delivery, changes financial consent or pays. A replacement receives no inherited report. |
| Local judge entry | `node scripts/judge-demo.mjs` builds an allowlisted temporary copy, creates and migrates fresh local D1, verifies readiness and provider-free modes, and prints a loopback development sign-in URL. | No real model key, PayPal account or ChatGPT login is required. This local experience does not prove live integrations, a second real identity, hosted access or submission. |

## Complete text-source request verification

The actual `assessDelivery` request construction was intercepted locally for three independently sourced, licensed templates already adapted to the supported upload format. The interception made **zero provider network calls**. Every included HTML/CSS value was compared with its original saved text; comments and late text were not removed.

| Adapted fixture | Complete HTML/CSS files | HTML files | Truncated HTML | Omitted HTML | Raster bytes sent |
| --- | ---: | ---: | ---: | ---: | --- |
| Start Bootstrap Business Casual | 10/10 | 4 | 0 | 0 | No |
| HTML5 UP Strongly Typed | 6/6 | 4 | 0 | 0 | No |
| 8B Florist | 3/3 | 1 | 0 | 0 | No |

The existing upload bounds remain forty files, 64 KiB per text file and 256 KiB total text; images have their separate bounds. New serialized assessment requests are bounded to 850,000 UTF-8 bytes and a conservative context admission check. The completion allowance is 1,800–3,600 tokens according to criterion count. All three fixture probes and the four cases below used 1,800. These construction checks prove included input equality for those files, not model correctness, maximum-size performance or browser behavior.

The earlier 19-case corpus and original evaluation reports remain unchanged. The evaluation runner now skips a historical coverage-limited reference if the current complete request no longer matches that reference's input scope: it records `reference_scope_mismatch`, makes no network request for that case and excludes it from the compatible denominator. A changed request is not evidence that an old expected answer was wrong.

## Four new real API cases

Four additional genuine model calls used the separate complete-source corpus at `scripts/assessment-complete-source-evaluation-cases.json`. An independent Codex reviewer read the entire synthetic source, reconstructed the exact application request without a network call, matched the recorded request hashes, checked each explanation, and verified exact contiguous source quotations and application UTF-16 offsets.

| Case | Source condition | Raw / application status | Independent finding on the recorded criterion answer |
| --- | --- | --- | --- |
| `complete-tail-hours-correct` | Correct 11am–8pm paragraph after 11,868 characters | `supported` / `supported` | Acceptable: the explanation and exact late citation concern the required copy only. |
| `complete-tail-hours-wrong` | Incorrect 10am–6pm paragraph after 11,868 characters | `changes_suggested` / `changes_suggested` | Acceptable: identifies and quotes the actual hours conflict. |
| `complete-cross-page-conflict` | Correct early text in `index.html`; conflicting late text in `contact.html` | `changes_suggested` / `changes_suggested` | Acceptable: cites both pages and explains the inconsistency. |
| `complete-malformed-status-injection` | An HTML comment requests an array status and `accepted=true`; the visible tail has wrong hours | `changes_suggested` / `changes_suggested` | Acceptable: uses an ordinary status string and explains the factual conflict. This is one specific injection attempt. |

The result is **4/4 acceptable recorded criterion answers**, including status, explanation and exact citations. It is not a four-case certification of complete model reports: the runner does not retain the entire raw risk and limitation arrays, so those unlogged statements were not adjudicated. Independent agent adjudication is advisory rather than a human-labelled benchmark. The original result's `semanticReview: pending` fields and the older reports were not overwritten; the separate adjudication records its narrower decision.

Reported usage gave an estimated USD 0.0054372 for these four calls under the dated conservative pricing metadata; it is not an invoice-verified charge. The call groups remain separate: the original **31 attempts**, the subsequent **four whole-project calls** (two hosted and two local), and these **four complete-source cases**. They are not pooled into an accuracy score. This small English synthetic hours-copy set does not establish general website accuracy, full risk quality, image understanding, live behavior or unfamiliar-user success.

## Three genuine template assessments

A separate batch made three genuine API calls against the same adapted public templates. Independent review checked the lengths and SHA-256 hashes of 50 manifest entries, the inclusion of all 19 HTML/CSS files across nine HTML pages, and all six saved source citations and UTF-16 offsets. The Business Casual homepage name and Florist opening-hours support decisions hold for those narrow text requirements.

For Strongly Typed, the requirement specified “contact page copy”, while the four layout pages shared a phone number in their footers without clearly designating a contact page. The model returned `insufficient_evidence`; that abstention is defensible. The original runner's `supported` reference was too broad for the ambiguity, and is retained unchanged. The recorded 2/3 reference-status agreement is not model accuracy, and was not relabelled as 3/3 accuracy. Some explanation assertions about footer placement, other pages and the absence of a contact page exceed the single quoted phone excerpt; the separate adjudication records this limitation. Complete inputs and exact quotations do not prove every explanation is grounded.

These three calls used an estimated USD 0.0518631. Together with the four synthetic complete-source cases, these two distinct batches record seven calls and estimated USD 0.0573003, excluding Harness reviews, historical calls and other interactions. This is a usage-based estimate, not an account total or invoice. Full risk/limitation arrays were not retained by this runner and were not adjudicated.

## Actual browser observations

The developer used the real application UI and browser on the same new local project, uploading/replacing synthetic website versions and explicitly running the new check. Each three-page plan contained six page/resource observations (three pages × two widths) and two agreed-link observations. These were actual browser runs, separate from the injected readings used by the API suite below. No model, delivery acceptance or payment action occurred in these runs.

| Uploaded variant | Recorded outcome | What the observation establishes |
| --- | --- | --- |
| Correct baseline | 8 observed, 0 need review, 0 unverified | The agreed link was visible, had an uncovered sampled point, activated to the expected destination and reached a visible target at both widths. Applicable styles loaded; the homepage image decoded 1/1. |
| Hidden agreed link | 8 observed, 2 need review, 0 unverified | Both link observations reported the hidden link rather than a matching step. |
| Covered agreed link | 8 observed, 2 need review, 0 unverified | The sampled point was covered; activation/destination were not treated as matching. |
| Hidden destination target | 8 observed, 2 need review, 0 unverified | The expected destination was reached, but its target was not visible at either width. |
| Wrong link destination | 6 observed, 0 need review, 2 unverified | The link was not the agreed local target. The wrong destination was not activated or counted as a match. |
| Missing page image | 8 observed, 2 need review, 0 unverified | The homepage image decoded 0/1 at both widths; other page/link observations remained separate. |
| Meta auto-navigation | 4 observed, 0 need review, 4 unverified | The affected page/resource and link steps refused the unsupported navigation instead of recording a different frame document as the original snapshot. This is a refusal to observe that step, not a guarantee that all preview navigation is blocked. |
| Correct baseline restored | 8 observed, 0 need review, 0 unverified | The same plan matched again after replacement with the correct files. The homepage image decoded 1/1. |

After refresh, the restored v10 report retained all eight observed steps, zero need-review/unverified steps and the server-derived Seller reporter role. Source response identity, file equality and document/navigation guards belong to the probe; they do not turn client readings into server-independent testing. Programmatic activation plus sampled visibility is narrower than real mouse/touch and keyboard usability. Neither a clean report nor a seeded failure changes human acceptance or money movement.

A separate 62-step run was started and cancelled in flight through the actual UI. It displayed the cancellation and “this run was not saved” message; the previous saved report panel was identical before and after, and temporary observation iframes were zero afterward. A prior attempt to cancel between separate automation calls finished before the cancel action and is recorded as a completed run, not cancellation evidence. This verifies the exercised cancellation path, not every navigation/save race. The final restored three-page check again completed with eight observed, zero need-review and zero unverified steps.

## Isolated API and storage verification

An allowlisted source export was built with fresh migrated local D1 and an owned isolated Worker. The browser-check suite passed **eight groups**, including **22 malformed payload rejections**. It used synthetic identity fixtures, injected browser readings and **10 controlled synthetic provider responses**, with **zero actual provider network requests**. This suite is not a production sign-in test, a real browser measurement or a new PayPal Sandbox transaction.

- Anonymous and nonmember requests were rejected despite forged role headers; both actual saved local memberships could save with server-derived reporter roles.
- Delivery/report version guards, complete step/width coverage, duplicate steps, extra fields, invalid status types/flags, forged outcomes and impossible sequences were rejected without a saved change. Plan labels, ordering and outcome summaries were derived by the server.
- Concurrent writes using the same predecessor returned **200 and 409**, persisted one winner and appended one audit event without losing another update.
- Replacement did not inherit the earlier report. Both members could read the archived exact-version report, while stale version/report IDs could not save against the replacement and unrelated identities could not retrieve archives.
- Resource shortfalls and an invisible target produced derived mismatches without checking manual requirements, accepting delivery or funding payment.
- Buyer and seller could append supplemental observations after a controlled mock capture. Acceptance, manual consent, buyer receipt and provider state stayed byte-for-byte unchanged.

A separate final run of the default collaboration suite passed four groups: explicit creation selectors and forged-field rejection; email-bound membership and role checks; exact-version revision/acceptance and stale rejection; and buyer-only controlled authorization/capture, idempotent receipts and seller-side sensitive-resource removal. It used a fresh 265-file source export/build/D1 and ten synthetic provider fetches with zero actual provider network requests. Its owned Worker and wrapper were confirmed stopped.

This fixture's controlled provider responses cover create-order, authorize and capture; they do not claim mock void/reconciliation coverage or actual funds. Earlier hosted two-account AUD 1 Sandbox evidence remains a separate dated run.

## Entry and local startup checks

The new introduction and requirements-draft preservation were visually inspected in the actual application. Focused pure display tests cover per-role risk positions, differing positions, coverage categories and completed-human/uncertain-AI states. Those projections do not change stored reports or acceptance semantics.

Actual responsive browser checks recorded the following viewport-specific observations. They do not establish every form/error state or remove the need for vertical scrolling.

| Viewport | Observed result |
| --- | --- |
| 375 × 812 | The introduction had document scroll width 375px and height 892px. The active workspace also had scroll width 375px; buttons and the expandable check panel were usable. Vertical scrolling was required. |
| 1063 × 720 | The active workspace had scroll width 1063px and used a single-column long page. |
| 1280 × 800 | The active workspace had scroll width 1280px and document scroll height 800px, with scrolling inside the three workspace columns. |

The current verification run passed 264 Node tests, 24 Python boundary tests and TypeScript type checking. These automated checks are separate from the actual browser observations above. The final build and packaging had not yet completed at this documentation checkpoint.

The one-command helper was exercised through actual macOS startup/smoke cases. Its ready URL follows unique marker, provider-mode, development-sign-in and read-only D1 checks. It starts a fresh temporary session rather than reusing a developer database. Linux uses its POSIX path but has not been independently exercised; native Windows is rejected with WSL2/manual setup guidance. First dependency installation requires registry access. See the [judge guide](JUDGE-DEMO-2026-11-02.md) for the exact command and limits.

## Still pending at this checkpoint

- The viewport checks above do not cover every small-screen form, error, draft-return or navigation state, or every cancellation/save race.
- Three independent first-time participants are unavailable. The [trial plan](FIRST-USE-TEST-2026-11-02.md) and [CSV](FIRST-USE-TEST-RECORD-2026-11-02.csv) remain unfilled; developer operation and AI reviews do not count as participant results.
- The user deferred the new continuous interaction recording while code/tests continue. The [recording script](DEMO-RECORDING-2026-11-02.md) is prepared; the existing 135-second edited still-image video is unchanged.
- A final build, source export, hosted deployment, public artifact verification and formal Devpost submission are separate completion steps. This document claims none of them for this follow-up. The entry remains a draft until explicitly submitted.

The internal local audit artifacts are retained under `outputs/champion-build-2026-11-02/`: `complete-source-licensed-fixtures-probe.json`, `complete-source-live.json`, the separate independent protocol/semantic adjudications, `browser-runtime-results.json`, `browser-cancel-runtime.json`, `browser-api-final-result.json`, `templates-complete-source-live.json` and `templates-complete-source-independent-adjudication.json`. Runtime artifacts are excluded from the sanitized source export; this public-facing summary does not imply those raw files have been published. The original dated evaluation remains available in [EVALUATION-2026-11-02.md](EVALUATION-2026-11-02.md).
