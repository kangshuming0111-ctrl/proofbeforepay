# Submission demo: runnable entry and evidence provenance

- Date: 12 November 2026, Australia/Sydney.
- Starting release: v112, source commit `3f7d075db21bb933316c2423b7069f3f9b639bd7`; application fingerprint `0f587a62351b5766daf6074618751cbfcd9e7450cc639d5dd6281a0f223b1a10` (497 files).
- Scope: the user resumed video and Devpost submission and requested testing before publication. The noodle-shop story was explicitly confirmed to be fictional.
- Reference: Jayu, Gemini API Developer Competition 2024 **Best Overall App**. [Google's announcement](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) describes visual understanding and visible cross-application tasks. This reuses the stable award fact and official-description observation recorded in the project protocol on 4 November; no competitor implementation or usability testing is claimed.

## Starting gap and target

| Dimension | Starting evidence | Target |
| --- | --- | --- |
| Visible user task, compared with Jayu's official description | The new account-free demo existed only in a local checkout. An independent browser visit returned 404 at the public `/demo`. | Let an unauthenticated judge run a concrete check and switch to a corrected delivery. |
| Evidence credibility | The adapted three-page example was labelled as an unchanged original fixture. Historical AI and Sandbox cards implied one newly completed chain. | Distinguish interactive local checks, separate archived model cases, workbench behavior and an earlier separate Sandbox exercise. |
| Mobile usability | Initial 320px iframe test produced viewport 305px / document 348px. | No page-level horizontal overflow at tested narrow widths; keep controls and result text readable. |

## DeepSeek review and independent adjudication

DeepSeek originally implemented the five public assets and the 88-second video. Codex independently reviewed their source and history, fixed the missing-Visit-document false-pass and separated provenance. A bounded read-only follow-up was sent to the existing DeepSeek Harness conversation, naming only public assets and forbidding credentials, publication and payment.

The 05:24 review confirmed the three automated checks plus one human decision, separate historical artifacts and the need to publish before submitting. It identified one remaining misleading same-chain sentence in `/judge`; accepted and replaced with fictional/local-check/separate-history wording. Its suggestions to add a results live region and make the local-check badge neutral were accepted. The reference to adapting a bilingual original is retained because the original fixture is bilingual; the current three-page example remains explicitly English and adapted.

Independent accepted findings: remove unsupported 4/4 and 2/2 acceptance totals; do not attribute the new House ramen files to the historical model report; distinguish the earlier developer-operated two-account AUD1 Sandbox test; return null for a missing Visit document; sandbox both visible and offscreen frames without scripts/forms. No new provider calls or transactions were used for this review.

## Implementation and validation

- Only five public files changed: `demo.html`, `demo.css`, `demo.js`, `judge.html`, `judge.css`; this record adds documentation. No database, identity, API or payment logic changed.
- CUA browser: v1 displayed AUD28 and the incorrect phone, yielding two mismatches. v2 displayed AUD18 and the agreed phone, yielding zero; the mobile criterion stayed human-only.
- Missing-document counterexample: the hours reader returned null without reading the parent page; positive and missing-hours controls passed. JavaScript syntax check and TypeScript typecheck passed.
- Mobile CUA harness: fixed the observed rail/version-selector overflow with wrapping navigation and stacked button labels. At iframe widths 320/390/430, measured document/client widths were 305/305, 375/375 and 415/415. The 15px difference is the desktop browser scrollbar. At 320px both v1 and v2 results were checked. These are viewport checks, not physical-device or screen-reader certification.
- Framework production build passed. The publication helper rebuilds the exact final source before packaging. The online URL must be tested again after deployment; a local pass alone is not an online result.
- Video: preserved the original narration and 88-second recording; added fictional/recorded labels and replaced unsupported historical result tables and acceptance/payment counts with accurate explanatory cards. File QA verified decoding and unchanged AAC payload. No new AI assessment, acceptance or Sandbox capture appears in this replay.

## Same-dimension reassessment

| Gap | Before | After validation | Remaining |
| --- | --- | --- | --- |
| Visible task / Jayu reference | Public route absent; local files only | Local runnable check and revision interaction verified; production publication and live check are the release gate | The public demonstration remains a fixed example; full provider-backed project actions require authorized setup. |
| Credibility | Adapted example and independent history conflated | Explicit provenance labels and links; unsupported counts removed | Historical tests are not new transactions or independent user studies. |
| Usability | Measured horizontal overflow on a narrow viewport | Tested widths fit horizontally and show v1/v2 results | Unfamiliar merchant trials, physical-device accessibility and AI benefit over rules remain unverified. |

This narrows the demonstrability and evidence-clarity gap. It does not establish superiority to an award winner or a probability of winning. No competition submission is caused by this source change itself; submission status is verified separately in Devpost.
