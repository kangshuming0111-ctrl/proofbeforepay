import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Build a local reviewable export. This never reads runtime credentials, publishes
// a repository, changes Site access, starts a provider call or installs packages.
const ROOT_FILES = ["README.md", "LICENSE", "AGENTS.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "next.config.ts", "vite.config.ts", "postcss.config.mjs", "eslint.config.mjs", "drizzle.config.ts", "cloudflare-env.d.ts", "components.json", ".gitignore", ".agents/skills/proofbeforepay-delivery/SKILL.md", ".agents/skills/proofbeforepay-delivery/references/code-map.md"];
const SOURCE_DIRS = ["app", "lib", "db", "drizzle", "components", "hooks", "worker", "vendor", "public", "scripts", "tests", "docs", "examples/seller-staging", "examples/seller-capacity-staging", "examples/seller-lifecycle-staging", "examples/seller-workshop-python", "examples/seller-dom-staging", "examples/seller-time-policy-staging"];
const EXTENSIONS = new Set([".html", ".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".css", ".json", ".sql", ".md", ".yaml", ".yml", ".svg", ".py", ".sh", ".csv", ".LICENSE"]);
// Exact attribution files for the three licensed evaluator-template sources.
// Do not broaden this to arbitrary TXT documents or owner notes.
const LICENSE_TEXT_FILES = new Set(["bootstrap", "florist", "html5up"].map(name => `docs/fixtures/assessment-transfer-2026-11-04/${name}-LICENSE.txt`));
const DENIED_PART = /^(?:\.git|node_modules|dist|\.next|\.wrangler|\.sites-runtime|outputs|work|\.codex|__pycache__|\.env(?:\..*)?|\.dev\.vars(?:\..*)?|credentials?|cookies?|secrets?|private[-_]?keys?|auth[-_]?state|storage[-_]?state)$/iu;
const SECRET_LIKE = /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}|\bsk-[A-Za-z0-9_-]{24,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/u;

async function sourceFile(root, relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/u).some(part => part === ".." || DENIED_PART.test(part))) throw new Error(`Disallowed source path: ${relative}`);
  let current = root;
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symlink source rejected: ${relative}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`Non-file source rejected: ${relative}`);
  const bytes = await readFile(current);
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\0") || SECRET_LIKE.test(text)) throw new Error(`Source export needs manual review: ${relative}`);
  return bytes;
}

