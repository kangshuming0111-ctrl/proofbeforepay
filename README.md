# ProofBeforePay

Agree on the scope, let the seller submit evidence, and let the buyer accept the exact delivery independently of payment.

Built on BriefPay as a learning project for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). The website-first workflow combines requirements extraction with delivery checking: type website requirements directly or optionally add agreement text/TXT, edit and confirm the checklist as buyer, submit saved HTML/CSS as seller, then inspect the exact delivery before accepting it independently of payment. Custom projects default to an explicitly labelled one-account, two-sided demonstration using your own requirements and files. Only newly created built-in demonstrations carry the server-recorded `demoSampleProject` flag that permits fixed sample files. Custom and older unmarked role-play projects keep uploads and existing history but cannot save new fixed samples. Separate authenticated buyer/seller collaboration and the earlier single-user PayPal Sandbox tool remain selectable. It supports Chinese and English. Existing BriefPay quotes remain stored and keep their original checkout workflow; they are not silently converted into proof agreements.

## One project from delivery to test payment

New projects can explicitly select **Both roles + PayPal Sandbox test payment**. This creates a server-marked, authenticated-owner rehearsal with a virtual seller and the configured Sandbox test merchant. It supports either your own requirements/files or the built-in fictional floral studio. It does not onboard a real seller, provide escrow or settle money to a seller. The original simulated demonstration remains provider-free and is never upgraded by a later request. Real two-account collaboration still uses simulated payment.

In this rehearsal, lock the scope, deliver as seller, inspect rule evidence and optionally request a separate AI assessment, request changes as buyer, submit a revision, and explicitly accept the exact current delivery. Only then can the buyer start PayPal Sandbox approval and authorization. Returning from PayPal does not authorize or capture automatically. Saved human acceptance checks for that exact version survive the return; financial consent must be given separately before capture. A captured/voided/pending payment freezes the appropriate workflow and retains the existing retry/reconciliation protections.

Creation uses `paymentTesting: "sandbox"` with `demoRoleplay: true` and no real collaborative seller. The server requires authentication and configured Sandbox credentials and stores `proof.sandboxRehearsal: true`; missing configuration returns 409 rather than silently downgrading. Perspective headers only select the existing authenticated owner's rehearsal perspective and never grant real membership. Seller responses still omit buyer payment approval links and provider IDs.

PayPal Sandbox checkout uses a separate **Personal Sandbox test buyer**, not the ordinary PayPal account used to enter the Developer Dashboard. Before the authorization button, a compact bilingual guide links to **Testing Tools → Sandbox Accounts → Personal → View/Edit account → Login Info**. Resetting an ordinary PayPal password does not change that test password. Test credentials belong only on PayPal's pages; the application has no credential input or storage. The guide appears for Sandbox checkout in either owner rehearsal or the single-user tool, and does not appear in simulated payment or after returning for authorization.

The current-delivery result card shows rule mismatches, optional AI suggestions and pending human checks separately. Missing AI analysis is labelled not run. Historical comparisons use only loaded reports bound to each exact version; a v2 label does not prove a fix. A suggested change fills an editable current-version draft, never submits feedback or accepts work automatically. Generic manual requirement labels display their agreed text without changing stored IDs or provenance.

The new built-in sample is a fictional floral studio with prices, contact details and local CSS artwork. Its first version omits Contact and shows 10am–6pm against the agreed 11am–8pm; its revision adds the missing page/target and corrects the hours. Rule checks establish structure/link evidence, while literal-content AI assessment remains explicit and mobile acceptance stays human. Existing saved deliveries keep their original files.

## Optional contracts and per-criterion AI assessment

A contract is optional. The default intake lets the buyer type website requirements, enter the price and confirm a manual checklist without adding any document or calling AI. An explicit “Organize these requirements” button can suggest a checklist from that description. The collapsed optional agreement section accepts pasted text or UTF-8 TXT; PDF, Word and OCR are not implemented. A direct-description edit invalidates its adopted AI draft; document-derived sources remain separate from the project description.

After seller files are saved and the current version has a complete rule review, either participant can explicitly request an independent DeepSeek source assessment. It compares the locked criteria with saved HTML/CSS, with no original contract required. The request sends the agreed criteria, current file prefixes and rule findings, excluding the original contract, customer identity, amount and older versions. No key means a visible unconfigured error, never a fake AI result. Role-play rule review and payment remain demo, while this separately disclosed action can use the configured live model without changing those modes.

