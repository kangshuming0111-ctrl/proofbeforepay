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

## Latency, usage and cost estimate

The 19-case baseline reported **17,330 input tokens** and **3,783 output tokens**. Mean request/validation time was **1,750.7 ms**. Per-stratum latency samples and percentiles are in the raw report. All 19 calls returned usable usage data and no application output error.

Using the verified **peak cache-miss input and peak output rates** as a conservative estimate, the baseline usage costs **USD 0.0097386**. The truncation retest estimate is **USD 0.0007047** and the explanation retest estimate is **USD 0.0005262**. These are usage-based estimates, not an invoice; cache discounts and off-peak prices can reduce the actual charge. The evaluation runner's byte-based reservation is an admission estimate, not a provider-enforced spending limit. [Official DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing/)

## Reproduce and inspect

Run `node --experimental-strip-types scripts/run-assessment-evaluation.ts --output /absolute/new-report.json` for a zero-network dry run. Live requests require a caller-provided API key and explicit `--live --max-calls` and `--max-usd` options. The runner stops on unknown usage, an HTTP error or usage exceeding its reservation, and never automatically retries.

- [Original live baseline](../scripts/evaluation-results/2026-11-02-baseline.json)
- [Independent source adjudication](../scripts/evaluation-results/2026-11-02-independent-adjudication.json)
- [Targeted coverage retest](../scripts/evaluation-results/2026-11-02-coverage-retest.json)
- [Targeted explanation retest](../scripts/evaluation-results/2026-11-02-explanation-retest.json)
- [Synthetic reference cases](../scripts/assessment-evaluation-cases.json)

The separate edited walkthrough of the clean, no-key installation shows simulated payment and no AI call. It must not be presented as a live model or Sandbox transaction. A recorded same-project live-provider walkthrough is separate evidence, and does not establish real seller settlement or a bug-free outsourced website.
