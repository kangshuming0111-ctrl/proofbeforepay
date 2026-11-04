# Source citation visibility — independent adjudication

Scope: new optional source-citation to static-browser observation feature.
Only selected public source and the shared project skill entered DeepSeek
Harness. No credentials, private project contents, customer identities or
runtime settings were supplied. Reports remain advisory and are retained next
to this record.

## Review01

- **F1 rejected as stated.** The review reverses the containment inequalities:
  `node.start >= citation.start && node.end <= citation.end` requires the complete
  source node to lie inside the quotation. It cannot admit a node larger than a
  partial quotation. Parse5 does not merge text across child elements into one
  text node. Executed counterexamples cover partial words, multiple inline
  nodes, scripts/templates, attributes, CSS and repeated normalized text.
  Independent hardening was still useful: a saved target now retains its own
  sourceStart/sourceEnd and its exact raw span is decoded from the citation and
  compared with target.value. A mutated target text is rejected on read.
- **F2 rejected.** A single SQLite `INSERT … SELECT … latest-ID = previous-ID`
  serializes the absence comparison and append. The second statement observes
  the first insert; `null` becomes an empty-string baseline and then cannot
  match a newly existing report. Native SQLite tests exercise both initial
  absence-CAS and an existing baseline with concurrent connections, equal
  timestamps and descending UUID sort order. A separately built fresh Worker/D1
  API run produced one201and one409 for an empty-history race.

## Review02

- **F1 rejected.** The proposed trace substitutes a stored plan for the current
  one. The save path calls `sourceVisibilityPlan(quote)` afresh; it never accepts
  a participant plan/selector/target. The stored predecessor is only an immutable
  CAS identity. Four identical readings are also rejected as duplicates.
  A historical unsupported target cannot become observed by replaying its ID.
  Existing full-plan, duplicate, wrong-width, wrong-identity and unsupported-
  citation counterexamples execute these checks.

## Independent root audit

- **Accepted and fixed:** an ancestor's `visibility:hidden` can be overridden by
  a descendant's `visibility:visible`. Visibility now uses the target parent's
  computed value. Ancestor display:none, opacity:0 and content-visibility:hidden
  are still checked separately. A real CUA fixture verifies restored visibility
  at375px and1280px, alongside genuinely inherited hidden and opacity suppression.

## Review03

- **F1 rejected as stated.** `inert` suppresses interactions/accessibility but
  does not necessarily hide pixels or collapse layout. Treating it as hidden
  would create a false visual claim. The declared report is layout evidence,
  explicitly not interaction/accessibility validation. The real fixture now
  records inert-but-visually-present text as visible at both widths. Its
  opacity:0 ancestor with a `visibility:visible` child is also an actual existing
  fixture and is hidden at both widths.
- **F2 accepted and fixed.** A text rectangle may lie inside the iframe viewport
  but outside an inner scroll/clip container. The probe now intersects clipping
  ancestor client boxes and requires every nonempty text rectangle to fit within
  those boxes and the viewport. Partial clipping or a transformed clipping box
  remains unknown; inner containers are not silently scrolled to claim success.
  Actual CUA re-ran two clipped cases at both widths; all four are unknown.
- **F3 rejected.** The fixture delegates identity validation to the same
  `createSourceVisibilityReport` helper used by the application; that helper
  explicitly compares the input delivery/assessment with the fresh quote plan.
  The omitted dependency was not evidence of missing validation. Focused tests
  and fresh-D1 API calls reject stale and fabricated identities.

## Review04 — corrected clipping probe

- **F1 rejected.** The proposed reproduction assumes the ancestor loop stops at
  `body`. It actually follows `element.parentElement` until null, so it includes
  `html` as well. Root overflow is already considered, alongside the iframe
  viewport. The review gives no accepting counterexample for its stated claim.
  CSS masks, nonrectangular clips, overlays and pixel readability remain outside
  this bounded layout observation; no complete visual verification is claimed.
- The reviewer found no remaining concrete mismatch for the actual16-observation
  fixture, acknowledged the new clipping guard and retained the no-execution
  limitation. No additional code was changed for the unsupported suggestion.

## Verification layers

- Eight focused Node tests pass, including actual native SQLite concurrency,
  role/version/cap guards and immutable supplemental-report validation.
- Three fresh isolated Worker/D1 API groups pass. The AI report and submitted
  visibility readings in that suite are explicitly synthetic. It proves routes,
  roles, CSRF, stale-plan and append behavior, not real authentication, a model
  response or browser operation. Quote and money are unchanged byte-for-byte.
- Actual CUA operated the browser probe on a local fictional saved snapshot:
  eight quotations at375/1280px, sixteen total observations. Results are
  seven layout-visible, five explicitly hidden and four unknown, exactly matching
  the seeded CSS behavior. This is a real browser observation, not a main-site
  persistence or external-user study. The local server and tab were stopped.
- Main-site UI placement, hosted persistence and release integration are owned
  by root and are separate from these local results.

Reports do not modify model answers, participant reviews, buyer acceptance,
payment or deployment authority. Limits and original failures remain explicit.