Each criterion gets `supported`, `changes_suggested` or `insufficient_evidence`, a bounded explanation and exact source citations. The server derives UTF-16 citation offsets only from text actually included in the model request. It checks complete unique criterion coverage and rejects invented citations or extra fields. Server rule failures take priority; browser/backend behavior, mobile usability, subjective appearance and unclassified manual criteria stay insufficient. Literal content checks such as opening hours and menu text may receive source-based suggestions, subject to these exclusions. This report never changes rule evidence, human checks, acceptance or financial state.

The assessment may also list up to five cited **potential** source problems. It does not run scripts, a browser or a backend, and does not establish that a site is secure or bug-free. Input is bounded to 6,000 UTF-16 characters per file and 24,000 total; included, truncated and omitted files remain visible. Only an explicit request calls the model, at most once per saved report; opening the saved report is free of new calls. Concurrent first requests may each reach the provider before the database CAS allows only one saved result. There is no automatic retry. The request uses a 1,800-token completion limit with thinking disabled.

Reports are stored in `delivery.assessment`, private to project participants, and omitted from project-list summaries. Replacements discard any report on the new delivery; immutable history preserves the old report with its original delivery. UI and endpoint checks bind assessment to the current delivery ID and explicit send confirmation. Existing buyer acceptance remains independent and can be completed without running optional AI assessment.

## From requirements to a confirmed website checklist

In **My project**, paste the original contract or requirements, or upload one UTF-8 `.txt` file. Inputs support up to 12,000 UTF-16 characters and 48 KiB of UTF-8 text. This version does not parse PDF, Word documents, scanned images or OCR. Adding a contract or using extraction is optional. It prioritizes static HTML/CSS website delivery rather than a general marketplace or an automatic legal review.

Without `DEEPSEEK_API_KEY`, the interface labels the result **rule-based extraction — no AI request**. Rules suggest only explicit root-level HTML filenames and a fully stated local-link source, quoted label and `page.html#id` target. They do not invent filenames from words such as “home page” or invent a booking anchor. Other requirements remain human checks or unresolved clauses. With a configured model key, extraction sends the original text to DeepSeek and validates the JSON response, supported fields and exact source quotations. A provider error or invalid output is shown as a failure, never disguised as a successful AI result or silently replaced with a rule result.

The buyer applies the suggestions to an editable checklist, checks the complete original and unresolved items, adds or changes checks, and explicitly confirms that final list before creating the project. The project amount and currency are entered and confirmed separately; extraction cannot approve a price, accept delivery or initiate payment. Scope approval then locks the final project criteria and amount.

Every retained extraction citation has an exact `start`, `end` and `excerpt` matching the original text, with JavaScript UTF-16 offsets. Only final page, link and manual-check fields that still exactly match a saved suggestion inherit its source reference. A buyer's edited or newly added field does not inherit a misleading extracted citation. System-suggested technical and mobile checks are distinguished from original agreement wording. Both the full original and unresolved clauses stay available for inspection alongside the final checklist.

`POST /api/requirements` requires platform-authenticated identity and stores a server-generated draft in D1, private to its creator. A draft can be used for seven days; retrieval checks its owner and database timestamp. Expiry prevents using the draft to create another project; it is not a claim that the stored row has been automatically deleted. When the buyer confirms and creates a project, its own copy of the original and confirmed references is saved with that project and follows project-participant access. Project lists omit the original contract text. Extraction alone creates no payment project or order.

## Switching buyer and seller workspaces

Use **Buyer / Seller** beside the language control. Buyers define scope, inspect seller evidence, request changes, accept and confirm payments. Sellers upload delivery files, run checks, write delivery notes and submit revisions. Buyer screens never ask buyers to upload a seller's delivery.

The **Workflow** selector offers three choices. The default **Two-sided demo** uses one authenticated account for both perspectives of a custom project with your own requirements and uploaded files. The separately selected **Sandbox role rehearsal** uses those virtual perspectives with the configured Sandbox test merchant, after exact-version acceptance. **Real collaboration** invites a different account as seller. **Single-user tool** preserves the existing Sandbox test path. The server marks one-account demonstrations with `demoRoleplay`; ordinary demos force provider-free rule review and simulated payment, while explicit Sandbox rehearsals additionally require `sandboxRehearsal` and keep rule review provider-free; choosing a perspective never creates a real seller account. Requirement extraction has its own recorded rules/live mode and may use the configured model before project creation.

Choose **Try the two-sided demo** or the separate **Built-in demo** to start the fixed three-page sample instead. Lock scope as buyer; switch to seller, prepare the flawed sample (or upload HTML/CSS), check it and submit a note; switch back to buyer to request changes; submit the fixed version as seller and inspect/accept it as buyer. These fixed sample delivery and payment actions make no provider request or transfer. Both custom and fixed demonstrations retain immutable version history. Perspective switching refreshes the selected view and clears temporary acceptance/payment confirmations; it never automatically accepts, authorizes or pays.

