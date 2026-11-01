# ProofBeforePay — local judge handoff

This is a sanitized source export, not a public GitHub publication, a live judge-access grant, a measured AI benchmark or a Devpost submission. The hosted Site may remain owner-private. Do not assume its URL works for another account.

## What to try

ProofBeforePay helps a buyer and a website developer agree on static website requirements, review saved delivery evidence, request revisions, accept an exact version and separately confirm test payment. A contract is optional. Current uploads are flat HTML/CSS; scripts, external images, forms and backend behavior are not executed in the isolated preview.

## Clean local setup

Use Node.js 24 and pnpm 11.25.0. Install the pinned dependencies with `pnpm install --frozen-lockfile`, then run `pnpm run build`.

For a fresh local database, run these commands in order. Do not replay them against a database that has already applied them:

`node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_flashy_master_chief.sql`

`node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_low_chimera.sql`

`node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_flawless_lake.sql`

Run `pnpm run dev` and open the Local URL printed by the server, normally http://localhost:5173. Open /signin-with-chatgpt once to activate the fixed local test account before creating a collaborative demo. The development sign-in emulates one local account on loopback only; it is not production authentication and cannot test two real logins. Data is local and separate from the hosted Site.

Start with the built-in two-sided demonstration and keep payment in simulated mode. Lock the scope as buyer, switch to seller, prepare the first delivery and inspect the missing Contact page and broken booking target. Submit a note, return it with buyer feedback, prepare the revised delivery, then inspect and explicitly accept the current version. A revision label alone does not mean every requirement passed.

## Optional providers

No secrets are included. Copy the generated placeholder `.env.example` to the Git-ignored `.dev.vars` only if you choose to configure your own DeepSeek API and PayPal Sandbox REST app. Restart after configuring. AI assessment is an explicit action that sends requirements and bounded saved source to the configured model and may cost money. A rule review is not a model call. Never use production PayPal credentials or real money for this prototype.

If the application offers the explicit same-owner Sandbox rehearsal, it uses a simulated seller perspective and the configured Sandbox test merchant. It is not seller onboarding, escrow or marketplace settlement. A genuine Sandbox run requires separate buyer approval, authorization and explicit capture; do not splice its status into an unrelated simulated case. Follow the current UI and README for the mode available in this exported version.

## Verification

Run `pnpm test` and `pnpm run typecheck`. Provider tests use controlled responses and do not prove a real payment occurred. `scripts/assessment-evaluation-cases.json` is a labelled synthetic reference corpus, not measured model results. Record real output, source coverage, errors, abstention, latency and cost before making an accuracy claim.

The generated manifest lists every exported source file and its SHA-256. Runtime data, Site identity, credentials, local state, Git metadata and existing output files are excluded. Review the package before any external publication.
