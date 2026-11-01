# Read only what changes the decision

All paths below are relative to the ProofBeforePay repository. They are navigation hints; verify the source rather than treating this map as current runtime proof.

| User flow or boundary | Start here | Useful verification |
| --- | --- | --- |
| Requirements → editable checklist → confirmed original | `lib/requirement-extraction.ts`, `lib/requirement-store.ts`, `app/api/requirements/route.ts`, `app/api/proofs/route.ts` | `tests/requirement-extraction.test.ts`, `tests/requirements-api-smoke.py` |
| Intake and source display | `app/components/RequirementsIntake.tsx`, `RequirementsSource.tsx`, `app/requirements.css`, creation branch of `app/page.tsx` | TXT chooser, back navigation, edit invalidates confirmation, saved source |
| Buyer/seller actions, feedback, revision and acceptance | `lib/proof-workflow.ts`, `lib/proof-store.ts`, `app/components/CollaborationPanel.tsx`, `VersionViewer.tsx` | `tests/collaboration-api-smoke.py`, exact-version and stale-action tests |
| Same-account demo versus real membership | `lib/proof-demo.ts`, `lib/proof-store.ts`, `app/api/proofs/route.ts` | `tests/proof-demo.test.ts`, `tests/role-demo-api-smoke.py` |
| Uploaded files and conservative findings | `lib/static-project.ts`, `lib/proof-evidence.ts` | `tests/static-project.test.ts`, `tests/custom-project-api-smoke.py` |
| Browser layout observations | `lib/layout-probe.ts`, `lib/layout-report.ts` | corresponding layout tests; observations never auto-pass human usability |
| Model and Sandbox boundaries | `lib/providers.ts`, `lib/proof-domain.ts`, proof action route | provider/domain tests; mock success is not live-provider evidence |
| Shared types and schema | `lib/contracts.ts`, `db/schema.ts`, `drizzle/` | migration from existing schema plus fresh-schema setup |

## Run only relevant checks

Use the package scripts in `package.json` with the available Node runtime. Use the test file names actually present in `tests/`; the table can become stale.

The collaboration and requirements Python API harnesses need a separately running isolated Worker, migrated local D1 and **no model/payment credentials**. Their URL variables are `BRIEFPAY_COLLAB_TEST_URL`, `BRIEFPAY_REQUIREMENTS_TEST_URL` and `BRIEFPAY_ROLE_DEMO_TEST_URL`. They simulate trusted platform identity only for local application checks. An outer Wrangler development proxy can fail while the underlying Worker is healthy; inspect its actual local entry rather than changing application authentication or blindly replaying a mutation.

## Use external skills in this stack

`frontend-design` helps with user actions, readable copy and intentional layout. Existing product choices take precedence over its generic aesthetic suggestions. Do not rebuild the visual identity for a scoped edit.

`security-best-practices` is available for explicitly requested security work or relevant secure coding. General React/TypeScript advice can apply; Node/Next-specific recipes do not automatically apply to Vinext and Cloudflare Workers. A routine feature change does not require a full security report.

Do not add a second deployment or browser-control path from a generic skill. Sites handles publication; CUA handles Codex browser interaction.