For real collaborative projects, switching opens that side's workspace and filters cases by the signed-in account's existing membership. It does not turn a buyer into the seller on the same project or change website access. Existing single-account tools remain available as labelled older cases; their file inputs appear only in the seller perspective, while their server ownership and Sandbox behavior stay intact.

## Buyer and seller access

The creator of a collaborative project is its buyer. After approving and locking the scope, the buyer can generate a seven-day invitation bound to the seller's authenticated sign-in email. The seller must be a different account, inspect the agreement, confirm its scope and join explicitly. The server stores the invitation's SHA-256 hash rather than its bearer token; accepting, revoking or replacing the invitation invalidates the old link. Membership and action permissions are checked on the server using platform-provided identity, not a role selector or a client-supplied user ID.

The buyer shares the invitation link manually. The application does not send email or grant website access. Invitations carry the token in the URL fragment and send it in POST bodies for inspection and acceptance; successful joining clears the fragment before opening the project. If sign-in loses the fragment, reopen the original invitation after signing in. An owner-private Site still requires the owner to grant the seller website access separately. Joining a project does not change the Site's audience or access policy.

## Use your own static website

Create a custom project with a title, delivery summary, client name, currency and amount (0.01–10000.00 in test funds). Use extraction to prepare the editable checklist, or enter it manually: up to 10 required HTML pages, optionally one local link's source/text/`page.html#id` target, and up to five human acceptance requirements. Including the always-required mobile check, that produces at most 17 criteria. Approving the scope locks that agreement and its amount. In the default custom two-sided demo, switch to Seller to upload your own files; this mode cannot borrow the fixed built-in sample's deliverables.

The seller uploads flat HTML/CSS files: at most 20 files, 64 KiB per file and 256 KiB total, measured as UTF-8 bytes. Include `index.html`. The server validates filenames, text and limits, creates the delivery ID and findings, and stores an independent exact snapshot. Other missing required pages are saved with failed findings, so the seller can see the problem and submit a replacement. Each replacement is a complete file set; it does not merge with the previous version. Replacing a delivery archives its predecessor and clears the current review and acceptance. In the optional single-user mode, the creator performs the upload instead.

Custom files can be uploaded, previewed and reviewed **before payment authorization**, after locking the scope and, for collaboration, joining as seller. The application does not accept URLs, ZIP files, nested folders, images or JavaScript applications, and it does not deploy the uploaded website. In the protected preview, scripts, forms and external subresources are disabled. A link can navigate the preview away from the saved files; select an entry page to return. Confirm acceptance only against the saved delivery.

The conservative HTML checker looks for independent documents with a doctype, nonempty title and body, and a unique source link/target when one was agreed. Ambiguous markup fails the check; optional closing tags and unsupported entities can fail even when a browser would repair or display them. A source-document finding does not prove that the page's content, design or behavior meets the brief. Mobile usability and every free-text requirement always need direct human confirmation.

The optional layout check observes saved pages in the current browser at 375 px and 900 px and stores a report bound to the delivery ID. These are client-reported browser observations, not independent server measurements. Missing or unavailable readings do not count as clean results. Neither a clean width report nor an AI explanation automatically passes mobile usability or replaces the buyer's manual checks.

## Optional built-in demonstration

The second creation mode retains the original fixed agreement and its two controlled deliveries:

- Deliver three separate pages: Home, Services and Contact.
- All delivered pages must be usable on a mobile screen.
- Include a “Book a call” link that opens a booking section within the delivered website.

The first delivery contains only Home and Services; its booking link points at the absent Contact page. The revised delivery adds Contact and the referenced booking section. Both are actual HTML/CSS artifacts supplied by `lib/proof-evidence.ts`; their source excerpts, filenames and findings are available for inspection. Every delivery stores an exact file snapshot with its ID. Protected previews serve those saved files, so changing a future fixture does not change the evidence or preview associated with an accepted receipt. The booking check establishes that a local target exists, not that a real scheduling or email service is connected.

The checker reads the supplied files rather than assigning an outcome from the delivery's label. It does **not** run a browser or prove mobile usability. A viewport tag and a media query are evidence of responsive intent only, so mobile remains `needs_human` in both versions. A person must inspect every page at mobile width before confirming it. There is no percentage score, invented fraud classification or automatic acceptance.

## Current integration status

