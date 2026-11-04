# Dynamic artifact binding — independent adjudication

Date: 2026-11-04. Starting repository HEAD: `41f6a57`.
This work is local source modification and isolated testing. No commit, hosted
migration, deployment, acceptance on a real order, or actual PayPal action is
claimed here.

## Gap and resulting behavior

The prior deployment report compared only HTML/CSS/raster. A referenced `app.mjs`
could change while all compared files still matched. The seller can now save an
independent JS/MJS metadata manifest bound to the current static delivery digest.
The browser hashes local bytes; code is neither uploaded into the quote nor run.
A v2 deployment plan embeds the exact public manifest and direct-script coverage,
and compares the declared files through bounded GETs below the approved staging
directory. The historical v1 schema, plan digest inputs and 30-second duration
remain unchanged. New artifact declarations make earlier deployment checks
historical even when the static delivery digest is unchanged.

Bounds are 32 scripts, 2 MiB per script, 8 MiB declared total, eight manifest
records per project; v2 permits at most 72 finite files/45 seconds, strict MIME,
streaming per-file caps and a shared script-plus-static byte budget. Every next
request checks current delivery/approval/manifest. Missing direct references,
inline scripts, external/rooted/query/encoded/base URLs and a bounded overflow
are explicitly unknown. Imports/dependency graphs are not claimed complete.

## DeepSeek review and independent dispositions

Review packets and raw responses are retained under
`outputs/evidence-chain-cycles-2026-11-04/artifacts-review-01.json` through `04.json`.
They contain selected repository source and the delivery skill, no `.dev.vars`,
credentials, private client source, or actual payment records. These are advisory
static reviews, not executed tests.

1. Review 01 alleged a stale quote-version CAS problem in per-file progress.
   **Rejected.** The actual `update` SQL has no quote-version predicate; each call
   receives a newly read record, and manifest creation does not change the quote
   at all. The feedback's own reproduction contradicts the supplied SQL. Existing
   count/payload/session-version CAS was retained.
2. Review 01 alleged `<base>` drops later references. **Rejected as a defect:**
   each `src` already produces its own row with the raw reference preserved.
   **Accepted the useful reporting suggestion:** the UI now distinguishes base,
   inline, limit and unsupported-address reasons. Coverage exceeding 200 rows
   retains 199 rows plus a visible unknown limit marker rather than making the
   whole view unavailable.
3. Review 01 suggested retry/finalization after D1 persistence failures.
   **Not adopted.** A failed persistence operation is not silently retried or
   represented as a completed run. The existing explicit expired-run close keeps
   remaining files unknown and never replays target GETs. This bounded failure
   recovery is documented; there is no inferred success on interrupted storage.
4. Review 02 inferred POST 201 returns only a created record. **Rejected.**
   The actual route explicitly returns the complete `deliveryArtifactsView` with
   status 201. The panel's `request<View>` is correct. A new fresh-D1 assertion
   inspects the winning POST body for `manifests/latestManifest/coverage/canSubmit`.
5. Review 03 proposed a static `app.js` / dynamic `App.js` alias. **Rejected.**
   Static uploads only permit HTML/CSS/raster, and approved entry URLs must end
   in `.html`; its reproduction cannot pass the supplied validators. Within the
   manifest itself, case-conflicting paths are rejected. The fourth packet adds
   the actual static and registration validators to eliminate this assumption.
6. Independent fresh-D1 testing exposed a **real acceptance-lock omission**:
   collaborative acceptance is recorded in `proof.collaboration.stage` and
   `acceptance`, and need not set `proof.acceptedDeliveryId`. The new manifest
   gate now checks both representations plus payment lock states. The test
   performs real synthetic submit → buyer metadata decision → accept and then
   proves another seller manifest is rejected with history unchanged. This fix
   is included in review 04.
7. Review 04 then alleged an acceptance/rework CAS gap. **Rejected.** A save
   started from a pre-transition `ProofRecord` cannot pass the exact quote-version
   predicate after that transition changes `quotes.version`. A save freshly read
   after an explicit buyer return is deliberately allowed during rework; that is
   a new consented declaration, not an accepted-order bypass. A tab read while
   accepted cannot submit under that accepted record because the gate already
   rejects it. The feedback's sequence changes its premise from stale accepted
   read to a fresh reopened record. No extra SQL JSON predicates or automatic
   retry were added. Review 04 confirms the normal collaborative acceptance lock
   and the exact version/history CAS before making this unsupported inference.

The parent acceptance-chain implementation was notified that v1 reports under a
new manifest and v2 reports bound to older manifests must also be unknown/stale
in acceptance catalogs, not merely in the deployment panel. Direct-script
missing/unsupported and dependency-scope unknowns are carried into explicit buyer
acknowledgment by that independent module. The offline-bundle agent received the
public actor-free manifest schema, validator and exact v2 plan reconstruction
interface; actor identity is retained only in private D1 metadata.

## Executed evidence

- `tests/delivery-artifacts.test.ts`, `tests/deployment-artifacts.test.ts`, and
  `tests/deployment-source.test.ts`: **12/12 passing**, including true metadata
  byte hashing, 32-file/8 MiB positive boundary, path/count/per-file/total/extra
  field rejection, canonical manifest tampering, direct-script coverage/overflow,
  legacy v1 replay, v2 manifest/plan tampering, strict JS MIME, streaming caps,
  callback budget abort and timeout.
- An **owned actual HTTP server** returns identical HTML and CSS plus changed
  `app.mjs`: both static files match and the script is a mismatch. Only finite
  approved-path test transport is used; no untrusted JS is executed.
- `node tests/run-collaborative-sandbox-local.mjs --suite deployment-source`:
  **6 end-to-end groups passing**, with a sanitized source build and freshly
  migrated isolated D1 including migrations 0011/0012/0013. Tests cover real
  server-derived buyer/seller permissions, outsider/forged role/CSRF refusal,
  concurrent 201/409 manifest CAS, POST response shape, stale manifest rejection
  before report reservation, immutable previous declarations/readings, legacy
  v1→v2 staleness, delivery replacement, eight-record retention cap and the
  accepted collaborative-order lock. No mutation was retried.
- TypeScript `tsc --noEmit` and `git diff --check` pass at the recorded local
  checkpoint. Logs: `artifacts-unit-final.log` and
  `artifacts-fresh-d1-acceptance-lock.log` in the output directory above.

Earlier unsuccessful API runs are retained as debugging evidence. They first
exposed the derived-catalog whole-view comparison needing a narrow persisted
projection, then fixture/schema assumptions (catalog `rows`, calculated UTF-8
byte length, complete HTML fixture and collaborative acceptance location).
They are not counted as passing suites or independent product improvements.

## Remaining scope

This is still partial file consistency evidence. Seller-declared hashes are not
independent build provenance. No recursive imports, CDN, inline/dynamic script,
backend build, future stability or selective-serving protection is asserted.
Production browser behavior and the hosted migration/deployment remain the
parent agent's separate integration checks. Unit/D1/owned-HTTP success does not
mean real user authentication, a full security audit or competition acceptance.
