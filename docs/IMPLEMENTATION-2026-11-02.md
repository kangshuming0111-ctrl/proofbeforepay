# ProofBeforePay implementation follow-up — 2 November 2026

This follows the winner-gap review. A completed implementation, a controlled local test, a production sign-in, an actual Sandbox transaction, and a first-time human trial are different evidence levels.

## Delivered code

- **Criterion-level revision evidence:** choose one locked requirement and compare the previous buyer feedback, each version's rule excerpts, saved source-AI advice and browser-width observations. Missing or stale reports are unavailable. A newer version or a lower issue count never becomes an automatic “fixed” verdict. The view does not accept work or initiate payment.
- **Human correction of AI risks:** either authorized participant can append a reason and a decision to an exact saved delivery/report/risk. The history records the role and time; each role's latest position remains visible. It neither overwrites the original model output nor decides acceptance/payment. Replacement versions start without inherited human risk reviews; archived snapshots retain them. A failed save retains the note and shows an inline message.
- **Bounded website packages:** seller folder upload preserves relative directories and accepts HTML/CSS/PNG/JPEG/WebP. The root must contain `index.html`. Limits are forty files; text 64 KiB each / 256 KiB total; images 256 KiB each / 1 MiB total. Server validation rejects unsafe paths, collisions, unsupported executable formats and invalid raster structures. This is bounded structural validation, not complete image decoding or a security certification.
- **Static resource records and previews:** saved versions keep their own files and reference findings. Preview CSS/images are constrained to the same version path; scripts, form submission and external subresource execution remain disabled. External or unsupported references are flagged without claiming every external navigation was blocked. Source AI does not inspect image pixels or receive saved raster data URLs.
- **Explicit two-account Sandbox workflow:** select “Invite a real seller + Sandbox test payment” when creating a custom project. The server requires authentication and provider configuration and writes an origin flag. Old projects and client-forged flags cannot silently gain this mode. A real seller joins through the email-bound invitation; only the buyer can authorize/capture after accepting the current version. Payment goes to the configured test merchant, not the actual seller. No escrow or production money is introduced.

## Verification completed during implementation

Domain, resource, upload, comparison, model-source, role and payment tests were run. A separate allowlisted source export was built against a fresh local D1 with fixed synthetic provider configuration and all external provider fetch blocked. Two local trusted-identity fixtures completed invitation, revision, acceptance and persisted mock-provider capture. This is not two real sign-ins or actual Sandbox funds.

Three independently sourced, licensed static templates were adapted without scripts and with separately attributed photographs. Their original sources, licenses, adaptations and file hashes are retained in the local fixture bundle. The browser upload adapter and server validation accepted all three. Root then used the actual folder picker to upload and replace them, inspected rendered JPEGs/styles, and saved client browser readings at 375px and 900px. Those readings are not independent server tests or full usability checks.

The implementation uncovered and repaired integration issues in nested CSS matching, layout-file enumeration, stale workflow selectors and in-flight risk notes. DeepSeek's relevant feedback was independently accepted or rejected using source evidence, counterexamples, tests and official specifications. No private runtime configuration entered review packets or public source exports.

## Evidence still requiring actual participants

- The new two-account path must still be exercised with two independent authenticated browser accounts and the real PayPal Sandbox service. The user is preparing the second account. The existing owner-role Sandbox receipt is separate historical evidence.
- A new continuous interaction video has not been recorded. The old 135-second screenshot edit remains unchanged. The native recording entry attempted during this session did not produce a usable recording control. The [new recording plan](DEMO-RECORDING-2026-11-02.md) is prepared, not a completed recording.
- Three first-time human testers are not currently available. The [trial plan](FIRST-USE-TEST-2026-11-02.md) and [blank CSV](FIRST-USE-TEST-RECORD-2026-11-02.csv) are ready. No simulated agent feedback is counted as a human study.

The current Devpost entry remains an editable, unsubmitted draft. Site publication or a new source archive is not formal submission.
