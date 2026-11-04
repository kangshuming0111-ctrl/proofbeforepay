# Source quotations and observed static layout

An AI source quotation is not a browser observation. A delivery may contain
correct visible opening hours and stale text in a hidden menu. The optional
**Observe AI citations on the page** panel records those two facts separately.

1. Save an AI source assessment on the exact current uploaded delivery.
2. Open the citation observation panel near that assessment. The server derives
   a finite plan from the saved exact quotations, never from a caller URL or
   selector.
3. A buyer or seller runs the plan in their browser. Saved static pages are
   loaded in the existing isolated frame with scripts and forms disabled. Source
   identity and applicable stylesheets are checked before observations.
4. The same full source text node is observed at375px and1280px. A result is
   visible in layout, explicitly hidden by supported CSS, ambiguous, or
   unavailable. The history retains the reporting participant role.
5. Review the original quotation, observation, agreed scope and actual live page
   together. The observation does not edit AI findings, participant annotations,
   human acceptance or payment.

The plan includes at most24unique citations, with further quotations explicitly
counted as unobserved. A full, unique body text node must lie inside the exact
source quotation. The observed node retains its own source offsets, decoded text
and parser-derived element path. Partial words, multiple body text nodes,
repeated normalized text, CSS, attribute strings, scripts, template/noscript content,
foreign markup and image contents are not converted into guessed selectors.

Layout visibility is deliberately bounded. It does not prove absence of
overlays, complete accessibility, subjective design quality, script-driven
interactions, live deployment identity or fulfilment of the buyer requirement.
Text inside an `inert` attribute can remain visually present: this observation
does not reinterpret interaction/accessibility suppression as CSS invisibility.
Inner clipping and unsupported transformed clip geometry remain unavailable.
Hidden source text remains a source conflict: it may become visible after an
interaction outside this static observation. A hidden result never resolves a
dispute automatically.

New evidence is an immutable append to `source_visibility_reports`, with a
20-report project bound. The server re-derives the current plan, validates full
two-width coverage and derives counts. A single SQLite insert checks project
version, real membership, history capacity and the last report for the exact
delivery/assessment. Insertion order is independent of wall-clock ties and UUID
sort order. Concurrent tabs with the same baseline cannot both append. Replacing
delivery or assessment makes old reports historical; they are not inherited by
the new version. Client browser statements remain client statements even after
schema validation and persistence.

Verification is separated by layer:

- `tests/source-visibility.test.ts`: source ranges, parser paths/entities,
  conservative unsupported cases, reading/storage validation, and actual native
  SQLite concurrency/role/version/history-cap checks.
- `node tests/run-collaborative-sandbox-local.mjs --suite source-visibility`:
  fresh isolated Worker/D1 API roles, CSRF, stale identities, complete coverage,
  append concurrency and replacement. Its assessment and submitted readings are
  explicitly synthetic; no model or browser success is claimed.
- `node --experimental-strip-types tests/source-visibility-browser-fixture.mjs`:
  start an account-free local fictional fixture, then click its run button with
  CUA. It exercises the actual probe and CSS counterexamples in a real browser.
  The fixture does not authenticate a customer or prove main-site persistence.
