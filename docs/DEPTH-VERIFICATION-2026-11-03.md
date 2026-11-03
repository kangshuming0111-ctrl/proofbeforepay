# Functional depth verification — 2026-11-03

This checkpoint adds a second business constraint and makes saved evidence easier to inspect. Source inspection, executed local tests, historical hosted observations and independent user outcomes remain different evidence. This document makes no claim that the new source has been deployed or submitted, or that it outperforms every award winner. Video work remains paused.

## Two original promises, one controlled capacity check

The buyer can select **booking-http-v3**, then choose and explicitly confirm two separate included source clauses. The example is “Each booking accepts at most 6 people.” and “Each time slot accepts at most 8 guests in total.” Exact source spans and punctuation are retained. Excluded, pending, ambiguous or substituted clauses cannot supply the policy. The bounded recipe supports per-booking M 2–12 and per-slot C 3–12 with M ≤ C < 2M; unsupported combinations require clarification rather than altered values. Existing eight-step v1 and eighteen-step v2 plans are not upgraded.

The seventeen v3 observations include a fresh empty slot, an above-party-limit rejection, two **different-key** requests competing for capacity, independent receipt and occupancy reads, replay of the actual winner, filling the remaining capacity, rejection of one extra guest, and another slot. With M6/C8 the two contenders each request 5; the expected race is one 201 and one 409, then a fill of 3. Final original-receipt and slot-A witnesses follow the slot-B write, so replacing earlier records cannot hide behind a later successful response. This differs from v2's **same-key** consistency check. Recovery performs no POST and cannot reconstruct an unobserved initial race.

The reference handler enforces its own native policy in SQL. It does not copy the checker's capacity into its datastore or fabricate success in adapter memory. Two independent SQLite connections in separate worker threads exercise the conflicting writes. Owned loopback HTTP then runs the actual checker against three native policies while keeping the buyer's M6/C8 unchanged:

| Native handler | Actual HTTP requests | Saved report: supported / mismatched / unavailable | Separate database observation |
| --- | ---: | --- | --- |
| Correct capacity 8 | 17 | 17 / 0 / 0 | Slot A contains 5 + 3 = 8; independent slot B contains 6. |
| Deliberate overbooking | 9 | 6 / 3 / 8 | Both 5-person contenders persisted: slot A contains 10. |
| Too strict: capacity 7 | 13 | 12 / 1 / 4 | Slot A contains 5; the agreed fill to 8 was rejected. |

Unavailable dependent steps remain unavailable; they are not counted as successful requests. These are controlled synthetic local SQL and loopback observations. They do not establish remote D1 scheduling, general database correctness, an independent seller, a hosted v3 result or deployed-code provenance. The reproducible surfaces are [the native reference](../examples/seller-capacity-staging/worker/capacity-service.mjs), [native SQL tests](../tests/seller-capacity-staging.test.mjs), [loopback HTTP tests](../tests/runtime-capacity-native.test.ts), and [protocol tests](../tests/runtime-capacity.test.ts).

The source also hardens v2 against a different-key receipt overwrite: independent creates need different receipt IDs, and earlier records are reread after later writes. This closes a concrete counterexample in which a last-record-only backend could satisfy earlier individual reads. It does not prove the absence of hidden records throughout a datastore. See [cross-key regressions](../tests/runtime-cross-key.test.ts).

## Check the connection before granting writes

**Check connection (no booking writes)** reads only the saved, approved target's metadata. The server checks membership, origin, exact upload digest, project/protocol, expiry and the complete frozen declaration; caller URLs or metadata are not accepted. The bounded request is one GET `meta`, with omitted credentials, manual redirects, a 4-second timeout and 16KiB body limit. The UI names missing, mismatched and malformed declaration fields without displaying remote field values.

No booking, model or payment request is sent. A match means the declaration matched; it is not proof of business behavior or deployment provenance. The preflight creates no lease, report or audit mutation and is not acceptance evidence. Changed context, cancellation and late results cannot replace the current check. See [executor tests](../tests/runtime-preflight.test.ts) and [server-boundary tests](../tests/server-runtime-preflight.test.ts).

## Inspect a downloaded package in the browser

The guest source now builds an additional `/verify.html` entry. A reviewer can select a local evidence JSON file, see eight consistency gates and retained HTTP observations, and inspect exact requirement/source text without an account or provider key. The shipped historical fictional examples remain **17/18 with a failure** and **18/18**; an internally consistent record is not a successful website test.

The controller caps input at 4MiB, rejects invalid UTF-8/JSON, discards stale reads and shows unfinished runs separately from older saved reports. Uploaded HTML/CSS is displayed as text, never executed or applied. The page uses `connect-src 'none'`; the verifier makes no upload, model, backend or payment calls. It recomputes supplied evidence consistency; it does not reissue the historical HTTP requests. See [viewer tests](../tests/evidence-viewer.test.ts) and [format and authenticity limits](OFFLINE-EVIDENCE.md).

A fully fabricated but self-consistent unsigned package can pass. There is no trusted signature, verified issuer or independent execution attestation. Retained source text can itself contain personal information; the allowlist is not an anonymiser.

## Executed checkpoint and remaining evidence

