# ProofBeforePay: judge start

The buyer agrees to a small website, reviews what the seller actually delivered, requests a revision, accepts an exact saved version and separately approves a PayPal Sandbox payment. AI explains bounded source evidence; the buyer makes the decision.

## Choose an entry

| Entry | What it demonstrates | Access / limits |
| --- | --- | --- |
| [Main product](https://briefpay-kang-lab.blueheron8.chatgpt.site/) | Saved projects, revisions, rule/source/model evidence, human acceptance and configured Sandbox workflow | Existing invited accounts only. Do not infer judge access from owner access. Owner must arrange test access before judging. |
| Local source demo | Runnable complete workflow with a fresh local database | Free, no keys; AI and payments simulated. It cannot prove a live model or PayPal integration. |
| [Public verification lab](https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/) | Synthetic website handoff and controlled backend counterexamples | No account. No model or PayPal calls. Separate application and records. |
| [Dated AI evidence](https://briefpay-kang-lab.blueheron8.chatgpt.site/ai-evidence.html) | Original model statuses, published statuses, source findings and whole-answer caveats side by side | Hosted access uses the same invited accounts. In the local demo, open `/ai-evidence.html`. These are historical author-created cases. |

## Reproduce the main loop

1. Open the product and choose **Try a complete example**. Confirm the fictional agreement.
2. Switch to the example's seller role, save the flawed sample and submit it. This is one-account role play, not two independent people.
3. Return as buyer. Inspect the website and each failed rule, AI/source indication and human check. Request a specific revision.
4. Submit the corrected version as seller. As buyer, check the changed evidence and manually confirm what the source cannot establish.
5. Accept that version. Reopen its saved evidence. Later reports must not rewrite the acceptance.
6. In the separate payment step, inspect the displayed provider mode. A local simulated receipt is not a Sandbox receipt. For a real Sandbox demonstration use the configured hosted test flow and a PayPal sandbox buyer; never use real funds.

## Run locally

Install Node.js 22.13+ (24 recommended) and pnpm 11.25.0, then `pnpm install --frozen-lockfile`.

On macOS/Linux, `node scripts/judge-demo.mjs` creates an isolated session, installs/builds the app, migrates a fresh local D1 database and prints its development sign-in URL. The existing runner does not support Windows process-group cleanup. On Windows use these explicit local-only steps in a **fresh sanitized export**, never in a production checkout containing provider secrets:

```powershell
$env:DEEPSEEK_API_KEY=''
$env:PAYPAL_CLIENT_ID=''
$env:PAYPAL_CLIENT_SECRET=''
node scripts/run-framework.mjs build
Get-ChildItem drizzle -Filter *.sql | Sort-Object Name | ForEach-Object {
  node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file $_.FullName
  if ($LASTEXITCODE -ne 0) { throw 'Local migration failed' }
}
node scripts/run-framework.mjs dev --hostname 127.0.0.1
```

Open the printed local origin followed by `/signin-with-chatgpt?return_to=/`. This is a fixed development account, not a real ChatGPT login. Stop the foreground server with Ctrl+C. A missing model report stays visibly missing; there is no silent real-provider fallback.

## Scope and evidence

- Static HTML/CSS and local PNG/JPEG/WebP uploads. AI reads bounded source text, not image pixels. Preview does not run arbitrary scripts or backends.
- Optional backend adapters require an explicitly registered disposable target and buyer-confirmed protocol. A passing adapter does not certify an arbitrary seller's service or prove that the deployed backend came from uploaded files.
- Server checks bind acceptance and payment consent to an exact delivery. This is not escrow, arbitration or a security certification.
- [6 November original AI records](../public/benchmarks/noodle-core-2026-11-06/first-live.json): 4 fictional variants, 9 focused criteria, 4 model calls. Status agreement was 9/9 raw, 7/9 published and 8/9 effective source/published. Whole-answer review still qualified 2 of the 4 raw answers. These different metrics must not be collapsed into “100% accurate.”
- The known-case corrective replay made zero new model calls. Fresh cross-domain evaluation and independent first-use results remain outstanding.

## Check this source against the hosted app

Run `node scripts/release-fingerprint.mjs`. After signing in to the hosted app, compare `schema`, `sha256` and `files` with its `/api/release` JSON and the export's `SOURCE-MANIFEST.json.applicationSource`. Compare matching schemas. Version 2 covers selected application source, build configuration and public text assets, including the judge and AI evidence pages. It normalizes CRLF to LF and excludes credentials, Site identity, runtime records and `public/benchmarks/`. A match checks source parity within that scope. Restart local dev after edits before comparing. Production embeds the fingerprint at build time.

## Capture the submission video

Aim for 2:45, English narration or English subtitles. Show the actual running product: problem (0:00–0:15), agreed requirement and flawed version (0:15–0:50), evidence and revision (0:50–1:30), exact-version acceptance (1:30–1:55), separate Sandbox authorization/capture and matching IDs (1:55–2:30), limits and source access (2:30–2:45). Cuts are allowed, but label any change of project, version or earlier session. Do not splice a historical payment receipt into a different delivery flow. This is a recording plan; no new video is claimed.

Competition reference: [official requirements](https://paypalaihackathon.devpost.com/rules). Submission is separate from generating this source package; this work does not submit an entry or accept competition terms.
