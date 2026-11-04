# Synthetic time-policy integration

This is an independently implemented native SQLite/D1 reference handler, not an arbitrary-site scanner or production booking backend. It never imports the application oracle. All writes are isolated `PBP-` synthetic records with one-hour expiry; no email, customer or payment is involved.

The existing `fixed`, `cancel-credit` and `move-loss` profiles retain `time-policy-http-v1` and daily Melbourne11:00–20:00. Their original12-case run remains31HTTP requests/15POST attempts, bounded by40HTTP/18POST. Historical plans and cases are frozen in `tests/fixtures/time-policy-v1-frozen.json` from source commit `b07a73b03425682bcaf4069fa2661a7a859a93ce`.

The explicit calendar-v2 profiles declare `time-policy-http-v2` with matching policy:

- `calendar-fixed`: Friday22:00 until Saturday02:00 in Australia/Melbourne.
- `calendar-weekday-defect`: intentionally assigns the early Saturday tail to Saturday's weekday.
- `calendar-holiday-defect`: intentionally ignores the two configured closed dates.

Calendar v2 assigns the opening weekday to the date when the interval begins. A closed local civil date suppresses that entire date, even the tail of the preceding opening interval. A closed opening date cannot produce a next-day tail. Closing is exclusive, equal open/close times are unsupported, and nonexistent or repeated local minutes are rejected before business rules. Explicit closures are ISO dates,2025–2035, at most32; they are supplied by the buyer, not inferred from any jurisdiction's holiday calendar. Existing-reservation cancellation still follows its notice deadline; a closure does not prevent cancellation.

The default calendar plan uses15January2027, with22January and30January closed. It generates17cases,41HTTP requests and20syntheticPOST attempts. The independent limits are50HTTP/24POST. When a defective backend cannot establish a cancellation baseline, the dependent cancellation stays unknown and no cancellation write is sent. The weekday defect therefore uses35HTTP/17POST, with5mismatches and3unknown dependencies. The closure defect uses41HTTP/20POST and detects3mismatches.

An external seller must implement its own native configured policy and affirmative metadata declaration. Do not copy these finite fixture profiles as proof of the seller's own rules or source. `meta` must match protocol version, policy, synthetic-clock support and the already approved deployment revision before any booking write. Expected answers and policy are never sent in booking inputs. Only the approved lifecycle backend's fixed `time-policy/` paths are used.

The authenticated workbench stores a buyer-confirmed supplemental plan tied to the exact uploaded delivery/digest. Calendar v2 is opt-in; v1 saved reports retain their original semantics. No migration of acceptance or payment is required. Browser observation, model assessment, source/deployment authenticity and final human acceptance remain separate.

Validation: `node --experimental-strip-types --test tests/time-policy.test.ts tests/guest-lab-time-policy.test.ts`; fresh isolated D1 persistence/role tests: `node tests/run-collaborative-sandbox-local.mjs --suite time-policy`. Those local tests do not establish hosted execution or independent user adoption.
