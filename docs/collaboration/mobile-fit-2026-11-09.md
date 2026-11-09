# Mobile fit — champion gap → change → reassessment

- Date: 2026-11-09
- Base: Sites v106, d0be7ab9a13fa0ce6b28e4bac85b3d00f8377947; audience public.
- Gap: M1, excessive vertical stacking on phones and hard-to-reach actions.
- Reference: Vite Vere, Gemini API Developer Competition 2024, Most Impactful and People's Choice, not overall champion. [Google announcement](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/), verified 2026-11-09 in the preceding audit. Official description of step-by-step assistance only; no claim that we tested its mobile layout.

## Before selection

| Gap / dimension | Reference strength | Our observed starting point | Gate |
| --- | --- | --- | --- |
| M1 / usable guidance | Clear step-by-step assistance in the official description | At 600px the three desktop overview cards stack fully expanded; the QR code and all checks precede the next action. The welcome illustration also stacks in full. Judge entry has large desktop-like spacing. | At 320, 360, 390 and 430px, reduce default vertical content without cutting information; primary actions and risk summaries remain available; switch or expand details; no page-level horizontal overflow; desktop layout preserved. |

## Design plan

Keep the current green/cream identity, existing typefaces and desktop three-column workbench. Phone spacing 12–16px, body copy readable, controls at least 44px. Use explicit section choices for the workbench and optional disclosures for explanatory illustrations and cross-device QR. Do not shrink the whole page or hide overflow to fake fit. Keep required review and payment decisions separate. Fixed 375/900px evidence previews retain accurate labels; no claim about their rendered width is changed.

## DeepSeek and adjudication

Bounded Mac Harness review requested with the changed UI/CSS, synthetic tests, reference and acceptance gates. Independent source audit accepted excessive stacking and QR height; header wrapping was observed but retained because the revised primary flow fits. Intentionally fixed evidence-preview widths were left alone to preserve their truthful labels.

Accepted and fixed during independent source review: mobile summary must label normalized totals as published results and expose a button for original-model disagreements; judge disclosures must not reset after screen rotation. Mac review also reproduced a historical report with a differing modelJudgment but no source-publication marker: the new count exposed a pre-existing detail omission. Original judgments now render whenever they differ; without a source marker, the other result is labelled Published result. A regression covers this case.

Mac independently reproduced the original-judgment issue against the retained historical first-live.json and frozen acceptance data. Accepted its second P2: keep the source-only AI and non-executing preview boundaries outside the judge disclosure. Accepted its P3: risk-count buttons should move focus to the specific evidence, including the first differing original judgment. Both fixes were implemented. DeepSeek's hidden-panel keyboard concern was rejected by the Mac's real keyboard test (display:none excludes those panels); its reset-on-rotation concern was rejected against the actual initialization-only code and browser resize. A badge-style concern was rejected after checking distinct status text and colors. The final bounded Harness review of the two last fixes returned zero findings; Mac structure/type checks found no remaining code-level blocker. Review evidence is retained in the authorized Mac chat's mobile-responsive-review-2026-11-09 outputs; physical-device usability remains unverified.

## Implementation and verification

This is a responsive presentation change, not a domain/payment/membership change. No live application-model call, Sandbox payment or real-customer input was used. Typecheck and production build pass. Focused regression suite: 38 tests, 36 passed, 2 skipped because this Windows host cannot create file symlinks; no failures. Existing frozen-acceptance and missing-snapshot cases pass. Build retains the pre-existing large-chunk warning.

CUA tested the real local application in same-origin iframes at 320, 360, 390, 430 and 1280 CSS px. Both languages, empty buyer view, seller draft with rule failures and manual checks, all three overview choices, QR expansion/collapse, resume-project route and judge disclosure rotation were exercised. Measured document scrollWidth never exceeded clientWidth in these checked states. At 1280 the three desktop overview cards and full welcome illustration remained visible. The explicit evidence-preview renderer retains its 375/900px viewport semantics and was not changed.

At the same 390px frame (375px usable content after the desktop browser's 15px scrollbar), judge default height fell from 3511px for the v106 source to 1746px in the final revision, about 50%. The initial revision was 1727px before restoring the extra source-only/preview boundary sentence. User-expanded details naturally remain longer. An additional 320x568 wrapper with 20 synthetic rows verified all three evidence jumps: published risks, withheld risks and row 18's original-model disagreement received focus and scrolled into view (published risk scrollY 1929; original judgment scrollY 1701). Temporary QA and baseline files are removed before final packaging and excluded from the build. This is browser layout emulation, not a physical-device or independent-user study.

## Reassessment

| Gap | Before | After / evidence | Gate | Remaining |
| --- | --- | --- | --- | --- |
| M1 / same reference | All overview content and illustration stacked; 390px judge 3511px tall | Phone defaults to the delivery panel with persistent risk counts; optional QR/illustration/guide details expand on request; 390px judge 1746px tall | Layout/action checks and bounded independent review pass | Independent unfamiliar-person usability and physical devices remain unverified. The reference supports step-by-step guidance, not a claim of superior mobile performance. |

Fresh AI-vs-rules comparison, independent human study, actual judge access and same-project Sandbox recording remain separate outstanding evidence tasks. Devpost/video work remains deferred. No superiority over the reference is claimed.
