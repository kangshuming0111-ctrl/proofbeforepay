# Source-assessment evaluation — 2 November 2026

This is a small, synthetic engineering evaluation of ProofBeforePay's actual DeepSeek assessment request and response validation. It is not a production accuracy estimate, a human user study, a security certification or an award prediction.

## Method and preserved baseline

The baseline made 19 real API requests with `deepseek-flash`; the returned model field was also `deepseek-flash`. The provider's model alias may change over time. Inputs were generated from the committed synthetic corpus using the real upload-rule evidence and `assessDelivery` request, including the 6,000 UTF-16-character per-file and 24,000-character total source caps. Reference labels were kept outside every provider request. There were no automatic retries, payments, customer contracts or database writes in this evaluation.

The report keeps raw model statuses separate from application-policy statuses. A runtime answer forced to abstain by the application would not count as the model itself abstaining. Truncated-source cases are a separate stratum and are excluded from complete-content false-positive and mismatch-recall calculations.

| Baseline stratum | Cases | Raw status agrees with reference | Original application status agrees | Full answer accepted by independent source review |
| --- | ---: | ---: | ---: | ---: |
| Complete literal / semantic content | 12 | 12 | 12 | 11 |
| Untrusted source instruction | 1 | 1 | 1 | 1 |
| Runtime / subjective requirements | 5 | 5 | 5 | 5 |
| Incomplete source coverage | 1 | 0 | 0 | 0 |
| Total | 19 | 18 | 18 | 17 |

All six explicit mismatches in the complete-content stratum were detected. No clean example in that stratum was incorrectly marked for changes (0/6). These are descriptive counts on the listed cases, not evidence of broad recall or a zero production false-positive rate.

Independent source review was performed by a separate Codex agent and checked by the implementing agent; it was not an external human panel. All 20 supplied quotations existed in both the complete saved source and the actual sent prefixes, and application UTF-16 offsets matched. Exact citation validation alone did not establish that every explanation was correct.

## Two issues found and their follow-up

1. **Truncation caused an unsupported change suggestion.** In `truncated-hours`, the correct hours start at character 7,428 of a 7,491-character file, outside the 6,000-character prefix. The baseline model and application returned `changes_suggested`. The reference outcome is `insufficient_evidence`. That original failure remains in the baseline. A new application safeguard now abstains from source-content conclusions whenever any HTML file is truncated or omitted, after preserving authoritative rule failures and runtime exclusions. CSS-only truncation does not invalidate complete HTML text evidence. Regression tests cover unsupported absence, partial positive evidence, omitted HTML, CSS-only coverage and rule-failure precedence. A single real targeted retest returned `insufficient_evidence` from both model and application; it is not a rerun of all 19 baseline cases.
2. **A correct verdict had an incorrect explanation detail.** `business-name-wrong` correctly detected `Willow Floral` in the heading, but the explanation also claimed that value was in the title; the title was `Fictional small business`. The model prompt now explicitly limits factual location assertions to the cited excerpt, and the UI asks buyers to check suggestions against the quotations. A single targeted retest correctly referred only to the heading. Prompt guidance does not prove automatic semantic entailment or eliminate future explanation errors.

Do not rewrite the original raw result as “19/19 model accuracy” after these changes. The full post-change 19-case set was not rerun. Preserve the original baseline, the two targeted retests and their differing request hashes.

## Separate hosted-project assessment: attempts 22 and 23

After the 19 baseline requests and two targeted retests, a hosted assessment of the first showcase delivery was attempted as request **22**. It failed with the generic invalid-or-ungrounded-output response and **no assessment was saved**. Usage and the underlying validation cause were not available. Do not describe this as a known citation, JSON or output-length failure, count its cost as zero, or silently omit the failed attempt. Later safer error classification does not recover its missing diagnostics.

Request **23** successfully saved a real `deepseek-flash` assessment for the second uploaded Juniper & Stem delivery. The saved application report contains **seven items**, covering three independent HTML pages, a local consultation link, mobile usability, opening hours and consultation-policy copy, plus **two risk entries**. It reported **4,465 input tokens** and **841 output tokens**. All four HTML/CSS files were included without truncation or omission. The persisted report contains application processing, so it is not a raw pre-policy API response for every item.

