# Requirement coverage and acceptance evidence — 2 November 2026

This follow-up addresses the two most consequential findings in the v29 gap review: business requirements could remain only in the free-text summary, and a later browser run could replace the latest observation without retaining the earlier report used at acceptance. It also extends the agreed static navigation checks from one link to as many as five. This is an implementation checkpoint, not evidence of a new deployment, competition submission, independent user study or new continuous recording.

## Original requirements remain in the agreement

New custom-project creation requires a coverage record even when no contract or AI extraction is used. The server groups the current website summary into bounded literal fragments, preserving their exact original text and UTF-16 offsets. This is punctuation-based grouping, not a semantic parser: a fragment can contain several requirements, and accepting that fragment requires the buyer to check all of them. The buyer can return to the first step and add line breaks to make compound requirements clearer.

Each fragment must be included for human acceptance or explicitly excluded with a reason. The UI also offers a pending-clarification state, which blocks creation until the buyer resolves it. Included fragments become separate `coverage-N` criteria and `needs_human` evidence entries; they do not silently collapse into the technical page-presence checks. Exclusions and their reasons remain readable with the complete original summary after creation.

The request includes the exact current `sourceText`, confirmation and every fragment decision. The server regenerates the fragments, IDs, spans and criterion references; it rejects stale source text, duplicates, omitted/unknown groups, pending decisions and missing exclusion reasons. A change to the summary or the proposed scope invalidates the UI confirmation. Optional AI or contract-derived suggestions remain separate sources and do not decide coverage, acceptance, price or payment.

Older saved projects are not retroactively rewritten into this format. Their original agreements and acceptances remain readable; the UI identifies the absence of a per-fragment coverage record rather than inventing one.

## A simple page no longer silently accounts for a richer new summary

The original counterexample described a noodle-shop site with menu, opening hours, address, booking and bilingual requirements. The previous no-AI path could generate only a page-presence criterion and a mobile human check. A minimal valid “Hello” page could therefore satisfy the existing technical criterion, leaving the rest of the summary untracked.

For a new covered project, included source fragments now each require their own explicit human check. Confirming only `mobile` cannot satisfy those additional checks. This does not make the system an autonomous judge: a buyer still needs to inspect the work honestly, and a checkbox is not independent proof that a requirement works. The improvement is that the original requirements are retained and visibly accounted for before scope lock and acceptance.

## Saved observations and acceptance-time evidence

Browser and layout observations are retained as separate saved runs on their exact delivery version. The compatibility fields still identify the latest run, while the histories retain earlier report contents. An upgrade can preserve the genuinely saved latest report as the first known historical run; it cannot reconstruct reports that were overwritten before this feature existed.

New explicit acceptance records create an evidence snapshot and store its identifier with the acceptance. The snapshot preserves the agreed criteria, rule evidence, human checks, the matching review, the saved AI assessment and matching risk annotations when present. It names the browser/layout reports that actually existed at that time, or records that none existed. The referenced observations are retained in the same delivery's history.

Later browser or layout checks may still be saved as supplements when the normal workflow permits them. A later report B must not replace report A inside an earlier acceptance's evidence record. Replacing delivery files continues to create an independent delivery version; old files, observations and acceptance-time records stay with their old version. Older acceptances without a snapshot are explicitly unavailable as historical acceptance evidence; a new check is not used to fill that gap after the fact.

Limits are explicit: each observation type retains at most 100 runs per delivery, acceptance evidence at most 20 snapshots, and the saved evidence history is bounded to 256 KiB. Reaching a limit rejects the new save before replacing existing history. These records are application evidence, not server-independent browser certification, legal adjudication or escrow.

## Up to five agreed static navigation steps

A new custom agreement may list up to five local source-page / visible-link-text / target descriptors. Targets can be a whole saved HTML page or an HTML page plus a fragment. The original single-link form remains readable for older projects. The server derives criterion IDs and the browser plan from the saved agreement; client observations cannot add arbitrary URLs or payment actions.

