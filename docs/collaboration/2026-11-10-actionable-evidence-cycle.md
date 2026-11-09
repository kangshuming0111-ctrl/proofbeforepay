# Actionable, attributable evidence: award-gap cycle

- Date: 2026-11-10, Australia/Sydney.
- Baseline: Sites v111, `5a9b208e386825c52f5ea8ee2a2111ca10e9efeb`. Refreshed into the Windows checkout through the Sites source helper. Mac independently confirmed no unpublished unique product changes; both clean source checkouts and the published application matched. The existing Mac worktree was preserved.
- Main gap: `PBP-ACTION-01`; associated attribution and reviewer-route gaps: `PBP-ATTRIBUTION-01`, `PBP-REPRO-01`.
- Competition: [PayPal AI Hackathon official rules](https://paypalaihackathon.devpost.com/rules), checked 2026-11-10. This competition has not announced winners. Technical implementation, full product design, real-world impact, originality and presentation are equally weighted. The engineering comparisons below are not additional official judging criteria.
- Main reference: **Jayu**, Gemini API Developer Competition 2024 **Best Overall App**. [Google's announcement](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) describes visual understanding and actions across application interfaces. We use that observable task orientation, not a claim that we tested its reliability.
- Related reference: **Agent Receipt**, IBM Bob 2026 **August Most Innovative**, not Grand Prize. [The organizer's announcement](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html) describes evidence-linked authority receipts and replayable records. Both reference descriptions were verified on 2026-11-10. Observation level: official descriptions; no hands-on competitor testing.

## Before implementation

| Gap / dimension | Verified reference strength | Our observed starting point | Observable acceptance threshold | Priority |
| --- | --- | --- | --- | --- |
| PBP-ACTION-01 / useful task completion | Jayu turns AI interpretation into visible user actions. | Plain overview rows expose status but not criterion-specific evidence or editable feedback. Its global report link can show a previously selected criterion. Deep views already support these actions: the gap is reaching the correct action from the result, not a missing feedback system. | From a non-first problematic row, open that exact criterion and prepare an editable same-version draft. Nothing is sent or accepted automatically. Seller, busy, stale, frozen and accepted states cannot create a buyer draft. | Main |
| PBP-ATTRIBUTION-01 / attributable results | Agent Receipt links conclusions to inspectable evidence and authority. | DeliveryComparison labels the published item as AI advice, omitting original model judgment, source finding and publication basis although the data projection retains them. Saved reports may contain changed publication judgments. | Each version separately exposes its original AI, published result and available independent source evidence, with its own report ID and citations. Opposite judgments remain visible; changed status is not called a verified fix. | Associated |
| PBP-REPRO-01 / reviewer task path | An observer can follow an actual task rather than infer it from a score. This is our engineering gate, not a separately claimed competitor feature. | Judge guidance uses an old example route and omits explicit optional AI assessment before acceptance. Accepted versions correctly prohibit running AI again. | Use current entry labels, explain rules-only prepared examples, optional explicit current-version AI, revision comparison and a dated historical-evidence fallback. | Associated |

Scope: retain the green/cream UI, readable compact phone layout and native disclosures. Reuse guarded navigation and the existing buyer feedback flow. Do not change payment authority, membership or evidence persistence rules. Video and Devpost submission remain deferred. This round does not claim to establish AI's incremental benefit over rules.

## DeepSeek critique and independent adjudication

The existing Mac Harness reviewed a bounded packet containing the relevant overview, navigation, comparison and feedback source plus the specific action/attribution goals and award references. No credentials or private client material were requested. The following pre-implementation observations were independently adjudicated:

| Observation | Decision and reason | Implementation / verification |
| --- | --- | --- |
| Preparing a draft can leave its editor hidden behind the overview. | Accepted: filling state alone does not complete the user action. | Leave the overview for the existing feedback editor, keep the current delivery binding and focus the textarea. Actual browser interaction confirmed the editor is visible and no message is sent until the separate send action. |
| Evidence navigation must select the clicked criterion, including a non-first row. | Accepted: a global report link can retain another selected criterion. | Carry the exact criterion and delivery into guarded navigation. The local florist example opened the contact-page requirement at position 3 of 6. |
| Accepted rows must use the evidence frozen at acceptance. | Accepted as a required boundary; later reports for the same delivery are not a substitute. | Snapshot/report guards and focused tests reject live-report substitution, stale delivery and invalid criteria. No new acceptance or payment is triggered by navigation. |
| A published finding must not erase an opposing original model judgment or its provenance. | Accepted: the comparison lacked the layers already retained in saved data. | Both version columns expose separate publication, original-model and independent-source layers, report IDs and layer-specific citations; absent layers stay absent. |
| The comparison should initially select the actual revision feedback, not an arbitrary first criterion. | Accepted: evidence is most useful when it addresses the user's latest task. | Initial selection uses matching feedback for the older delivery. Explicit user choices survive late history arrival and reload, and reset when the delivery pair changes. The real local v1-to-v2 flow selected the contact-page requirement. |
| `humanPending` takes precedence over AI changes and therefore causes a wrong label. | Rejected after source inspection: the label function already checks AI changes before `humanPending`; the Mac review confirmed this counterexample. | Retain distinct human and AI states; do not change the correct precedence merely because the reviewer proposed it. |

The Mac then ran **DeepSeek Harness / deepseek-flash** against candidate `9b27057c5323a18b8a433892e0f1c0d576248cc0`, using four bounded navigation/comparison/guidance/test diffs and the project skill. The review completed with valid structured output and no runner errors. It was static review, not model accuracy or browser testing.

| Post-change observation | Independent adjudication |
| --- | --- |
| DeepSeek: earlier-version model/coverage is absent. | Rejected. `renderEvidence` executes separately for each column. A new SSR counterexample with distinct old/current models, included/omitted/truncated files and limitations proves both remain attached to their own reports. |
| DeepSeek: the frozen target stays inside closed disclosures. | Rejected as stated: `revealGuidedTarget` opens ancestor disclosures, and the local browser focused the actual frozen criterion. The independent Mac review identified a narrower valid issue: the target was its status row rather than file/excerpt. Accepted that issue; the no-AI path now opens and focuses the saved rule-source excerpt. The local browser independently confirmed contact.html's saved title and explanation, without using live evidence. |
| DeepSeek: an old suggestion can be applied after switching delivery. | Rejected. The unchanged `CollaborationPanel` consumer rechecks quote, delivery and buyer stage before consuming it, and version resets clear drafts. Existing draft/version guard tests remain applicable. The diff-only packet omitted this unchanged consumer. |
| Independent Mac review: supported or human-confirmed rows can draft an unwarranted request for more evidence. | Accepted. These rows now open an explicit blank opinion, with no invented deficiency; unresolved findings keep their grounded draft. |
| Independent Mac review: folding navigation replay hides previously requested prominent acceptance information. | Accepted. Navigation replay remains directly visible; AI/comparison/general report controls stay in More checks. |
| Independent Mac review: a rule mismatch can focus a conflicting AI item. | Accepted. A current same-criterion rule failure now targets its rule evidence before AI; AI-only findings still target their AI item. |
| Independent Mac review: a comparison requested during loading is lost when the loading block is replaced. | Accepted. Its overview action now explicitly says it is loading and stays disabled until the report is available. Error states retain the existing retry route. |
| Independent Mac review: current comparison report B can be confused with accepted report A. | Accepted as a presentation ambiguity, not a frozen-data substitution. The comparison now explicitly distinguishes currently saved checks from acceptance evidence and names the frozen snapshot/report separately; B remains B. |

The affected-boundary follow-up reviewed exact candidate `1b033df386d4184c8c527a7795a2c395c18f02d7`. DeepSeek returned `completed=true`, `reportValid=true`, with no structured defects. The Mac independently passed 106 focused tests and TypeScript. A summary-only hypothesis that accepted AI could hide a failed frozen rule was rejected for normal current flows: the server rejects rule failures before accepting a version, covered by regression tests. This establishes a bounded source review, not AI accuracy or universal correctness.

The independent Mac review retained three edge cases: after a failed history request is retried successfully the comparison is collapsed and focus is not restored; multiple historical rule entries for one criterion would make the exact focus selector ambiguous; and legacy accepted records missing a snapshot do not show the comparison's acceptance-origin note. The latter two have no identified affected project. They do not invalidate the exercised standard florist/noodle path, but remain open under `PBP-LEGACY-EDGE-01`; they are not silently treated as fixed.

## Implementation and validation checkpoint

Final validated application candidate: `1b033df386d4184c8c527a7795a2c395c18f02d7`; application fingerprint schema `proofbeforepay-app-source-v2`, SHA-256 `0f587a62351b5766daf6074618751cbfcd9e7450cc639d5dd6281a0f223b1a10`, 497 files. This record is committed before publication; the subsequent Sites version/deployment and public-source synchronization must be checked against that fingerprint. No publication success is inferred from source review.

- `PlainDeliveryWorkspace` and page navigation connect a row to its exact evidence or an editable buyer draft. Missing/current/accepted report states retain their existing distinctions. An AI shortcut reveals its existing run control; opening it does not call a model.
- `DeliveryComparison`, its data projection and styling separate the saved publication from the original model and independent source findings. Each version retains its report identity and citations. No missing original output is manufactured from the published item.
- `EvidenceHistoryPanel` and summary/navigation bindings preserve the acceptance snapshot while opening the requested criterion.
- Judge HTML and `docs/JUDGE-START.md` use the v111 prepared noodle-shop entry, distinguish public browsing from project authorization and explain explicitly requested AI. Both now direct the reader through **More checks / 更多检查** before **Open AI checks / 打开 AI 检查** or **Compare both versions’ evidence / 比较两版证据**. No judge CSS or JavaScript was changed.

### Actual local task

The parent exercised a newly created, fictional florist project through the running local application and normal UI:

1. Opened v1's contact-page overview row; the assessment view selected the correct third requirement of six.
2. Returned to prepare a revision draft. Its textarea received focus, and the draft had not been sent.
3. Edited the text, explicitly sent it, switched to the fictional seller and submitted the prepared v2.
4. Returned as buyer and opened the comparison. It selected `contact.html`, displayed the corresponding v1 feedback and retained two distinct version IDs.

This establishes the exercised rule/feedback/revision/navigation path with synthetic project data. It is not a new live model evaluation, an independent two-human collaboration, a third-party seller deployment or a PayPal transaction. The earlier model and Sandbox records were not rerun in this checkpoint.

### Automated and rendering evidence

- Final focused group after review corrections: **66 passed, 2 skipped**. The skips are the existing Windows file-symlink permission fixtures; source symlink rejection was not weakened.
- Additional exact acceptance, frozen evidence, assessment-feedback, feedback-draft, delivery-overview and asynchronous previous-version tests: **61 passed, no skips**.
- Combined checkpoint: **127 passed, 2 skipped**, across focused groups, not the entire repository suite. Coverage includes stale/busy/non-buyer draft rejection, frozen-report substitution negatives, unchanged feedback drafts, criterion-specific navigation, provenance/citation separation, late history selection, blank feedback on satisfied rows and visible navigation replay.
- TypeScript and the production build passed after the final review corrections. Temporary visual QA pages were removed before packaging. The Mac's separate unpublished homepage work remains on its own branch and is not part of this candidate.
- A controlled SSR fixture at a 320 CSS-pixel viewport displayed expanded original-model and source layers without horizontal overflow. The fixture verifies rendering of supplied data, not current-model accuracy or a physical phone.
- The actual florist v2 checks overview at a **390 × 700** CSS viewport went from **1,024px to 700px document height**, with no horizontal overflow. At **360 × 640**, document height was **711px**; at **320 × 568**, **782px**. Those smaller screens retain natural vertical scrolling. Required attention rows remain visible; routine rows and secondary actions are expandable. On the phone viewport, expanding More checks and opening AI correctly revealed its separate, disabled local run control, without a model call. This is viewport simulation, not physical-device certification.
- Judge HTML parsed, its local asset links resolved and all three existing mobile-disclosure structures remained intact. The final stable-source fingerprint/export tests passed after temporary QA wrappers were removed. Earlier unequal hashes were caused by parallel edits during the walk.
- Focused ESLint remains **61 errors and 11 warnings**, exactly the v111 baseline across the same seven files and rule/severity groups; there are no added findings. Existing React compiler-rule findings in the large page and evidence-history component remain unaddressed in this scoped cycle. This is not a claim that lint passes.

## Reassessment against the same references

| Original gap / same reference | Before | After and exact evidence | Gate status at this checkpoint | Remaining / next action |
| --- | --- | --- | --- | --- |
| PBP-ACTION-01 / Jayu task orientation | A visible issue could lead to another selected criterion or a draft outside the visible workspace. | The real local florist task opened contact requirement 3/6, focused an unsent draft, sent only after explicit editing/action, then followed the seller's v2. Guard tests cover stale, frozen, busy and unauthorized contexts. | Local task gate met; release validation pending. | Complete post-change DeepSeek adjudication, final build and deployed-path verification. Do not turn local success into unfamiliar-user evidence. |
| PBP-ATTRIBUTION-01 / Agent Receipt attribution | Published output could appear as the AI's original answer; source and model differences were hidden in comparison. | Version columns retain distinct report IDs and publication/model/source layers with their own citations. Synthetic opposing outputs and missing-layer cases are covered; the actual comparison retained separate v1/v2 identities and v1 feedback. | Local source/render gate met; final release gate pending. | Recheck frozen/unknown states on the final build. No model correctness or actual source authenticity is inferred from rendering. |
| PBP-REPRO-01 / reviewer task path | Old guide and no clear optional current-version AI route. | Current labels and explicit AI-before-acceptance route; revised versions require their own result. Historical 6 November data is labelled as a different record. | Copy and asset checks met; final deployed route pending. | Verify the More checks disclosure and both links after the compact-layout adjustment. |
| PBP-MOBILE-ACTION-01 / compact access to the same task | Added useful controls made the observed phone overview about 1,024px tall. | The same florist v2 checks view fits a 390 × 700 viewport at 700px document height; 320/360px retain vertical scrolling and show no horizontal overflow. More checks and the separate AI control remain reachable. | Local compact-view gate met, within measured cases. | Real phones, long text and expanded evidence may still require scrolling; never clip required content to claim a universal one-screen result. |

## Six required comparison dimensions

| Dimension | Current conclusion |
| --- | --- |
| User value | The exercised user can move from a particular problem to an editable request and then the corresponding revised evidence. Whether an unfamiliar shop owner understands and completes it remains unverified. |
| Functional depth | Version, busy, stale, frozen and missing-report guards remain meaningful parts of the task. This round improves reaching and reading existing capabilities; it does not add arbitrary-site or unrestricted backend verification. |
| AI's actual contribution | Original AI and application/source judgments are now more explicitly attributable, and the user can reach the optional assessment action. No new live inference or rules-only versus AI causal comparison occurred. |
| Complete product flow | One local example exercised inspection, explicit feedback and a seller revision. Existing exact-version acceptance and separate payment boundaries are preserved by tests; no new Sandbox flow was claimed. |
| Credibility and persuasion | The comparison exposes each report/version and its own evidence layers, including contradictions and absence. This improves inspectability, not proof that a model, browser or third-party backend was correct. |
| Usability and real integration | Non-first-row navigation and draft focus worked locally. The compact 390 × 700 view fits the exercised case; smaller viewports retain readable scrolling. Independent users, independently operated seller staging and physical phones remain open evidence gaps. |

## Retained gaps and next-round actions

| Gap ID | Status | Next verifiable action |
| --- | --- | --- |
| PBP-AI-INCREMENTAL-01 | Unverified: historical status agreement does not establish benefit over rules on unseen tasks. | Freeze new cross-domain tasks and compare identical rule-only and rule-plus-AI inputs, retaining whole answers, failures and independent review. Do not reuse known-case corrections as unseen results. |
| PBP-UNFAMILIAR-USER-01 | Unverified: internal agents and developer-operated sessions are not a human study. | Observe an unfamiliar buyer completing inspection, revision and a reasoned version decision without developer coaching; record assistance and failure rather than infer completion. |
| PBP-INDEPENDENT-SELLER-01 | Unverified: controlled fixtures do not prove independently operated third-party staging integration. | Have a separately operated seller use the existing bounded onboarding/protocol and retain actual setup, permission and backend observations. |
| PBP-PHYSICAL-PHONE-01 | Unverified: CSS viewport fixtures do not reproduce browser chrome, device keyboards or OS text enlargement. | Check the final path on a physical phone with normal and enlarged text; retain actual observations. |
| PBP-MOBILE-ACTION-01 | Corrected and rechecked for the local 390 × 700 case; 320/360px remain naturally scrollable. | Retain this viewport regression check and separately verify physical phones and expanded or long-content states. |
| PBP-RELEASE-VERIFY-01 | Final build, stable fingerprint and follow-up review passed; publication follows this source record. | Verify the deployed fingerprint and normal user path, then synchronize only the sanitized source to the public repository before reporting delivery. |
| PBP-LEGACY-EDGE-01 | Open bounded follow-up: error-retry focus; ambiguous multiple historical rule anchors; legacy accepted comparison without a snapshot note. | Add targeted historical/malformed fixtures before selecting the next fix. No affected project was identified for the latter two; do not invent historical evidence or alter acceptance records. |

The narrowed gaps are action reachability and accurate attribution. Existing immutable versions, acceptance, test payment, saved replies, feedback and offline verification were not newly invented in this round. Video and Devpost remain user-deferred. No competitor reliability, relative score, winning probability or overall superiority is claimed. The final user report must carry the before/after conclusions and the remaining limits, not only a test count.