Independent source review checked all seven items and both risks. All **nine quoted excerpts and UTF-16 offset ranges** exactly matched the saved files. The three page-presence quotations ended before the body; their linked deterministic findings and complete saved files supplied the additional evidence for the narrow nonempty-document claim. Exact quotations alone were not treated as proof of every sentence.

The saved statuses were five `supported` and two `insufficient_evidence`. Independent review accepted six item verdicts and rejected the policy-copy abstention. The agreed requirement said consultations must be by appointment and walk-ins must not be accepted; it did **not** require an exact sentence or placement on the home page. The delivered services and contact pages both said, “Every consultation is arranged in advance. We cannot accommodate walk-ins; please agree a time with our florist before visiting.” This is a clear semantic equivalent. The model nevertheless requested literal wording and questioned placement on services/contact, inventing constraints that were not agreed. Its corresponding exact-wording risk was also unsupported. The other risk correctly described the limit of verifying mobile usability from source; it was not evidence of a detected mobile defect.

This is a recorded **semantic false abstention on a seven-criterion walkthrough**, separate from the baseline's 18/19 status agreement. It must not be merged into, or used to rewrite, the original benchmark. The source-assessment report did not receive the separately saved browser-width readings, and source uncertainty must remain separate from those observations and the buyer's final decision. A further prompt change or regression test cannot be presented as a successful new live inference without a separately recorded authorized call.

The successful saved report establishes that a hosted v2 assessment was stored and independently reviewed. It does **not**, on its own, establish that the full AI/revision/acceptance/Sandbox chain succeeded, that every AI item was correct, or that form submission and email delivery worked.

## Separate six-case policy follow-up

After the policy error and prompt remediation, six separately authorized real `deepseek-flash` requests tested policy interpretation. This set was developed during the remediation. It contains **two appointment-policy cases already exemplified in the changed prompt**, **two additional policy domains absent from those examples**, **one explicit exact-phrase counterexample**, and **one runtime boundary**. It is not an independent held-out generalization dataset.

| Follow-up cases | Count | Raw and application outcomes |
| --- | ---: | --- |
| Appointment policy: contradictory first wording and equivalent revised wording | 2 | `changes_suggested`; `supported` |
| Additional delivery-only contradiction and preorder-only equivalence | 2 | `changes_suggested`; `supported` |
| Buyer explicitly requests an exact policy phrase, but source only paraphrases it | 1 | `changes_suggested` |
| Appointment form must submit and an owner must receive email | 1 | `insufficient_evidence` |

Raw and application status agreement was **6/6 on this set**. A separate Codex source review also accepted all six complete explanations after reading the full original files and requirements, rather than checking labels alone. All **seven raw quotes and application UTF-16 ranges** exactly matched the source. For the exact-phrase case, the absence conclusion was additionally checked against both complete files; a short contextual quotation alone would not prove absence throughout an unknown larger website. In the runtime case the raw model itself abstained; the application did not manufacture credit for that behavior by overriding a supported answer.

The successful text cases show that these responses distinguished meaning from literal wording and did not impose a home-page constraint. They do not erase the earlier saved seven-item report's policy mistake, replace the original 19-case baseline, or prove broad policy understanding. The two appointment examples are specifically disclosed as prompt-exposed, and the two other domains are a small additional check rather than evidence of comprehensive generalization. This follow-up did not refresh the earlier hosted report or establish a completed same-project payment chain.

## Separate two-version, seven-criterion source follow-up

Two further direct `assessDelivery` calls assessed the complete v1 and v2 synthetic showcase packages with the changed prompt. These were source evaluations without hosted database mutations. They did not replace the earlier cached hosted assessment or create an additional payment flow. Both versions included all four source files without truncation or omission.

Independent review accepted **14/14 application criterion verdicts and their bounded explanations**. Raw model status agreement was **13/14**: on the first version the model safely abstained on the broken link, while the authoritative server-rule failure supplied `changes_suggested`. The model alone therefore did not detect every source-link failure. All **35 quotations and UTF-16 offsets** matched, and all **eight source files** matched the saved showcase packages.

The additional risks were not uniformly correct. **Five of six were accepted or qualified**, while one v2 Services-button risk had a misleading structural title. Its quote placed the anchor after a section but before `</main>`, so the link was **inside** `main`, contrary to the title's outside-main description. The explanation correctly described the tag order, but no agreed placement constraint or browser observation established the speculative layout defect. An optional visual check is reasonable; the record must not call this a detected defect or label the whole answer fully correct. The raw report and independent qualification are preserved together.