The application runs without model or payment credentials. In that configuration it **uses rule-based requirements extraction and deterministic evidence explanations, not an AI model**, and **simulates authorization, capture and cancellation locally, without contacting PayPal**. Modes are labelled in the UI and recorded on the agreement. Real collaborative projects require platform-authenticated accounts and the invited seller's matching email; running without provider credentials does not remove those identity checks. Custom role-play projects simulate both participants within the creator's account and do not establish real seller membership.

The real integration paths include explicitly requested DeepSeek requirements extraction and per-criterion source assessment and, for the preserved single-user workflow, a distinct PayPal Sandbox Orders v2 `AUTHORIZE` flow followed by Payments v2 capture or void. Reproducing these integrations requires configured credentials and separate end-to-end validation. Rule-review routes always produce immediate provider-free summaries; the optional AI assessment is a separate disclosed action. Neither provides autonomous final acceptance. Real two-account collaborative cases force `paymentMode: "demo"` even when PayPal credentials are configured. Only a newly and explicitly selected owner-only Sandbox rehearsal may use virtual roles with the configured test merchant; no seller settlement is integrated. All role-play cases force demo rule-review explanation; the separately requested source assessment may use the configured live model. No payout or seller settlement is connected. Provider tests use controlled HTTP responses; passing them does not prove that a live model or Sandbox transaction occurred. Never describe the demonstration mode as a real AI or PayPal integration.

Only Sandbox endpoints are supported. The application cannot accept real payments. An authorization reserves funds on the buyer's payment method; it is **not** a completed charge, a savings transfer or money held by this application. A new capture requires financial consent within 24 hours of authorization, limited further by any earlier provider expiration; the independent collaborative delivery acceptance may happen before authorization. If financial consent was already recorded in time and the payment operation is pending, that same frozen operation may be retried after the acceptance window to complete or reconcile it; PayPal's actual authorization validity still applies. The window is not a promise that pending money movement is automatically cancelled. This application does not provide escrow or guarantee dispute prevention.

## Run locally

Use Node.js 24 and pnpm 11.25.0 (the lockfile pins dependencies).

```sh
pnpm install --frozen-lockfile
pnpm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_flashy_master_chief.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_low_chimera.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_flawless_lake.sql
pnpm run dev
```