Each agreed step is observed at 375px and 900px alongside each saved/required page's applicable styles and image decoding. The browser checks link visibility, an uncovered sampled point, activation, expected destination and target visibility. A wrong or unsupported destination is unverified rather than counted as a successful observation. The bounded probe still disables scripts, form submission and external subresources.

The new [noodle-shop fixture guide](NOODLE-NAVIGATION-DEMO.md) exercises a useful static path: homepage → English menu → Chinese menu → visit instructions. It has four HTML pages and three agreed link steps, so its plan has fourteen observations. The first version deliberately sends the Chinese-menu link back to the homepage; the second corrects that target. It does not implement a booking backend or send an email.

## Verification status and remaining boundaries

The following were actual local developer-operated observations, not independent unfamiliar-user research. The application UI saved five original source groups: four included and one explicitly excluded with its reason. An empty exclusion reason disabled creation; editing the original source invalidated confirmation. No contract or model call was needed to establish that coverage record.

| Exercised path | Actual saved result |
| --- | --- |
| Flawed noodle navigation v1 | One source-rule failure; twelve browser steps observed, zero mismatches and two unverified steps. The two unverified observations were the wrong Chinese-menu destination at the two widths; they were not counted as matches. |
| Corrected navigation v2 | Fourteen observed steps, zero mismatches and zero unverified steps. |
| Separate layout run | Eight measured page/width readings, zero horizontal overflow and zero unavailable readings. |
| Direct 375px preview | Consecutive real UI clicks followed `index.html` → `menu-en.html` → `menu-zh.html` → `visit.html#consultation`; the developer inspected readable rendered screenshots. This is narrower than comprehensive usability or accessibility testing. |
| Explicit acceptance and later report | After the five required human confirmations, v2 was accepted without payment. Snapshot A named the earlier browser/layout reports and the genuine AI report that existed then. A later browser report B left two browser runs and one layout run available; the exported acceptance snapshot was byte-for-byte unchanged. The project remained accepted and payment remained `unfunded`. The UI opened both history and the complete acceptance-time record. |

Separate isolated API runs passed six coverage/evidence groups, four collaboration/payment groups and eight browser-report groups. Across those three suites there were thirty synthetic provider responses and zero actual provider network requests. They included an actual local HTTP rejection of the old “Hello page plus mobile-only confirmation” attempt. Synthetic identities/provider responses are not production logins, actual browser observations or a new Sandbox transaction.

Two additional genuine model calls were kept separate from all earlier cohorts. The first was saved through the application UI: seven `supported`, five `insufficient_evidence`, thirteen exact citations and no risk entries. Two literal menu-content items were over-conservatively left insufficient. A prompt clarification was followed by one same-source comparison call returning ten `supported`, two `insufficient_evidence` and no risks. Independent review qualified its navigation-related `coverage-3` support as partial anchor/href/target source evidence only; actual navigation was established by the separate browser run. The second report was not persisted over the first, and snapshot A retains the original seven/five report. These are full-report engineering reviews on one fixture, not 100% accuracy, a held-out general benchmark or a guarantee that future risks are absent. New assessments support up to 33 criteria with an output allowance of 1,800–6,400 tokens; human acceptance remains separate.

The internal records are `browser-runtime-verification.json`, `accepted-a.json`, `accepted-a-after-browser-b.json`, the three API result files, and the model independent-review/adjudication files under `outputs/chain-v30-2026-11-02/`. That directory is not part of the sanitized public source; this document reports the bounded results without exposing application or payment identifiers. The final build and hosted publication remain separate checks, and this checkpoint does not establish that a new release was deployed.

The earlier evaluation files and real Sandbox evidence remain unchanged. The existing edited 135-second video is unchanged; the user deferred the new continuous recording. Three independent unfamiliar-user trials are still unavailable and remain unfilled.
