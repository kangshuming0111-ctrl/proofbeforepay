# ProofBeforePay — local judge handoff

Generating this source export does not by itself publish a repository or submit a Devpost entry. It does not grant live judge access or establish measured AI results. The hosted Site may remain owner-private. Do not assume its URL works for another account. See the [dated evaluation](docs/EVALUATION-2026-11-02.md) for separately recorded results and limits.

## What to try

ProofBeforePay helps a buyer and a website developer agree on static website requirements, review saved delivery evidence, request revisions, accept an exact version and separately confirm test payment. A contract is optional. Uploads preserve bounded relative directories with root-level index.html and up to 40 HTML/CSS/PNG/JPEG/WebP files. Text is limited to 64 KiB per file and 256 KiB total; raster images to 256 KiB each and 1 MiB total. Scripts, form submissions, external subresources and backend behavior are not executed in the isolated preview. ZIPs must be unpacked before choosing their website folder.

Source resource checks show missing local targets, out-of-scope references and uninspectable syntax for the exact saved delivery. A source finding labelled blocked does not establish that the browser attempted and blocked a navigation; links may leave the saved preview, so return to a saved entry before judging it.

Compare each requirement displays the unchanged agreed clause, version-matched old buyer feedback, and separate old/current rule excerpts, AI source citations and browser observations. Missing or stale records are unavailable rather than borrowed from another version. A newer version or smaller issue count does not prove a fix. Source AI reads bounded HTML/CSS text, not image pixels. Either participant may append a reasoned human review of an AI risk; the original model report remains unchanged. These annotations do not accept work or initiate payment.

## Clean local setup

On macOS or a POSIX environment, with Node.js 22.13+ and npm installed (Node.js 24 recommended), run one command from this checkout:

`node scripts/judge-demo.mjs`

The command reuses installed dependencies or installs the pinned lockfile with pnpm 11.25.0, builds in a new sanitized copy, migrates a fresh isolated D1 database, and prints a verified loopback entry URL. The first dependency installation needs public npm registry access. No API keys, PayPal account or real ChatGPT login are needed. Open the printed /signin-with-chatgpt?return_to=/ URL: it activates the existing fixed local test account and enters the demo. This is not production authentication or two real logins.

Each invocation starts a fresh session; existing checkout data and previous session files remain untouched. Caller provider settings and local environment files are not copied. Press Ctrl+C to stop only this demo's owned process groups. The helper was exercised on macOS; Linux uses the same path but is not independently validated here. Native Windows users should use WSL2 or the README's manual setup. See docs/JUDGE-DEMO-2026-11-02.md for startup checks, isolation, logs, recovery and the optional noninteractive --smoke check. If pnpm is already installed, `pnpm judge:demo` runs the same workflow.

Start with the built-in two-sided demonstration and keep payment in simulated mode. Lock the scope as buyer, switch to seller, prepare the first delivery and inspect the missing Contact page and broken booking target. Submit a note, return it with buyer feedback, prepare the revised delivery, then inspect and explicitly accept the current version. A revision label alone does not mean every requirement passed.

## Optional providers

No secrets are included. The isolated judge command always disables external providers. Keep its temporary copy provider-free. To configure your own DeepSeek API and PayPal Sandbox REST app separately, stop that demo, return to the original public checkout, follow the README's manual local-development setup and copy this checkout's generated placeholder `.env.example` to the Git-ignored `.dev.vars`. Restart after configuring. AI assessment is an explicit action that sends requirements and bounded saved source to the configured model and may cost money. A rule review is not a model call. Never use production PayPal credentials or real money for this prototype.

The ordinary two-sided experience uses one owner and simulated payment. The explicit same-owner Sandbox rehearsal uses a virtual seller and the configured test merchant. Inviting a real seller uses a different authenticated app account, with separate website access, and defaults to simulated payment. A new custom project can explicitly choose Invite a real seller + Sandbox test payment; the server records the creation-only sandboxCollaboration marker. Existing cases are not silently upgraded. Only the buyer can authorize or capture test payment after exact-version acceptance; the configured Sandbox test merchant receives it, not the actual seller. This is not escrow or marketplace settlement. On 2 November 2026, a hosted run with two distinct authenticated logins completed revision, exact-version acceptance and genuine AUD 1 virtual Sandbox authorization/capture; both workspaces retained Test captured after refresh. One developer operated both logins through an automation agent. This is a bounded two-account workflow check, not independent user research or seller settlement, and is separate from the earlier one-owner receipt. Follow the current README and keep simulated and genuine provider evidence separate.

## Verification

Run `pnpm test` and `pnpm run typecheck`. Provider tests use controlled responses and do not prove a real payment occurred. `scripts/assessment-evaluation-cases.json` is a labelled synthetic reference corpus, not measured model results. Record real output, source coverage, errors, abstention, latency and cost before making an accuracy claim.

The dated first-use plan and blank three-person CSV in docs are prepared only: independent participants have not been tested. Do not fill those result slots with developer walkthroughs or AI review. The new English recording plan is also prepared, not recorded. The existing 135-second edited still-image walkthrough remains unchanged and is not continuous screen capture. Historical evaluations retain their original results; this source export does not establish a new deployment, refreshed public release, video upload or competition submission.

The generated manifest lists every exported source file and its SHA-256. Runtime data, Site identity, credentials, local state, Git metadata and existing output files are excluded. Review the package before any external publication.