These two targeted calls are not a held-out generalization benchmark and are not combined with the original 19-case score. Their reported usage was **9,234 input tokens** and **2,111 output tokens**, a conservative peak-rate estimate of **USD 0.0053034**.

## Fresh hosted chain: independently accepted v2 and Sandbox capture

A separate, actual owner-scoped hosted rehearsal has now completed the full saved-project path: seller v1, four buyer change requests, revised v2, buyer inspection, exact-version acceptance, PayPal Sandbox approval and authorization, then separately confirmed capture. The final saved state was **paid / captured**, with collaboration **accepted** and **AUD 480 in virtual test funds**. The submission, acceptance, capture and retained AI assessment were bound to the same current v2 delivery. Captured state and the test receipt were confirmed after refresh.

Crucially, this chain retained the original hosted AI report, including its incorrect policy-copy uncertainty. The buyer separately checked mobile presentation, hours and policy source before accepting; the report was not overwritten to appear correct. Form submission and email processing were excluded from the accepted static-marketing-site scope. The later six-case and two-version source follow-ups were separate experiments, not replacements for that stored report.

The seller perspective is simulated and the configured Sandbox merchant receives virtual test funds. This verifies a bounded owner-operated demonstration, not two independent production users, real seller settlement, escrow or correctness of every AI suggestion. A sanitized summary excludes private project and PayPal identifiers while preserving the exact-version binding checks and final state.

## Latency, usage and cost estimate

The 19-case baseline reported **17,330 input tokens** and **3,783 output tokens**. Mean request/validation time was **1,750.7 ms**. Per-stratum latency samples and percentiles are in the raw report. All 19 calls returned usable usage data and no application output error.

Using the verified **peak cache-miss input and peak output rates** as a conservative estimate, the baseline usage costs **USD 0.0097386**. The truncation retest estimate is **USD 0.0007047** and the explanation retest estimate is **USD 0.0005262**. These are usage-based estimates, not an invoice; cache discounts and off-peak prices can reduce the actual charge. The evaluation runner's byte-based reservation is an admission estimate, not a provider-enforced spending limit. [Official DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

The hosted v2 request 23 adds **USD 0.0023487** at those conservative rates. Request 22 has unknown usage and cost. Do not represent the known-usage estimates as an exact total charge for all 23 attempts.

The separate six-case policy follow-up reported **6,892 input tokens**, **1,273 output tokens** and a conservative usage estimate of **USD 0.0035952**. All six returned usage data. These costs remain distinct from the baseline, targeted retests, the saved hosted report and the earlier unknown-cost failure.

## Reproduce and inspect

Run `node --experimental-strip-types scripts/run-assessment-evaluation.ts --output /absolute/new-report.json` for a zero-network dry run. Live requests require a caller-provided API key and explicit `--live --max-calls` and `--max-usd` options. The runner stops on unknown usage, an HTTP error or usage exceeding its reservation, and never automatically retries.

- [Original live baseline](../scripts/evaluation-results/2026-11-02-baseline.json)
- [Independent source adjudication](../scripts/evaluation-results/2026-11-02-independent-adjudication.json)
- [Targeted coverage retest](../scripts/evaluation-results/2026-11-02-coverage-retest.json)
- [Targeted explanation retest](../scripts/evaluation-results/2026-11-02-explanation-retest.json)
- [Six-case policy follow-up](../scripts/evaluation-results/2026-11-02-policy-follow-up.json)
- [Independent policy-follow-up adjudication](../scripts/evaluation-results/2026-11-02-policy-independent-adjudication.json)
- [Separate policy-follow-up cases](../scripts/assessment-policy-evaluation-cases.json)
- [Two-version whole-project source follow-up](../scripts/evaluation-results/2026-11-02-whole-project-follow-up.json)
- [Independent whole-project adjudication](../scripts/evaluation-results/2026-11-02-whole-project-independent-adjudication.json)
- [Sanitized hosted-chain summary](../scripts/evaluation-results/2026-11-02-hosted-chain-summary.json)
- [Synthetic reference cases](../scripts/assessment-evaluation-cases.json)

The separate edited walkthrough of the clean, no-key installation shows simulated payment and no AI call. It must not be presented as a live model or Sandbox transaction. A recorded same-project live-provider walkthrough is separate evidence, and does not establish real seller settlement or a bug-free outsourced website.