The final release regression log reports **583 passed, zero failed**. This is a regression checkpoint, not a winner score. The native SQL/HTTP pair passed 16 tests. The same 16 existing cases were independently rerun 20 times with stable source hashes: 320 successful test executions, not 320 distinct cases. The fixed/overbooking/too-strict outcomes above remained consistent. These repetitions do not establish exhaustive scheduling coverage or a remote load test. The final source typecheck passed. The permanent isolated runtime API suite passed 10 groups: it rejected malformed, forged or excluded two-source plans; saved two 17-step v3 reports; required complete explicit exceptions; and preserved the acceptance snapshot when a later report was supplementary.

That API suite used synthetic identity headers and a fresh local build/D1 with all outbound backend/provider traffic blocked. It made zero application-model or provider calls. Its unavailable reports verify route, storage and acceptance behavior; they are not executed backend observations, real sign-ins, actual browser actions or payment. These differ from the separate native HTTP results above.

The primary agent also reproduced and fixed a real bundled-mount defect: the guest capacity-staging mount omitted optional backend artifact/source declaration fields when forwarding to the native handler, causing a matching registered declaration to fail. Three built-worker mount regressions now exercise required-only and optional declarations plus the configured built-in capacity paths. Across the two declaration variants, tampering each of the 17 report paths produced 34 explicit rejections; this is 34 path-tampering checks, not 34 separate business recipes. The optional hashes remain operator declarations, not deployment attestation. See [built-mount tests](../tests/guest-capacity-mount.test.ts).

The guest HTTP panel now has an explicit v3 scope with the fixed M6/C8 synthetic agreement. Three local guest API tests exercise actual loopback requests through the bundled guest routes and native SQL: fixed 17/17, deliberate overbooking with actual slot occupancy 10, rejected missing consent/changed limits/caller URLs/cross-origin requests without writes, and preserved independent legacy 8/18-step choices. The frontend scope makes this a capacity recipe rather than silently changing a legacy protocol. These are local guest API executions, not an externally hosted result. See [guest API tests](../tests/guest-lab-capacity.test.ts). The guest slice's focused DeepSeek source review completed with no actionable findings. Its source hashes were checked against the reviewed packet; this review did not execute browser or hosted checks.

## Actual local browser observations

The primary agent used CUA on the local main workbench: manually confirm the two original v3 clauses, create and lock the project, switch to seller, choose a compatible target, upload files, and open the seventeen-step backend panel. This verifies the exercised intake/target/upload UI path; it does not by itself establish 17 executed backend observations. The delivery tab now identifies both page and backend checks.

Local CUA also exercised the browser verifier: the recorded 17/18 failure stays distinguishable from the recorded 18/18 result; invalid UTF-8 and a 4MiB+1 input are rejected; and a source-modified package with both outer and delivery digests recomputed still fails source/runtime-reference consistency. That counterexample shows why a new self-declared digest is insufficient. At a 375×812 viewport, measured document scroll width was 375px. It is one developer-operated local viewport check, not a device or unfamiliar-user study. These observations do not establish publication of either new page.

Focused DeepSeek reviews were advisory source reviews. Codex independently reproduced or rejected their findings and retained the decisions; reviewer agreement is not a test result. Buyer intake/feedback tests separately cover explicit two-clause adoption and all failure IDs within the 1000-character field in both languages.

Still missing at this checkpoint: completion of the remaining focused source review and new-source hosted verification; an independently operated authorised seller staging deployment and datastore; unfamiliar-user completion and comprehension outcomes; and new continuous presentation evidence, which the user has paused. The historical v2 hosted reference remains valid historical evidence, not a hosted v3 claim. No new PayPal transaction, legal determination, real seller settlement or formal competition submission follows from this round.


## Final presentation and full local workflow follow-up

The actual browser walkthrough exposed a v3 summary defect: the main result card still searched for legacy `create`/`readback` steps and displayed empty dashes, while the independent post-race aggregate was hidden from the compact spotlight. The summary, spotlight and version comparison now show protocol-specific race observations and bounded literal after-race/final-A readings. Stage labels distinguish the old after-race 10 from the corrected after-race 5 and corrected final 8; status codes never supply an inferred occupancy. Five focused presentation regressions and a narrow final DeepSeek review cover this change.

An AI-operated developer walkthrough of the initial isolated source snapshot completed the local main workflow using the controlled hosted native targets: two explicit clauses, locked scope, flawed v1 report (6/3/8), seller submission, buyer feedback attached to the capacity clause, replacement v2, a fresh 17/17 report, two width readings, explicit current-version test acceptance and an exported evidence package. Acceptance did not initiate preauthorization or payment. The selected fixture was visually inspected at 375px; these developer-operated test confirmations are not independent human research. The resulting v3 package passed all eight gates in the published browser-local verifier without an upload or reissuing the historical requests. This is a local main-app workflow with actual hosted target requests. That isolated snapshot predates the final presentation fix; the final main-site hosted UI still needs a separate check.

The unchanged developer-operated v3 acceptance export is included at [recorded capacity evidence](../tests/fixtures/recorded-capacity-v3/evidence.json), with [explicit provenance and limits](../tests/fixtures/recorded-capacity-v3/README.md). Four regressions retain its seventeen-step and acceptance binding and reject altered capacity, truncated original source and omitted acceptance report references. It is a recorded current-version artifact, not the earlier flawed delivery or a replay of HTTP requests.
