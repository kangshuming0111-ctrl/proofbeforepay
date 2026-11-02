# Download and check delivery evidence offline

The workbench's **Export** menu offers two distinct downloads:

- **Offline-checkable evidence** uses the versioned `proofbeforepay-evidence-export-v1` envelope and `pbp-static-source-v2` rules. It includes the original requirements, current delivery files, deterministic findings, supplied reports, acceptance snapshots and their references. Account-member, customer identity, payment-record and provider-configuration fields are omitted. Original requirement/source text is retained, so this is not an automatic anonymiser of document contents.
- **Raw project record JSON** preserves the earlier record download. It is not silently treated as the versioned offline format.

The current-delivery scope excludes earlier delivery versions. Saved older reports and acceptance snapshots belonging to this same delivery remain included. The workbench's previous-delivery history remains separate. Unsupported legacy records or contradictory evidence are reported instead of synthesising missing history.

## Run the read-only verifier

After installing the repository's pinned dependencies, use Node.js 22.13 or newer:

```sh
node --experimental-strip-types scripts/verify-evidence-export.mjs /absolute/path/to/PBP-verifiable-evidence.json
```

The included recorded, entirely fictional examples can be checked without any account or API key:

```sh
node --experimental-strip-types scripts/verify-evidence-export.mjs tests/fixtures/recorded-seller-staging/v1-evidence.json
node --experimental-strip-types scripts/verify-evidence-export.mjs tests/fixtures/recorded-seller-staging/v2-evidence.json
```

The CLI reads one bounded regular UTF-8 JSON file. It rejects symlinks, unsupported formats and oversized files, does not read environment configuration, and does not execute the delivery or make network/model/payment calls.

Exit codes are `0` for internally consistent, `1` for an inconsistency, and `2` for unsupported format or unreadable input. The JSON result lists each check and the limits of the conclusion.

## What is checked

The verifier recomputes the exact file-map digest; replays the named static source rules; resolves literal requirement and model citations; recalculates outcomes from supplied browser/layout/business observations; and checks HTTP report plans, targets and frozen declarations. It validates acceptance references, required report references, explicit exceptions, human annotations and pending/completed run identity. Reusing one immutable report or annotation ID for different contents fails. Reordering equivalent metadata object keys does not fail; array ordering and source bytes remain significant.

Built-in fictional deliveries have a narrow compatibility rule for their original bounded `delivery-manifest.json`. This does not enable JSON files in ordinary custom uploads. Both failed and corrected built-in samples can be consistent records.

## What a consistent result does not establish

Consistency is not authentic issuance, verified identity, actual HTTP execution, correct model judgment, a legal decision, complete website correctness or successful payment. The package has no trusted signature or external anchor. A completely fabricated but internally consistent package can pass. An inconsistency is not itself evidence of fraud.

A source edit is not repaired merely by recalculating a self-declared digest: saved source excerpts, deterministic findings and bound HTTP reports must still agree. The included v1 record is internally consistent while retaining a genuine recorded **17/18** result and its over-limit failure. The verifier does not convert that failure into a pass.

## Recorded example provenance

`v1-evidence.json` was exported from a developer-operated, single-account, two-role synthetic workbench case on 2 November 2026 UTC. The main application made actual bounded HTTP requests to a separately implemented seller-reference handler deployed in the public verification lab. The handler used its own native business policy and separate `seller_*` tables in the lab's physical D1 database. The planted native maximum was seven while the buyer agreed six. The workbench retained one mismatch, and a separate read-only database inspection found the stored seven-person synthetic receipt.

This was a controlled reference deployment, not a real third-party seller or independent physical database. The record is historical, unsigned developer evidence; the offline CLI cannot independently establish those execution claims. No new application-model or PayPal call belongs to this recorded run.

`v2-evidence.json` retains the same fictional buyer requirement after the native policy was corrected to six. A fresh hosted run saved 18/18 observations, including rejection of seven with HTTP 422 and separate exact-boundary persistence/readback. A later real DeepSeek source assessment retained two insufficient-evidence judgments for mobile/backend behavior rather than treating copy as execution. Strict layout measurement then retained 375/375 and 900/900 document widths after the saved-artifact response was protected from intermediary transformation. A developer operated both simulated roles, submitted the revision, reviewed the bounded evidence and explicitly accepted the exact v2 delivery. A separate simulated authorization/capture produced a demo receipt; no PayPal call or money movement occurred in this run. The allowlisted package retains the acceptance snapshot and its exact report references but omits payment fields; its offline result is consistency only.
