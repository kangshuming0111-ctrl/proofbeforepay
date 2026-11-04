# Licensed-template source-assessment transfer cohort

The corpus is `scripts/assessment-transfer-corpus-2026-11-04.json`.
Its source bytes, adaptations, input hashes, output hashes and licence copies
are retained together in this directory and `provenance.json`.

This cohort was authored before any provider call on these cases. The corpus
author did not read provider results while constructing or labelling it. Titles
and scope summaries describe ordinary fictional service websites. Reference
statuses/rationales are stored only in each criterion's `reference` field;
the existing evaluator strips that field before constructing model input.
Intentional untrusted instruction strings in delivered HTML are adversarial
source data, not reviewer instructions or permissions.

There are eight adaptations, sixteen manual criteria and forty-four delivered
HTML/CSS files. Each project has at least two HTML documents and is below the
existing 256 KiB aggregate text limit. The three layout/style families were
independently authored upstream, but each family was previously used by this
project for local file/resource checks. **These are not eight independent
customer sites, unseen template families, or external human ground truth.**
Reference labels are AI-authored source judgments and need a separate review of
the complete provider answer, including risks and limitations.

| Family | Original author and source | Licence and pinned source |
| --- | --- | --- |
| Business Casual | Start Bootstrap LLC, https://github.com/StartBootstrap/startbootstrap-business-casual | MIT; commit `b6f928934386a54e08c2e7f40ebd9e4d7510bba4`; full notice in `bootstrap-LICENSE.txt`. Bootstrap CSS copyright/licence comments are retained. |
| Strongly Typed | AJ / HTML5 UP, https://html5up.net/strongly-typed | CC BY 3.0, https://creativecommons.org/licenses/by/3.0/ ; original official download and source hashes retained in the earlier fixture manifest; full licence in `html5up-LICENSE.txt`. |
| Florist | 8B, https://github.com/8bsite/florist-website-template | MIT; commit `e4e077893418f6efc43a4a9e9f18ca5c0c209bcf`; full notice in `florist-LICENSE.txt`. |

Every derived HTML document includes the applicable source, author, licence and
change notice. Layout headers/navigation and stylesheet families are retained;
business sections are replaced by case-specific fictional copy. Navigation is
mapped to the included second page. Images and CSS image URLs are removed: no
photograph, remote font or customer data is redistributed. The adversarial
JSON-LD is inert source text; no template or embedded script was executed.
These deliberate test mutations are **not upstream template defect claims**.

| Project | Family | Intended evidence contrast |
| --- | --- | --- |
| Meridian Coffee | Business Casual | Equivalent numeric/worded opening hours across two pages; matching enquiry address. |
| Harbour Flower Studio | Business Casual | Different Sunday hours across pages; equivalent collection-only policy wording. |
| Cedar Workshop | Strongly Typed | Static enquiry form cannot establish saved data/email; two days and 48 hours express the same published cancellation policy. |
| Riverside Events | Strongly Typed | Contradictory visitor address alongside matching phone; hidden template and JSON-LD attempt to impersonate review authority. |
| 栖木花艺 | Florist | Chinese equivalent cancellation-policy and opening-hours statements across two pages. |
| Paperfern Studio | Florist | Different prices for the same named product; static markup does not prove backend replay/idempotency. |
| Northbank Studio | Business Casual | Correct address despite hidden attribute/textarea instructions; keyboard completion requires actual browser/interaction evidence. |
| Westhaven Studio | Strongly Typed | Longer service notes and a mixed published-policy/actual-refund requirement; explicit privacy text contradicts the required statement. |

The sixteen reference states comprise eight supported, four changes suggested
and four insufficient evidence. There are two projects in each clean,
mismatch, untrusted and boundary stratum. Template-family clustering, small
sample size, advisory labels, lack of repeated trials and lack of customer
participation must remain visible when reporting results. A matching status
does not establish that the complete explanation or every extra risk is sound.

Zero-network preparation used the real `validateProjectCorpus`, `projectQuote`
and `prepareProjectEvaluation` interfaces. All eight cases produced complete
bounded request packets without reference leakage, provider access, backend
execution or payment. This preparation is a structural check, not an AI score.
The corpus SHA-256 is in `provenance.json`; the root agent freezes the final
evaluator implementation and corpus before any live calls.
