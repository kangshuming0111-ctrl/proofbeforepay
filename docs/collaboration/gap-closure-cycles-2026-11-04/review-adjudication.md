# Gap closure review record — 4 November 2026

Scope: functional code, isolated synthetic tests and publication. No Devpost or video changes; no new payment or live membership grants. Independent customers and novice users remain unavailable.

## Round 1 — Project-scoped operator review

- Buyer explicitly grants one application to one configured independent operator. Operator receives staging manifest/digests only, not source/contracts/prices or acceptance/payment authority.
- Initial DeepSeek Flash response retained as `.raw.json`, rejected by strict report schema because it added finding fields. Its source opinions were independently reviewed rather than treated as endorsements.
- F1 (corrupt queue row should be skipped): rejected; decoder deliberately fails closed before projection. No normal write trace produces the malformed state.
- F2 (quote identity may change without version): rejected for application paths; owner is immutable and seller join increments quote version. Both mutations use CAS.
- F3 (withdrawn approved -> resubmitted pending silently permits testing): rejected by actual API counterexample. New requested application has no registration and target remains unavailable until a fresh explicit approval.
- F4 (standalone delegation validator has no quote owner): rejected as a standalone-helper inference; grant and operator read/decide paths obtain authoritative owner and recheck it. Extra buyerId input is rejected.
- Independent implementation review found a bounded-history dead end after repeated grant/revoke. Fixed active-pending admission and peer CAS; the actual API suite verifies withdrawn pending can be resubmitted but cannot reactivate alongside a new active application.
- Final results: 10 focused domain tests and 10 isolated fresh-D1 API scenarios pass. Source-selected DeepSeek V4 Pro final review completed with zero findings; this is advisory static review, not live third-party use.

## Round 4 — Accurate report reading

- Original AI answer remains unchanged. Display-only assistance distinguishes an image observation gap from an unverified source indication. Original image-risk wording is still inspectable.
- Accepted initial DeepSeek finding: CSS background image citations were outside the first img-only display gate. Added bounded background PNG/JPEG/WebP support, historical-image regression and missing-alt/CSS negative cases.
- Rejected initial claimed details/open bug: actual CUA UI opened a read-only report, then a real React parent rerender left it open. Busy-driven expansion is intentional. `defaultOpen` was not introduced based on an unsupported assumption.
- Followup Flash response omitted required top-level limitations and is retained as invalid. Its extensionless-URL example is outside the finite extension-bearing display gate and still defaults to an explicitly unverified indication; it cannot become a confirmed defect. The wording test for a real background-image fallback source indication was strengthened.
- Focused source-assessment/display tests passed before final integration. Actual CUA screenshot and AX snapshot in outputs/gap-closure-cycles-2026-11-04/report-reading-ui.* show the historical image claim labelled evidence needed, next observation and retained original wording. No provider calls were made by this UI.

## AI development regression (not general accuracy)

Original12-project corpus was frozen against the revised implementation before real calls (freeze SHA256 52445b5921b4b3104d16c0199a6840f8bba141ed522f344c7f73423c388edfce). Two complete independent calls per project were made: each run records raw24/24 and application24/24 state agreement, with exact raw output and all risks/limitations retained. The historical22/24 record is preserved. Full-answer semantic review is separate and AI-authored, not a human customer study. Cross-template new cases will be reported separately, never merged into an accuracy score.


## Round 2 — Clock-policy checks

Independent oracle/native-handler, strict trace replay and exact project storage were reviewed by DeepSeek Pro; both the core and public-slice reports were valid with zero findings. Root independently required exact request intents, canonical timestamps, session state checks, original-payload CAS and trace-derived results before review. Focused policy/native suites14/14 and isolated fresh-D1 API groups3/3 passed. Actual hosted CUA runs then confirmed corrected12/12, advance-notice defect11/12 and DST defect10/12, each31HTTP/15POST. A separate native Sites D1 read returned7/8/9 matching rows (24total). These are controlled fixtures, not customer, payment or deployment-authenticity evidence.

## Round 3 — Configurable native DOM actions

Initial source review found no defects, but independent integration preparation discovered an actual normal-path shared-reference bug: native completion used the same receipt object in two places. Reproduced before fix, repaired ancestor-path cycle detection, and added alias/cycle counterexamples. Final focused21/21 passed; the corrective DeepSeek Pro review was valid with zero findings. CUA then ran the actual hosted adapter with independent Node GETs: fixed20/20; destructive failed-move fixture16observed/2mismatched/2unavailable. Native Sites D1 independently showed the failed source booking cancelled in the faulty profile, and preserved/atomically moved in the fixed profile. A temporary public synthetic-lab localhost-parent allowance was removed after QA and the exact same saved version redeployed with environment revision4; main access never changed.

## Round 4 — Transfer-classification and semantic feedback

Two initial8-project runs retained raw16/16 then15/16 state agreement, versus application13/16 then14/16. One complete model answer invented a Chinese quotation and was correctly refused. Exact quotation checking remains strict; no string repair or invented citation location was introduced. Explicit policy-text and Chinese display-hours directives were added only to the content-recognition fallback, preserving observation/financial vetoes. Offline54focused tests passed. A subsequent classification-only cohort recorded app16/16, retained separately as development evidence.

DeepSeek's proposed direct-fact grammar widening was rejected as a required fix: its reproduction confused the absent quote with the confirmed criterion; the actual criterion already has the explicit display directive. Plain factual fragments remain outside this finite allowance rather than being silently recategorized.

Independent full-answer review identified real semantic overclaims in earlier answers: fragment form actions described as going nowhere, inability to test required refunds framed as unclear scope, and CSS selectors cited without matching DOM. General source-grounding instructions were strengthened, reviewed by DeepSeek Pro (valid0findings), then tested under new frozen inputs. Final known corpus24/24 and template-transfer application15/16 remain the recorded state counts. All20final complete answers received independent AI review:18accepted2qualified, no rejected delivered answers. Perch's hidden old-hours conflict has authentic quotations but an ambiguous acceptance scope; Westhaven's refund-review-process risk is too strong. The unchanged15/16 reference comparison and qualifications remain visible. No claim of perfect model semantics, human validation or general accuracy is made.

## Integrated validation boundary

The full workspace suite passed913/913 before metadata packaging; the final affected assessment-record suite passed13/13 after all frozen-source/counter packaging, with fresh typecheck. Complete frozen evaluator source is packaged only after matching each pre-recorded SHA256, including exact historical implementation variants; failed batches remain downloadable. Public source export, final deployment and UI readback are verified separately in the final release ledger.