Open the Local URL printed by the server (normally http://localhost:5173). The database persists under ignored `.wrangler/state/`. Local and hosted records are separate. For a **fresh database**, run `0000_flashy_master_chief.sql`, `0001_low_chimera.sql`, then `0002_flawless_lake.sql`, in that order. For an **existing database**, apply only migrations that have not already been applied: a database with `0000` and `0001` installed needs only the pending `0002`. Migration `0001` adds seller/invitation columns and the immutable version table; `0002` creates owner-scoped `requirement_drafts`. Do not replay migrations on an already migrated database or reset an existing database to upgrade it.

The standard Sites Vite preview supplies one fixed development identity. Separate browser profiles do not turn it into two authenticated accounts. Production platform identity, application project membership and the Site's access policy are separate boundaries; the isolated API test below simulates the first boundary to exercise the application's permissions.

For real integrations, copy `.env.example` to the ignored `.dev.vars` file and configure `DEEPSEEK_API_KEY`, optional `DEEPSEEK_MODEL`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`. The PayPal values must come from a **Sandbox REST app**. Use a separate Sandbox personal buyer account to approve payments. Restart the server after changing local credentials. Hosted secrets are configured through Sites runtime environment variables; they never belong in source or the browser.

Default model: `deepseek-flash`, following the current official DeepSeek JSON-mode guide. Model availability can change; `DEEPSEEK_MODEL` is configurable. There is no automatic fallback that disguises an upstream service failure as a successful AI response.

## How ProofBeforePay works

1. The buyer optionally extracts a draft from pasted requirements or UTF-8 TXT, reviews exact source quotations and unresolved clauses, edits and explicitly confirms the checklist, and enters the amount separately. Choose real collaboration to invite a different seller account; the default custom two-sided demo instead lets the creator experience both perspectives without another account. Approve the exact scope and amount. For real collaboration, generate and manually share an email-bound seller invitation and arrange website access separately.
2. The invited seller inspects and confirms the agreement, joins using the matching authenticated account, then uploads the complete HTML/CSS delivery. Buyer and seller may inspect the current files and run source/layout checks. Custom projects cannot borrow the built-in demonstration's files or findings.
3. The seller reviews the current version, writes a delivery note and submits that version for buyer acceptance. The note is a seller statement, separate from system findings. After submission the seller cannot replace the files unless the buyer returns the delivery for changes.
4. The buyer previews the saved pages, checks each agreed criterion and can return specific comments against those criteria. DeepSeek may explain the supplied evidence when configured; otherwise explanations use a labelled template. Neither the model nor the seller's note decides whether a criterion is met or whether money moves.
5. The seller addresses the feedback and submits a complete revised file set. Replacement archives the old files, review, submission note and version-bound feedback atomically with the current-version update. Both participants can read immutable earlier versions; opening history does not replace the active delivery. Each revised delivery needs a fresh review and submission.
6. The buyer completes every required human check and explicitly accepts the **current submitted delivery ID**. This records `collaboration.acceptance` only: it does not create a payment order, authorize funds, capture a payment or reuse that acceptance as financial consent.
7. If the buyer continues, separate demo authorization and capture actions simulate the payment lifecycle. Only the buyer can perform them. Capture still requires an active authorization, the accepted current version, required manual checks and explicit financial confirmation. The collaborative flow never contacts PayPal or transfers money to the seller.

The optional single-user custom mode retains creator upload/review before Sandbox authorization. Custom `mode: "custom", demoRoleplay: true` cases use the buyer-confirmed custom scope and actual uploaded files, with provider-free delivery review and simulated payment. Built-in `mode: "demo", demoRoleplay: true` cases retain their separate fixed sample setup and controlled files. Existing older built-in cases retain their authorization-first flow, and existing BriefPay quotes keep their original checkout path. These modes do not gain a real seller account or an invitation automatically.

The following Sandbox behavior applies to the preserved single-user payment paths, not collaborative demo settlement. Before contacting PayPal, the server records financial consent and freezes the exact delivery while capture is pending. Verify the saved order, authorization, capture status, currency and exact amount before recording a paid receipt. Capture/void retries use stable request identifiers and provider-state checks to reconcile uncertain outcomes.

When a Sandbox capture or void is pending, **Check PayPal status** performs a read-only reconciliation of the saved order, authorization and capture resources. A matching completed capture can produce a receipt only when the previously frozen acceptance matches the current delivery. A verified void closes the authorization; a verified denied authorization with no capture closes the agreement as **closed, unpaid**. These outcomes are saved with the same optimistic concurrency check as other updates.

Pending payments, active authorizations, rejected/failed captures, unavailable responses and inconsistent resource histories keep the original operation and accepted delivery frozen. A failed capture alone does not prove that the authorization is closed. This prototype does not automatically clear those locks or start a replacement charge; review the Sandbox transaction records or obtain provider support if repeated queries remain unresolved. The local 24-hour acceptance window is never used as evidence that PayPal's authorization expired. The status lookup itself does not initiate capture or void.

If the buyer declines an uncaptured delivery, explicit cancellation **voids the authorization**. Void is different from refund: refund applies after a payment has been captured. A pending capture must be reconciled before a cancellation can proceed. Closing a browser tab or abandoning the page is not a confirmed cancellation.

Buyer and seller permissions come from their saved membership, and the server enforces each workflow stage. The buyer cannot upload a collaborative delivery; the seller cannot accept it or perform payment operations. Every delivery upload or sample replacement must include `expectedDeliveryId` (`null` for the first delivery, otherwise the exact version shown to the uploader). A missing or stale baseline returns 409 without replacing files; the interface preserves the file selection and refreshes the case for review. Replacement retires the old `/deliveries/...` current-preview URL, while immutable files remain accessible through the authorized version API and `/proof-versions/...` history preview. Proof-case and version list endpoints omit full file contents. Completed or pending payment cases cannot replace delivery files. The prototype does not provide seller settlement, automatic visual/usability acceptance, refunds after capture or a production dispute service.

## Existing BriefPay quotes

Legacy records retain the original brief → editable quote → approve → Sandbox `CAPTURE` checkout → receipt workflow. DeepSeek estimates scope and hours for those quotes; the server validates the result and computes integer-cent totals. Their payment approval does not itself prove a completed capture. The legacy routes reject proof agreements, so they cannot skip the new delivery-acceptance checks.

Legacy records remain scoped to their signed-in owner. Collaborative proof cases use the creator's buyer membership and the separately joined seller membership, stored in server-only columns alongside the current quote; archived deliveries live in `proof_versions`. Hosted access remains private by default. Local and hosted data are separate; updates to the interface do not migrate records between environments.

## Source map

| File | Purpose |
| --- | --- |
| `app/page.tsx`, `app/globals.css` and `app/collaboration.css` | Buyer/seller workspace, role-aware actions and responsive UI |
| `app/components/CollaborationPanel.tsx` and `VersionViewer.tsx` | Invitation, submission, feedback, acceptance entry and read-only current/history views |
| `app/components/RequirementsIntake.tsx`, `RequirementsSource.tsx` and `app/requirements.css` | Pasted/TXT intake, editable extraction preview and exact original-source display |
| `app/join/page.tsx` | Fragment-token invitation inspection and explicit seller joining |
| `lib/contracts.ts` | Shared legacy and proof-agreement types |
| `lib/domain.ts` | Input validation and integer-cent arithmetic |
| `lib/proof-evidence.ts` | Fixed contract, controlled HTML/CSS fixtures and deterministic source checks |
| `lib/static-project.ts` | Custom scope, exact amount validation, bounded uploaded snapshots and conservative source checks |
| `lib/requirement-extraction.ts` | Conservative rules/live requirements extraction, strict source grounding and confirmation-to-criterion mapping |
| `lib/requirement-store.ts` | Creator-private, seven-day D1 requirement drafts |
| `lib/proof-domain.ts` | Authorization and exact-delivery acceptance checks |
| `lib/proof-demo.ts` | Explicit provider-free sample setup and owner-scoped demo-role resolution |
| `lib/proof-workflow.ts` | Server role/stage guards, independent delivery acceptance, feedback and version snapshots |
| `lib/proof-store.ts` | Buyer/seller membership, hashed invitations, claim expiry, D1 CAS and atomic immutable version archiving |
| `lib/layout-probe.ts` and `lib/layout-report.ts` | Version-bound client browser observations and bounded report validation; no automatic human acceptance |
| `lib/providers.ts` | DeepSeek summaries and Sandbox-only PayPal integration |
| `app/api/proofs/` and `app/api/proof-invitations/` | Role-scoped cases, invitations, submission/return/acceptance, versions and payment actions |
| `app/api/requirements/` | Authenticated requirements extraction and server-generated private draft creation |
| `app/proof-versions/` and `app/deliveries/` | Authorized immutable-history and current-file previews |
| `app/api/quotes/` | Preserved legacy mutations and membership-aware proof-case reads |
| `lib/server.ts` and `db/schema.ts` | Request guards, legacy ownership and quote/membership/version schema |
| `drizzle/0000_flashy_master_chief.sql`, `0001_low_chimera.sql` and `0002_flawless_lake.sql` | Initial quotes schema, collaboration/version storage, then private requirement drafts |
| `tests/` | Pricing, evidence, role/stage, human-check, concurrency and provider boundaries |

## Codex and DeepSeek collaboration

Project guidance lives in [AGENTS.md](AGENTS.md) and the shared [ProofBeforePay delivery skill](.agents/skills/proofbeforepay-delivery/SKILL.md). It keeps changes focused on an observable buyer/seller result, exact source references, version-bound evidence and independent review of model feedback. The installed `frontend-design` and `security-best-practices` skills retain their official source, pinned commits, hashes and licenses in `.agents/skills/sources.json` and their respective directories. Generic UI/security guidance must fit this project's Vinext/Workers runtime, CUA browser testing and Sites publication workflow.

Use [the bounded DeepSeek reviewer](scripts/README-deepseek-review.md) to send explicitly chosen source files and a review goal to the local Harness. Its dry-run validates the packet without a model request. A real run records structured findings, file hashes and native skill-load evidence. Reviewer completion is advisory: independently accept, reject or verify each finding before implementing it. Harness account access is not an application API key, and reviewing code does not verify the website's live AI or payment integrations.

## Validation

```sh
pnpm test
pnpm run typecheck
pnpm run build
```

Evidence tests remove files, change page titles, break link fragments and add targets to verify that findings depend on actual artifact content. They also preserve uncertainty about mobile rendering. Provider tests use controlled fake HTTP responses; they do not claim a live transaction occurred. API and browser checks should separately cover first/revised delivery, stale-version rejection, required human checks, capture/cancellation conflicts, record persistence and attempts to bypass proof checks through legacy endpoints.

With a local preview running, `python3 tests/custom-project-api-smoke.py` checks custom inputs, missing/repaired uploads, complete replacement, saved artifact responses, history summaries and rejection of capture without authorization. It never creates a PayPal order or payment. The older `tests/proof-api-smoke.py` exercises simulated payment paths and requires a separate local configuration without provider credentials.

For collaboration, run the following **against an already running isolated local Worker with migrated local D1 and no model/payment credentials**. Set the URL to that Worker instance's actual loopback origin; the script defaults to port 8789 but does not start a server:

```sh
BRIEFPAY_COLLAB_TEST_URL=http://127.0.0.1:8789 python3 tests/collaboration-api-smoke.py
```

This harness injects simulated platform identity headers for buyer, seller, outsider and anonymous application requests. It does not add a test identity override to deployable routes or change the Sites Vite gateway. It checks invitations, role isolation, current-version acceptance, return/revision, immutable history, concurrent claims/replacements, maximum Chinese feedback and buyer-only demo payments. It requires both provider modes to be `demo`, disables redirects and environment HTTP proxies, and does not print invitation tokens. These are application/D1 integration tests, **not production dual-login browser E2E or proof of the Site's access policy**. A truly expired invitation and a persisted pending payment operation require separate clock/storage fixtures or workflow tests; the script does not claim those states were exercised by its public demo API calls.

For requirements extraction and confirmation, use the same isolated, migrated Worker with empty provider configuration:

```sh
BRIEFPAY_REQUIREMENTS_TEST_URL=http://127.0.0.1:8789 python3 tests/requirements-api-smoke.py
```

This checks platform-authenticated extraction, input limits, server-owned draft/provenance fields, owner isolation, explicit confirmation, custom-project-only attachment, exact source references, editing without false inherited citations and separate amount validation. It also checks that original text is omitted from history summaries. The harness simulates application identity headers and creates synthetic local records; it does not prove production login, a live DeepSeek request or Sandbox money movement. Draft expiry uses the database timestamp and requires a separate expired-row fixture to verify at the application layer. Unit tests exercise provider failures, invalid or ungrounded JSON and conservative no-key behavior using controlled responses.

For optional-contract entry and the independent source-assessment route, use the same provider-free Worker:

```sh
BRIEFPAY_ASSESSMENT_TEST_URL=http://127.0.0.1:8789 python3 tests/assessment-api-smoke.py
```

It checks manual creation without a contract, participant roles, current-version binding, explicit sending consent, rule-review prerequisites, no-key errors with no state mutation, replacement and accepted-stage restrictions. Its optional `--emit-cache-fixture` / `--verify-cache-fixture` pair tests report caching and immutable history after a separately applied local D1 SQL fixture. That report is labelled `synthetic-no-provider-call`; the fixture never proves a successful model call and must never be applied to production. Provider unit tests separately check exact UTF-16 citations, source caps, fail precedence, conservative manual/runtime classification and malformed model output.

## Guided delivery flow

The website upload button saves files and runs provider-free rule checks in one atomic server update (`reviewRules: true`). No AI request, seller submission, buyer acceptance or payment is automatic. Omitted/false keeps the older upload-only API behavior. An optional `deliveryId` on `/review` rejects stale-version requests, including cached ones.

The workspace offers one next-step action for the current stage. Human-check navigation skips already checked requirements and shows progress. A buyer can copy an AI change suggestion into an editable, current-version feedback draft; an existing comment is preserved, and insufficient evidence requests more evidence rather than asserting a defect. The buyer must still click Request changes to send it. Same-account role-play switches preserve selected upload files and unsent notes/feedback in page memory; consent is cleared, replacement versions clear drafts, and page reloads do not persist these drafts. Reports and feedback use the main column scroll area instead of nested vertical scroll boxes. On wide desktop views the payment column also owns scrolling for collaboration and the separate acceptance form.

`python3 tests/smooth-flow-api-smoke.py --url http://127.0.0.1:8789` checks the combined save/review path, malformed flags, stale reviews, old-version archives, old API compatibility and real collaboration role guards against an isolated provider-free local Worker. These are application/D1 checks with simulated local identity, not live-provider or production dual-login tests.

## Evaluation cases and a reviewable judge package

`scripts/assessment-evaluation-cases.json` contains 19 labelled synthetic reference cases covering literal requirements, semantic equivalence, conflicting content, prompt injection, runtime abstention and limited source coverage. It is a corpus, not measured accuracy; no real-model benchmark or cost claim is implied. Source-truncated cases are a separate evaluation stratum and cannot establish that omitted content is absent from a website.

Run `node --test tests/judge-pack.test.mjs` in addition to the TypeScript unit tests. `python3 tests/rehearsal-api-smoke.py --url http://127.0.0.1:8789` checks the new rehearsal opt-in/configuration/role boundaries against an already-running isolated provider-free local Worker. The positive authorization/capture/void protocol is covered with controlled provider responses in `tests/proof-rehearsal.test.ts`, not live payment evidence.

Generate a sanitized source export with `node scripts/build-judge-pack.mjs --output /absolute/new-directory`. It uses an explicit source allowlist, excludes runtime credentials/data and Git metadata, strips the hosted Site ID, and includes the MIT license, English setup instructions, a three-minute demo outline and SHA-256 manifest. Review the generated package before public publication. Creating this local archive does not publish GitHub, grant judge access or submit Devpost.

For the local Vite demo, open `/signin-with-chatgpt` once to activate the loopback-only fixed development account before creating collaborative demos. This is local test authentication, not a second real user or production sign-in.

## Competition handoff still required

- Produce a fresh, documented same-project AI/revision/acceptance/Sandbox walkthrough before claiming that complete integration was verified. Earlier saved AI and legacy Sandbox capture/void checks are separate dated evidence, not proof of every new path. Keep controlled samples and simulated results clearly labelled.
- Publish the source repository with this MIT license and complete setup instructions. The current Sites source repository is not automatically a public competition submission.
- Prepare an English project description explaining the AI and PayPal roles.
- Record a public YouTube demonstration shorter than three minutes.
- Supply free judge access and keep the build available throughout judging.
- Submit the project on Devpost before the official deadline; deploying a website is not a Devpost submission.

The competition deadline currently shown is 12 November 2026, 12:00 PST (13 November, 07:00 Melbourne AEDT). Recheck the official rules before submission.

## 给初学者的解释

把它理解成三层：网页让你确认约定、查看证据和做验收决定；后端核对交付版本、调用模型并处理付款；数据库记住每个决定与支付状态。

“我的项目”现在先做网页交付：买家粘贴合同／需求，或导入 UTF-8 TXT，系统整理验收清单。当前没有密钥时用规则，不调用 AI；配置后可由 DeepSeek 提供建议。暂不支持 PDF、Word、扫描件或 OCR。买家需要对照完整原文和未明确项，编辑、确认清单，并单独填写金额。每条真实提取来源都能回到原文；改写或新增的标准不会冒充原合同条款。未创建项目的草稿只属于创建者，七天内可使用；确认后的原文和标准随项目保存。

使用方式默认是“双端演示”：用自己的需求和文件，在同一账号下切换买家与卖家，交付核查和付款使用演示模式，不创建真实对方账号。想与别人协作时，在“使用方式”选“真实协作”：创建者是买家，锁定要求后生成绑定卖家登录邮箱的七天邀请。买家自行分享链接；系统不会发邮件，也不会自动授予网站访问权限。卖家用受邀账号确认约定、上传 HTML/CSS、核查并写说明后提交。买家可以按标准退回意见，卖家再上传整份修订文件；旧版文件、说明、核查和反馈保留为只读历史。

源码检查能确认所约定文件的保守 HTML 结构，以及约定本地链接的源码目标是否存在，不能证明页面内容、设计或手机体验符合要求。浏览器布局报告是客户端上报的观测，不是服务器独立验证；卖家说明也不等于系统证据。买家完成必须的人工检查后，才能单独接受当前交付；这一步不预授权、不付款，也不替代后续的付款同意。真实双账号协作使用本地模拟付款，不向卖家结算；新建时也可明确选择“Sandbox 双端演练”，在同一个项目里体验虚拟双方的交付与验收，再由买家分别批准测试商户预授权和扣款。“单人工具”的旧路径仍保留。固定三页网站的“内置演示”仍是单独入口，不会替代你自己的需求和文件。

看懂流程后，阅读 `lib/requirement-extraction.ts`（从原文到待确认清单）、`lib/requirement-store.ts`（私有草稿）、`lib/static-project.ts`（真实输入与证据）、`lib/proof-workflow.ts`（角色与交付阶段）、`lib/proof-store.ts`（成员、邀请与历史）、`lib/proof-domain.ts`（什么时候允许扣款）和 `lib/providers.ts`（外部接口）。这一版使用 TypeScript；HTTP、JSON、数据库和状态转换同样适用于后续学习 Python。

## References

- [Competition rules](https://paypalaihackathon.devpost.com/rules)
- [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/)
- [PayPal OAuth](https://developer.paypal.com/api/rest/authentication/)
- [PayPal create order](https://developer.paypal.com/api/orders/v2/orders-create)
- [PayPal capture order](https://developer.paypal.com/api/orders/v2/orders-capture)
- [PayPal authorize and delay capture](https://developer.paypal.com/checkout/delay-capture/)
- [PayPal payment idempotency](https://developer.paypal.com/api/rest/reference/idempotency/)
- [PayPal authorization details](https://developer.paypal.com/api/payments/v2/authorizations-get/)
- [PayPal void an authorized payment](https://developer.paypal.com/checkout/void-authorized-payment/)

MIT licensed. Included third-party starter tooling retains its original license notices.
