# Evidence gaps, withheld AI leads and human opinions

This guide covers the saved source-assessment workflow added in cycles 16–18. It does not describe a new browser, backend or security test. The buyer still confirms acceptance separately, and payment remains a separate action. A contract is optional.

## When an item says evidence is insufficient

New active V3 reports attach `evidenceNeed` only to a final `insufficient_evidence` item:

```ts
{
  schema: "source-evidence-need-v1",
  reason: /* one of the twelve codes below */,
  targetFiles: /* exact delivered HTML/CSS keys, possibly empty */
}
```

The server records a reason at the guard branch that actually handled the item. It does not infer a cause from the model's explanation. An unresolved model result without a more specific recorded branch uses `model_unresolved`. This metadata supplies a next step; it neither promotes an unknown result to a pass nor proves that a feature is missing.

| Saved reason | What to inspect next |
| --- | --- |
| `browser_observation` | The required viewport and browser actions, with inspectable observations for buyer review. Source does not establish mobile usability. |
| `direct_observation` | Execution or human observations against the complete requirement. Source descriptions alone do not establish operation. |
| `financial_execution` | Existing, explicitly authorized Sandbox/test results and corresponding transaction records. An evidence request initiates no payment or refund. |
| `record_readback` | Existing authorized-test writes and independent readback of the same data after any required reload or restart. |
| `requirement_clarification` | The complete locked wording and the kind of evidence the participants need. This does not rewrite the agreement or require a contract. |
| `manual_interpretation` | The complete wording, including punctuation or possible meaning differences, for buyer interpretation before a repair demand. |
| `page_scope` | An explicit mapping between the requirement and exact delivered filenames. A page-role alias is not a trusted file mapping. |
| `page_citations` | Complete evidence from every specified page. One correct page cannot stand in for another. |
| `field_relationship` | The complete same-page, form or content-block relationship. Adjacent fields and equal prices are not interchangeable evidence. |
| `source_ambiguity` | Source relationships or direct observations that resolve the recorded uncertainty. Complex or dynamic source does not prove content is absent. |
| `no_citations` | Inspectable source evidence from the current delivery, bound to the relevant requirement and content. |
| `model_unresolved` | The full requirement and available evidence together. No more specific cause was inferred from model prose. |

Each item has one recorded reason, not an exhaustive decomposition of a compound requirement. For example, “save the enquiry, preserve it after a restart, and deliver a confirmation email” needs both independent record readback and separate evidence of email delivery. The `record_readback` next step explicitly calls out additional operations **if the same locked requirement includes them**. It does not add email delivery to an agreement that never required it, or run a test automatically.

`targetFiles` is deduplicated and bounded to 40 exact provided HTML/CSS keys, with each path at most 300 UTF-16 units and subject to the upload path rules. No filename alias, normalized alternative or model-suggested path is invented. An empty list means that no exact target file was recorded; confirm the scope against the locked requirement. It does not mean that no files or evidence are needed. The interface retains the complete recorded list in an expandable section.

The seller supplies delivery files and inspectable evidence; the buyer reviews that evidence against the locked requirement. “Draft an evidence request” prepares an editable, unsent message. It does not submit feedback, demand a repair, check a human-acceptance box or accept work.

The draft's existing limit is 1,000 UTF-16 units. The complete next-step wording and file-list notice are budgeted before shortening the locked-source or saved-explanation excerpts. Shortened sections are labelled, and surrogate pairs are not split. If the complete target-file list is too long for the short draft, the draft explicitly directs the reader to this version's full list and asks them to complete the message before sending; it does not publish shortened paths as a complete list. Inspect the full locked requirement before sending any compound or excerpted request.

## Why some AI leads are withheld

Every new active V3 report records an explicit `withheldRisks` disposition:

| `version: 1` reason | Saved meaning |
| --- | --- |
| `not_withheld` | `adjustedCriteria` and `entries` are empty. No AI leads were withheld; any published leads still need review. |
| `item_status_adjusted` | At least one final item status differs from the model status. All optional validated model leads are withheld together; the published `risks` array is empty. The retained entry count may be zero. |