export async function collectPublicSource(root) {
  const names = [];
  for (const name of ROOT_FILES) {
    try { await lstat(path.join(root, name)); names.push(name); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  async function walk(relative) {
    const dir = path.join(root, relative);
    const info = await lstat(dir);
    if (info.isSymbolicLink()) throw new Error(`Symlink directory rejected: ${relative}`);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (DENIED_PART.test(entry.name) || entry.name.startsWith(".")) continue;
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`Symlink source rejected: ${name}`);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile() && (EXTENSIONS.has(path.extname(entry.name)) || LICENSE_TEXT_FILES.has(name))) names.push(name);
    }
  }
  for (const directory of SOURCE_DIRS) {
    try { await walk(directory); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const result = [];
  for (const relative of [...new Set(names)].sort()) result.push({ relative, bytes: await sourceFile(root, relative) });
  return result;
}

const GUIDE = `# ProofBeforePay — local judge handoff

Generating this source export does not by itself publish a repository or submit a Devpost entry. It does not grant access to the authenticated main workspace or establish measured AI results. That workspace retains its configured access audience. The separate public verification lab below is an account-free synthetic deployment, not a grant of access to private projects. See the [dated evaluation](docs/EVALUATION-2026-11-02.md) for separately recorded results and limits.

## What to try

ProofBeforePay helps a buyer and a website developer agree on static website requirements, review saved delivery evidence, request revisions, accept an exact version and separately confirm test payment. A contract is optional. Uploads preserve bounded relative directories with root-level index.html and up to 40 HTML/CSS/PNG/JPEG/WebP files. Text is limited to 64 KiB per file and 256 KiB total; raster images to 256 KiB each and 1 MiB total. Scripts, form submissions, external subresources and backend behavior are not executed in the isolated preview. ZIPs must be unpacked before choosing their website folder.

A separately confirmed booking protocol can perform eight real server HTTP checks against an operator-registered disposable synthetic target. This adapter is separate from the script-free preview. It tests structured invalid-input rejection, creation, independent readback, idempotent replay, conflicting data and an unchanged record, with declared revision and exact upload digest. It does not inspect arbitrary third-party backends, attest that a declared target was built from the upload, certify security or guarantee permanent durability. See docs/BOOKING-HTTP-VERIFICATION.md.

For an immediate account-free preview, open https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/ . The left-hand fictional handoff runs locally for one visitor with simulated buyer/seller roles. The separately labelled HTTP panel makes genuine network requests to the lab's own synthetic service after per-run consent. It has no main-workspace data, model credentials or real payments. The observed flawed run returned 201 for creation and404 for independent readback, with six mismatched steps; the corrected controlled run supported all eight. These two cases are not a general accuracy score. Its optional local task recorder exports unverified self-declared outcomes, not independent user research.

Source resource checks show missing local targets, out-of-scope references and uninspectable syntax for the exact saved delivery. A source finding labelled blocked does not establish that the browser attempted and blocked a navigation; links may leave the saved preview, so return to a saved entry before judging it.

Compare each requirement displays the unchanged agreed clause, version-matched old buyer feedback, and separate old/current rule excerpts, AI source citations and browser observations. Missing or stale records are unavailable rather than borrowed from another version. A newer version or smaller issue count does not prove a fix. Source AI reads bounded HTML/CSS text, not image pixels. Either participant may append a reasoned human review of an AI risk; the original model report remains unchanged. These annotations do not accept work or initiate payment.

A separate optional release-vs-transfer model experiment issues at most five synthetic writes and 24 requests against a registered staging backend. An independent finite-state oracle checks cancellation/transfer results, receipts, merchant records and three occupancies against both real-time-consistent serial orders. Seeds vary party size and slot permutation; they do not generate arbitrary workflows or prove broad concurrency safety. Unknown writes are never automatically replayed. Saved reports and exact acceptance acknowledgements survive refresh and remain tied to their original file digest. See docs/collaboration/four-cycles-2026-11-03/round-4.md for measured evidence and limits.

## Current functional additions — 4 November 2026

Persisted seller integration requests, reasoned operator review/revocation and linked resubmissions bind a disposable target to one exact upload. A separate manual browser witness compares what an operator actually observed with server receipt/merchant/occupancy reads; it is not autonomous seller-frontend execution.

The separate transfer-competition-v1 family checks two reservations competing for the last places, the losing original and an untouched third reservation. It has its own finite definition and does not change the older release-versus-transfer oracle. Actual Python/SQLite fixed and deliberately faulty fixtures are runnable in the source tests.

The AI panel includes dated, fully retained synthetic evaluation data: initial twelve projects/twenty-four criteria raw24/24 versus application22/24, with nine whole answers accepted and three qualified by an independent AI reviewer. Two actual application-classification errors were fixed; the separate four-project/eight-criterion development follow-up achieved raw8/8 and application8/8. This is not real-customer accuracy or human usability research. Complete raw answers, extra risks/limitations, references and frozen source are in public/benchmarks/five-cycles-2026-11-04/. Viewing these records never calls a model.

Repeated original-model runs retain up to four inline and sixteen immutable D1 archive reports, subject to unchanged byte/acceptance budgets. The server shows actual capacity before a run. An accepted A remains the exact consent basis after supplements; missing, modified or foreign archives fail closed. Replacements preserve scoped historical-version hydration and offline exports check the complete archive mapping and SHA. See docs/collaboration/five-new-cycles-2026-11-04/ for the five rounds and measured boundaries.

## Clean local setup

On macOS or a POSIX environment, with Node.js 22.13+ and npm installed (Node.js 24 recommended), run one command from this checkout:

\`node scripts/judge-demo.mjs\`

The command reuses installed dependencies or installs the pinned lockfile with pnpm 11.25.0, builds in a new sanitized copy, migrates a fresh isolated D1 database, and prints a verified loopback entry URL. The first dependency installation needs public npm registry access. No API keys, PayPal account or real ChatGPT login are needed. Open the printed /signin-with-chatgpt?return_to=/ URL: it activates the existing fixed local test account and enters the demo. This is not production authentication or two real logins.

Each invocation starts a fresh session; existing checkout data and previous session files remain untouched. Caller provider settings and local environment files are not copied. Press Ctrl+C to stop only this demo's owned process groups. The helper was exercised on macOS; Linux uses the same path but is not independently validated here. Native Windows users should use WSL2 or the README's manual setup. See docs/JUDGE-DEMO-2026-11-02.md for startup checks, isolation, logs, recovery and the optional noninteractive --smoke check. If pnpm is already installed, \`pnpm judge:demo\` runs the same workflow.

Start with the built-in two-sided demonstration and keep payment in simulated mode. Lock the scope as buyer, switch to seller, prepare the first delivery and inspect the missing Contact page and broken booking target. Submit a note, return it with buyer feedback, prepare the revised delivery, then inspect and explicitly accept the current version. A revision label alone does not mean every requirement passed.

## Business-content handoff

For the business-content workflow, read docs/PLAN-COHERENCE-2026-11-02.md and use tests/fixtures/noodle-business/. The explicit business example fills four pages and source-backed menu/phone requirements. Confirm scope, inspect the editable business checks, then upload v1 as seller. Its English price is correct, Chinese price is28 with a hidden18 decoy, and telephone is wrong. Run business checks, draft feedback, return it and upload v2. Run fresh checks and open Compare each requirement to see agreed, earlier and current actual values together. Human acceptance and payment remain separate.

The booking-backend example now proposes the original six-person maximum with a separately confirmed eighteen-step booking-http-v2 agreement. It tests zero/fractional counts, one guest, maximum−1/maximum/maximum+1, independent readback and concurrent same-key consistency. A strict original maximum from2–12 is required; money, minimums and ambiguous limits are not inferred. Existing booking-http-v1 plans retain their eight steps. Choose a compatible seller-declared registered target at upload. Reports bind exact delivery/digest/plan/target, and every failed or uncertain step requires acknowledgement and a reason for exception acceptance. Replacements need fresh evidence; supplemental runs never rewrite acceptance-time evidence. The server reserves report and measured acceptance room before external requests. Read docs/BOOKING-POLICY-CHECKS.md for business policies, conservative recovery and the evidence budget, and docs/BOOKING-HTTP-VERIFICATION.md for historical basic-protocol observations. Local native-SQLite eighteen-step results are not hosted evidence. This optional network check is neither a live model nor PayPal call and is not part of the provider-free helper's readiness proof. The owner has paused video work while code and functional verification continue.

A fresh capacity example now proposes booking-http-v4 with two explicitly confirmed original clauses: each booking allows at most 6 people and each slot at most 8 guests in total. Its 31 bounded HTTP steps combine the 17 existing v3 capacity observations with 14 additions: six invalid-input probes (missing slot, malformed email, zero/fractional/negative/string counts), one winning-key conflict, three same-key concurrency/readback steps and four one-guest/maximum-minus-one creation/readback steps. Existing v1/v2/v3 plans retain 8/18/17 steps and their original saved meanings; v3 remains selectable. The seven-family scope disclosure shows planned and saved outcomes, not a website coverage percentage. Missing or pending observations never borrow old counts.

The separately configured native handler provides a concrete local counterexample: its email-gap mode supports the shorter v3 valid-email baseline 17/17, while v4 stores one fictional malformed-email booking and produces 6 supported, 2 mismatched and 23 unavailable steps after 8 HTTP requests; slot A actually contains 1 guest. The corrected local handler produces 31/31 and six distinct synthetic receipts. These are actual native-SQLite and owned-loopback HTTP observations, not a new hosted result, an independent seller or general website validation. V4 reserves 96KiB for its report versus 48KiB for older protocols, plus measured acceptance room for every 31-step exception acknowledgement. Per-version histories and acceptance snapshots remain unchanged by supplemental reports.

The append-only examples/seller-capacity-staging/migrations/0002_capacity_expanded.sql and hosted-fixture tests/fixtures/seller-staging-hosted/0005_capacity_expanded.sql add isolated expanded state without changing the older capacity migrations. The handler's own policy is not copied from checker expectations. This checks the declared disposable backend, not static-form wiring or all website behavior. Read docs/COVERAGE-EXPANSION-2026-11-03.md for the 31-step inventory, seven groups and executed local evidence, and docs/DEPTH-VERIFICATION-2026-11-03.md for the historical 17-step checkpoint. Publication of the new source and current browser results remain separate verification steps.

The separate /journeys.html experiment adds twenty browser-lifecycle checkpoints using a trusted fictional JavaScript form and an independent native SQL service. It operates create/cancel/repeated-cancel/move controls, compares their actual request values with UI values, reads the merchant and occupancy records independently, and investigates a planned post-commit HTTP504 before one same-key retry. Six controlled scenarios comprise corrected behavior, actual duplicate cancellation credit, destructive failed move, duplicate retry, frontend fake success and wrong-party submission. The direct native suite and pure/guest-Worker suites each pass ten local tests; a corrected HTTP stand-in uses39 requests and retains five receipts, four active, with A8/B1/C2. This stand-in is not proof of browser clicks or publication. The first CUA attempt found a missing form sandbox permission, corrected only for the trusted fixture; subsequent browser and release results must be verified separately. No arbitrary seller frontend, current private upload, authenticated merchant role, timezone rule, email, security/provenance certification, acceptance or payment is implied. The client-controlled512KiB-bounded report validates its twenty observations and is downloadable, not signed; refresh clears the local scenario results. Fresh consent includes the planned504 and one retry; stopping is not rollback. Read docs/JOURNEY-DEPTH-2026-11-03.md for source and evidence boundaries.

Check connection reads only target metadata before consenting to booking writes; it is not an acceptance report. The separate public lab's /verify.html checks a selected local evidence JSON in browser memory without uploads, providers or reissuing historical requests. Internally consistent unsigned evidence does not establish authenticity, actual execution or payment. The native capacity source and offline CLI are included in this package. You can select tests/fixtures/recorded-capacity-v3/evidence.json in the browser verifier, or pass it to the CLI. Its companion README identifies the actual developer-operated test origin and limits; it is a recorded fictional example, not a new request or independent human study.

The isolated no-key helper intentionally disables live providers. In a separate manual checkout with your own DeepSeek key, the explicit AI business-check suggestion action can propose two typed prices and phone copy directly from the original requirements. Each must be adopted/edited and confirmed. The public scripts/evaluation-results/2026-11-02-business-suggestion-baseline.json and followup.json preserve actual synthetic model outputs; reading those files is recorded evidence, not a new live request. An invited seller sees the same locked business plan before joining, and source assessment receives that validated plan without browser-report blocks.

## Additional functional checks (4 November 2026)

Read docs/GAP-CLOSURE-2026-11-04.md for the scoped independent operator queue, supplemental time policies, existing-form DOM adapter and recorded regression/transfer results. The public https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/time-policy.html experiment compares corrected, advance-notice-defective and DST-defective native services using actual synthetic requests and independent readback. Private project time policies are saved separately against exact uploads. Seller cooperation is required for dynamic forms; no arbitrary-site or deployment attestation is claimed. Full original failures and independent AI whole-answer reviews remain retained.

## Optional providers

No secrets are included. The isolated judge command always disables external providers. Keep its temporary copy provider-free. To configure your own DeepSeek API and PayPal Sandbox REST app separately, stop that demo, return to the original public checkout, follow the README's manual local-development setup and copy this checkout's generated placeholder \`.env.example\` to the Git-ignored \`.dev.vars\`. Restart after configuring. AI assessment is an explicit action that sends requirements and bounded saved source to the configured model and may cost money. A rule review is not a model call. Never use production PayPal credentials or real money for this prototype.

The ordinary two-sided experience uses one owner and simulated payment. The explicit same-owner Sandbox rehearsal uses a virtual seller and the configured test merchant. Inviting a real seller uses a different authenticated app account, with separate website access, and defaults to simulated payment. A new custom project can explicitly choose Invite a real seller + Sandbox test payment; the server records the creation-only sandboxCollaboration marker. Existing cases are not silently upgraded. Only the buyer can authorize or capture test payment after exact-version acceptance; the configured Sandbox test merchant receives it, not the actual seller. This is not escrow or marketplace settlement. On 2 November 2026, a hosted run with two distinct authenticated logins completed revision, exact-version acceptance and genuine AUD 1 virtual Sandbox authorization/capture; both workspaces retained Test captured after refresh. One developer operated both logins through an automation agent. This is a bounded two-account workflow check, not independent user research or seller settlement, and is separate from the earlier one-owner receipt. Follow the current README and keep simulated and genuine provider evidence separate.

## Verification

Run \`pnpm test\` and \`pnpm run typecheck\`. The actual SQLite fixture suite is separate: \`node --test tests/booking-lab.test.mjs\` (Node 24 recommended). The focused isolated API/D1 protocol check is \`node tests/run-collaborative-sandbox-local.mjs --suite runtime-checks\`; it deliberately blocks outbound HTTP, so its unavailable reports verify stored workflow behavior rather than real target success. Hosted HTTP observations are separate evidence. Provider tests use controlled responses and do not prove a real payment occurred. \`scripts/assessment-evaluation-cases.json\` is a labelled synthetic reference corpus, not measured model results. Record real output, source coverage, errors, abstention, latency and cost before making an accuracy claim.

The dated first-use plan and blank three-person CSV in docs are prepared only: independent participants have not been tested. Do not fill those result slots with developer walkthroughs or AI review. The new English recording plan is also prepared, not recorded. The existing 135-second edited still-image walkthrough remains unchanged and is not continuous screen capture. Historical evaluations retain their original results; this source export does not establish a new deployment, refreshed public release, video upload or competition submission.

The generated manifest lists every exported source file and its SHA-256. Runtime data, Site identity, credentials, local state, Git metadata and existing output files are excluded. Review the package before any external publication.
`;

const DEMO = `# Under-three-minute interaction recording plan

Prepared, not recorded. The existing 135-second edited still-image video is unchanged and is not continuous screen capture. Use docs/DEMO-RECORDING-2026-11-02.md for the spoken English script and preparation checklist; an actual new capture is still pending.

Record one continuous public-lab take at https://proofbeforepay-verification-lab.blueheron8.chatgpt.site/ . Frame only the fictional webpage body, excluding account information and other windows. Test capture/playback first. The local handoff and real HTTP test are separate evidence, not one authenticated buyer/seller transaction.

0:00–0:20 — Confirm the provided menu/phone agreement, explain that a contract is optional, switch to the virtual Seller and submit fictional v1. Label this as one visitor's browser-local role-play.

0:20–0:45 — Check the wrong price and phone, prepare an editable feedback draft and separately send it. Local rules are not a fresh AI call or a real browser observation.

0:45–1:10 — Submit fictional v2 and compare the agreed values with both actually calculated versions. A revision label alone does not establish a fix.

1:10–1:45 — Consent to an actual HTTP run against the flawed synthetic service. Show creation 201, independent readback 404 and the individual protocol mismatches. Do not replace a failed network call with a prefilled success.

1:45–2:20 — Give fresh consent, run the corrected service and compare both genuine returned reports. Show same-ID replay, conflicting data rejection and unchanged final readback. Download the two-report comparison if useful.

2:20–2:40 — Return to the fictional handoff and explicitly confirm the human check before accepting locally. Explain that the main workbench stores exact-version acceptance and exception evidence, while this lab's acceptance/payment remain local and simulated.

2:40–2:55 — Show limits and runnable source. The lab makes no model or PayPal call and does not prove every site is secure or bug-free. Independent first-use testing remains pending. A separate earlier hosted run captured AUD 1 in virtual Sandbox funds with two real authenticated logins operated by one developer; it is not a new recording, independent user research, escrow or seller settlement. Never splice its receipt into this lab as though it belonged to the same flow.
`;

export async function buildJudgePack(root, output) {
  if (!path.isAbsolute(output) || path.resolve(output) === path.resolve(root)) throw new Error("Use a new absolute output directory.");
  try { await lstat(output); throw new Error("Output already exists; choose a new directory."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  // Validate everything before creating any output; never copy a whole checkout.
  const sources = await collectPublicSource(root);
  const target = path.join(output, "source");
  await mkdir(target, { recursive: true });
  const files = [];
  async function save(relative, bytes) {
    await mkdir(path.dirname(path.join(target, relative)), { recursive: true });
    await writeFile(path.join(target, relative), bytes, { flag: "wx" });
    files.push({ file: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }
  for (const entry of sources) await save(entry.relative, entry.bytes);
  await save(".openai/hosting.json", Buffer.from('{"d1":"DB","r2":null}\n'));
  await save(".env.example", Buffer.from("# Optional local test credentials only; never commit .dev.vars\nDEEPSEEK_API_KEY=\nDEEPSEEK_MODEL=deepseek-flash\nPAYPAL_CLIENT_ID=\nPAYPAL_CLIENT_SECRET=\n"));
  await save("JUDGE-README.md", Buffer.from(GUIDE));
  await save("DEMO-SCRIPT.md", Buffer.from(DEMO));
  const manifest = { generatedAt: new Date().toISOString(), scope: "Sanitized source only; not publication or submission", excluded: ["credentials", "runtime data", "Git metadata", "Site identity", "outputs", "dependencies", "builds"], files };
  const manifestText = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(path.join(output, "manifest.json"), manifestText, { flag: "wx" });
  // The manifest does not hash itself; it verifies every exported source file.
  await writeFile(path.join(target, "SOURCE-MANIFEST.json"), manifestText, { flag: "wx" });
  const archive = path.join(output, "ProofBeforePay-source.tar.gz");
  const result = spawnSync("tar", ["-czf", archive, "-C", target, "."], { encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" } });
  if (result.status !== 0) throw new Error("Source files exported; archive creation failed.");
  return { output, sourceDirectory: target, archive, manifest: path.join(output, "manifest.json"), files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--output") throw new Error("Usage: node scripts/build-judge-pack.mjs --output /absolute/new-directory");
  const root = fileURLToPath(new URL("../", import.meta.url));
  console.log(JSON.stringify(await buildJudgePack(root, args[1])));
}
