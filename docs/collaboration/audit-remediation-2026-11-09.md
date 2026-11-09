# Audit remediation, 9 November 2026

Base: Sites v104, source bba563c01c197979ce8e88e0c2db2774d5538939. User requested improving the existing implementation and iterative verification. No payment, acceptance, membership or private project records are to be changed by this work.

## Cycle 1 — accurate first-screen evidence

Reference: Vite Vere, Gemini API Developer Competition 2024, Most Impactful and People's Choice (not overall champion). [Google's announcement](https://developers.googleblog.com/en/announcing-the-winners-of-the-gemini-api-developer-competition/) describes accessible step-by-step assistance. Reference: Agent Receipt, AI Builders Challenge with IBM Bob 2026, August Most Innovative (not overall champion). [Organizer announcement](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html) describes evidence-linked receipts. These are official descriptions; we have not independently tested those products.

| Gap | Before | Concrete threshold | After / evidence |
| --- | --- | --- | --- |
| C1 clear evidence | PlainDeliveryWorkspace iterated only AI items, omitting failed rules, missing criteria and additional risks | Each agreed criterion appears; rule failure stays visible beside conflicting AI support; absent/stale AI never implies success | Validation pending |
| C1 stable acceptance | Summary depended partly on current report-specific human projection | Frozen summary reads accepted criteria, rules, AI, risk positions and manual decisions; missing snapshot never falls back to later checks | Validation pending |

Independent DeepSeek critique: not obtained on this Windows host. Harness executable is unavailable both locally and in installed Ubuntu; no Harness credentials have been copied. A bounded source packet will be prepared after validation. Findings remain **unverified**, not approved by an independent reviewer. Our own review accepted the rule/AI contradiction and snapshot binding defects from source; rejected treating an AI indication or a participant's risk position as a resolved defect.

Implementation: read-only summary adapter reuses existing deliveryOverview ordering and exact-version checks; renders rule, model/source-check and manual evidence separately, includes risk indications and no-model states. Preserves the three-column layout and separate acceptance/payment actions.

Validation: 24 focused display/domain tests passed initially. Actual component rendering subsequently verified conflicting rule/AI output, missing AI, missing acceptance and source-publication attribution. Browser: a fresh loopback D1 session created a fictional project, locked scope and saved a flawed delivery; the overview visibly showed two rule failures, two manual checks and two supported rules, with “no AI report” explicit. No live provider or real account was involved.

Independent Harness invocation was attempted through installed Ubuntu and returned `harness_executable_not_found`. The four-file bounded packet passed the review client's dry-run validation. This is a tooling block, not a successful review.

After comparison: the first-screen evidence gate is met by code and the local missing-AI browser case; unknown/frozen/conflicting cases have focused executable coverage. This narrows the evidence visibility gap to Agent Receipt's officially described receipts and the clarity gap to Vite Vere's described guidance. It does not demonstrate equal usability or outperform either product. Independent unfamiliar-user testing remains open.

## Cycle 2 — traceable judge handoff

Reference: CrawlerPal, PayPal DevDays 2025 first place; [PayPal announcement](https://developer.paypal.com/community/blog/winners-dev-days-hackathon/). Observable strength is a concrete PayPal-integrated use case in the official description, not an independently measured conversion rate. Our before-gap was a fragmented product/lab/source story and a public source revision behind Sites v104.

Threshold: one English judge entry with a specific trial sequence, truthful access/provider limits, concise runnable instructions and a machine-checkable application-source comparison. Implementation adds `/judge.html`, `/api/release`, a sanitized export fingerprint, the concise guide and an entry from onboarding. The fingerprint excludes runtime secrets and benchmark assets; it detects application-source drift, not binary authenticity. Windows setup instructions were actually exercised on this host; existing POSIX judge runner remains unchanged.

Independent DeepSeek: still unavailable on this host, not approved. Our review accepted the mismatch risk and rejected silently exposing the private audience or describing a provider-free lab as the full AI/PayPal product.

Tests found pre-existing Windows archive-list assertions assumed LF; these now accept CRLF too. Two file-symlink rejection tests cannot create their fixtures on this Windows host; they are explicitly skipped only for Windows EPERM, not counted as passes. Export still rejects symlinks in production. The live/export fingerprint equivalence test exercises actual collected repository files.

After comparison: a concrete entry and source-parity check now exist. Public GitHub synchronization and invited judge access still require verification. The main project retains its existing audience. This narrows presentation and reproducibility gaps; it does not establish competitive superiority or submit the competition entry.

## Cycle 3 — expose whole-answer evidence

Reference: PHAROS_INC, IBM Bob 2026 August first place, and Agent Receipt, August Most Innovative; [organizer announcement](https://www.bemyapp.com/insights/ai-builders-challenge-with-ibm-bob-2026-winners.html). Observable strengths are deterministic checks/readable reports and inspectable evidence respectively. Our before-gap was that the 9/9 headline could be read without the qualifications in the original whole-answer review.

Threshold: recompute historical scores from original retained records, show each layer and missing denominator separately, retain all whole-answer caveats, and show no score if records disagree. `/ai-evidence.html` does this using a pure tested reader. It checks each focused status against its saved report, rejects missing/duplicate cases, and renders source content as text. No prior report was modified. It shows 9/9 raw, 7/9 published, 6/7 available source findings (2 unavailable), and 8/9 effective; two raw whole answers remain qualified.

Independent DeepSeek: pending on the Mac; no replacement reviewer is claimed. Our adjudication accepted the need to separate label accuracy from answer quality, and rejected calling saved source findings an independently randomized rules-only baseline. Automated malformed/missing/report-mismatch counterexamples pass.

After comparison: evidence is easier to inspect and adverse results remain visible. This closes a presentation defect, not the original missing causal evidence for AI's incremental value. Fresh unseen cross-domain calls and independent judgments remain open. A historical replay cannot close that gap.

## Combined validation and outstanding work

116 tests passed, zero failed, 2 Windows file-symlink fixtures skipped across 118 tests. Includes exact-version acceptance, payment domain/provider regressions, overview, immutable summary, actual component rendering, provenance, export and historical evidence. TypeScript and production build passed. A visual review found narrow badges wrapping excessively at approximately 1000px; the right-hand findings now have a stable 48% row width. Browser and final build verification continue after that CSS correction.

Still open: independent DeepSeek review; public GitHub push (connected permission is read-only); actual invited judge access; fresh real-model incremental-value evaluation; unfamiliar human testing; current same-project Sandbox recording and the final video. Existing source-only/runtime/visual boundaries are explicit. No live payment, real-model claim, independent user study, formal submission or changed audience is implied by these code changes.

Final local UI checks: desktop overview, 390px same-origin iframe viewport (visually checked above and below the fold), no-AI evidence button, judge entry and all four historical evidence cases rendered successfully. The temporary responsive wrapper was removed from both source and build output. Final typecheck/build passed after the CSS correction. No programmatic iframe geometry assertion was obtained; mobile evidence is visual inspection. Application-source fingerprint: 2e492b77937dfd04195270f75ec18472adef3715ab99a8e632a6d237e4b51548 (474 files).

## Mac follow-up — independent review and fixes

The v105 source was fetched to an isolated checkout. Three bounded DeepSeek Harness reviews and three separate post-fix reviews completed; no product-model or payment request was made. The following were adjudicated with source and executable checks, including the two file-symlink fixtures skipped on Windows.

| Group | Accepted and fixed | Rejected or still limited | Concrete comparison after the fix |
| --- | --- | --- | --- |
| First-screen evidence | The accepted card now opens the exact read-only evidence snapshot, not current annotations. The summary preserves source attribution and contrary original model status; withheld leads are counted separately as unverified. | A mixed rule failure and manual observation does not remove the proven mismatch: the server blocks acceptance on rule failure regardless of a manual check. No reason to turn that mismatch into a pending state. | Against Agent Receipt's traceable records and Vite Vere's guidance, the overview now leads to the same saved evidence it describes. Independent novice timing remains unverified. |
| Judge handoff and release | v2 hashes deployable public text, excluding historical benchmark assets. POSIX runner uses a separate readiness config and checks the served fingerprint against copied source. Exact legacy identity/path traces are sanitized in export copies; known private-note classes are excluded and archive ownership is neutral. | Initial claim that export omits scripts is contradicted by the recursive scripts collection and exact export parity check. Follow-up claim that GNU tar omits dotfiles was disproved using GNU tar 1.35 and bsdtar; the test now names both expected placeholders. | Compared with PayPal DevDays winner CrawlerPal's clearly scoped use case, the judge path is more reproducible and tied to the reviewed source. Actual invited-judge access remains unverified. |
| Historical AI results | Browser verifies both frozen archive digests before showing any score or caveat. A missing negative row, changed reference or rewritten whole answer now fails closed. Original archive bytes are unchanged. | The proposed unverified-notes loophole cannot pass the pinned digest. Suppressing authentic negative caveats would make the account less complete. A score on historical labels is not a causal test of AI's added value. | Compared with PHAROS_INC's official description of deterministic checks and Agent Receipt's inspectable records, the displayed historical claims now fail closed. Fresh cross-domain AI versus rules-only results remain outstanding. |

Mac validation: TypeScript and production build passed. The normal suite passed 2,019 tests, zero failures and zero skips. A timing fixture now derives start and expiry from one reading; this is a test-only fix. A clean provider-free judge smoke run created a new D1, applied its migrations, verified its fingerprint and signed in with the fixed development account. The historical scores remain 9/9 original labels, 7/9 published labels, 6/7 available independent source findings (two unavailable), and 8/9 combined; two of four original whole answers retain qualifications. The source finding comparison is not a separately randomized rules-only run.

The exported file tree also repacks one pinned historical source archive with neutral member metadata, retaining all 20 frozen member hashes and the unchanged original in the Site source. This sanitization applies to the exported tree; it does not rewrite Git history.

The current same-project Sandbox video, fresh cross-domain calls, independent first-use testing and actual invited judge access remain unverified. This audit does not record any Devpost submission or change to the Site audience.