Each adjustment retains `criterionId`, `originalStatus` and `publishedStatus`. Each retained entry has `originalRiskIndex` and the validated original `risk` fields: `title`, `explanation`, `suggestion` and exact source `citations`. Withholding happens only after mandatory fields, citation positions and budgets have passed validation; it does not rescue a malformed response.

This is a deliberately coarse publication gate. A changed item can cause unrelated useful leads to be withheld too. The adjustment list is not a causal mapping from every lead to a requirement, and withholding does not confirm, reject or resolve a defect. Inspect the per-item evidence and the original lead separately. The published and withheld counts are shown independently; neither is a website-coverage percentage.

The retained record contains validated lead wording and source spans, not the full provider response envelope, raw tool arguments or a provider-authenticated receipt. Model limitation prose is not published as a verified finding; current system notes describe the actual supplied inventory and the absence of browser/script/backend/pixel execution in this source assessment. Retained benchmark transport artifacts are a separate audit layer, not a promise that every live report stores the full provider body.

## Recording a human opinion

Either authorized participant can append a reasoned opinion about one exact saved lead. Published-lead records retain the old input shape: no `riskOrigin` field means published. A withheld-lead record must explicitly use `riskOrigin: "withheld"` and the retained original index. No other origin value is accepted.

The server binds the opinion to the exact delivery, assessment, origin, index and participant role. A published lead at index `0` and a withheld lead at index `0` do not share review history or idempotency identity. The published-lead summary excludes withheld opinions. The interface also separates their form state when the origin or acting role changes. Real membership is checked on the server; a perspective switch does not grant membership.

In the withheld section, **confirmed**, **rejected** and **more evidence needed** are explicitly labelled human opinions. They append to the record without editing the lead, its citations, item findings or publication disposition. They do not release the gate, accept work, start payment or create a repair task. There is no linked repair action in this section; return to the corresponding agreed requirement for revision or acceptance. Another participant's opinion does not erase an earlier disagreement.

If saving is uncertain, the form retains its reason and origin and asks the participant to check the saved history before deciding whether to retry. Busy or read-only views do not submit. Read-only historical views display the original version's available records in their proper namespaces; a replacement delivery does not inherit them as current opinions.

## Older records and offline checks

Older reports and explicit V2/legacy replay results can lack the new metadata. They are not backfilled from limitation sentences or guessed counts. Missing `evidenceNeed` means no structured cause was recorded. Missing `withheldRisks` means there is no structured withholding record from which to recover originals; it does not establish that no leads were withheld. Missing `riskOrigin` on an old human opinion retains its published meaning.

Use an upgraded verifier for exports containing these fields. The current CLI and Lab verifier share the native evidence validation boundary; an older downloaded verifier may reject the extension. Update the verifier rather than deleting new fields to make a file pass. From the repository, use Node 22.13 or later:

```sh
node --experimental-strip-types scripts/verify-evidence-export.mjs /absolute/path/to/evidence.json
```

The Lab's [local evidence-check page](../app/guest-lab/verify.html) is the corresponding browser entry point in a current Lab build. Checking a selected export does not upload it, run the delivered website, contact a model or make a payment. A published Lab deployment must contain the updated verifier before its result can be claimed for a new-format export.

The verifier fails closed on malformed new metadata, unknown reasons/origins, inconsistent pool or status bindings, invented or misplaced source spans, and invalid current or historical annotation references. The UI's cautious fallback for an unavailable record does not repair or authorize an invalid export. A consistent export establishes saved structure and source relationships; it does not authenticate the model/provider, prove a claimed cause, verify a participant's real identity, demonstrate runtime success or establish full website correctness.

See the [citation and publication protocol](ASSESSMENT-CITATION-PROTOCOL.md) for the transport and source-witness boundaries. The checks remain separate from browser observations, independent backend readback, human acceptance and payment.
