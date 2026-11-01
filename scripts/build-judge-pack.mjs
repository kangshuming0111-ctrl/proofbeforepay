import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Build a local reviewable export. This never reads runtime credentials, publishes
// a repository, changes Site access, starts a provider call or installs packages.
const ROOT_FILES = ["README.md", "LICENSE", "AGENTS.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "next.config.ts", "vite.config.ts", "postcss.config.mjs", "eslint.config.mjs", "drizzle.config.ts", "cloudflare-env.d.ts", "components.json", ".gitignore", ".agents/skills/proofbeforepay-delivery/SKILL.md", ".agents/skills/proofbeforepay-delivery/references/code-map.md"];
const SOURCE_DIRS = ["app", "lib", "db", "drizzle", "components", "hooks", "worker", "vendor", "public", "scripts", "tests", "docs"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".css", ".json", ".sql", ".md", ".yaml", ".yml", ".svg", ".py", ".sh", ".csv", ".LICENSE"]);
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
      else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) names.push(name);
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

Generating this source export does not by itself publish a repository or submit a Devpost entry. It does not grant live judge access or establish measured AI results. The hosted Site may remain owner-private. Do not assume its URL works for another account. See the [dated evaluation](docs/EVALUATION-2026-11-02.md) for separately recorded results and limits.

## What to try

ProofBeforePay helps a buyer and a website developer agree on static website requirements, review saved delivery evidence, request revisions, accept an exact version and separately confirm test payment. A contract is optional. Uploads preserve bounded relative directories with root-level index.html and up to 40 HTML/CSS/PNG/JPEG/WebP files. Text is limited to 64 KiB per file and 256 KiB total; raster images to 256 KiB each and 1 MiB total. Scripts, form submissions, external subresources and backend behavior are not executed in the isolated preview. ZIPs must be unpacked before choosing their website folder.

Source resource checks show missing local targets, out-of-scope references and uninspectable syntax for the exact saved delivery. A source finding labelled blocked does not establish that the browser attempted and blocked a navigation; links may leave the saved preview, so return to a saved entry before judging it.

Compare each requirement displays the unchanged agreed clause, version-matched old buyer feedback, and separate old/current rule excerpts, AI source citations and browser observations. Missing or stale records are unavailable rather than borrowed from another version. A newer version or smaller issue count does not prove a fix. Source AI reads bounded HTML/CSS text, not image pixels. Either participant may append a reasoned human review of an AI risk; the original model report remains unchanged. These annotations do not accept work or initiate payment.

## Clean local setup

On macOS or a POSIX environment, with Node.js 22.13+ and npm installed (Node.js 24 recommended), run one command from this checkout:

\`node scripts/judge-demo.mjs\`

The command reuses installed dependencies or installs the pinned lockfile with pnpm 11.25.0, builds in a new sanitized copy, migrates a fresh isolated D1 database, and prints a verified loopback entry URL. The first dependency installation needs public npm registry access. No API keys, PayPal account or real ChatGPT login are needed. Open the printed /signin-with-chatgpt?return_to=/ URL: it activates the existing fixed local test account and enters the demo. This is not production authentication or two real logins.

Each invocation starts a fresh session; existing checkout data and previous session files remain untouched. Caller provider settings and local environment files are not copied. Press Ctrl+C to stop only this demo's owned process groups. The helper was exercised on macOS; Linux uses the same path but is not independently validated here. Native Windows users should use WSL2 or the README's manual setup. See docs/JUDGE-DEMO-2026-11-02.md for startup checks, isolation, logs, recovery and the optional noninteractive --smoke check. If pnpm is already installed, \`pnpm judge:demo\` runs the same workflow.

Start with the built-in two-sided demonstration and keep payment in simulated mode. Lock the scope as buyer, switch to seller, prepare the first delivery and inspect the missing Contact page and broken booking target. Submit a note, return it with buyer feedback, prepare the revised delivery, then inspect and explicitly accept the current version. A revision label alone does not mean every requirement passed.

## Optional providers

No secrets are included. The isolated judge command always disables external providers. Keep its temporary copy provider-free. To configure your own DeepSeek API and PayPal Sandbox REST app separately, stop that demo, return to the original public checkout, follow the README's manual local-development setup and copy this checkout's generated placeholder \`.env.example\` to the Git-ignored \`.dev.vars\`. Restart after configuring. AI assessment is an explicit action that sends requirements and bounded saved source to the configured model and may cost money. A rule review is not a model call. Never use production PayPal credentials or real money for this prototype.

The ordinary two-sided experience uses one owner and simulated payment. The explicit same-owner Sandbox rehearsal uses a virtual seller and the configured test merchant. Inviting a real seller uses a different authenticated app account, with separate website access, and defaults to simulated payment. A new custom project can explicitly choose Invite a real seller + Sandbox test payment; the server records the creation-only sandboxCollaboration marker. Existing cases are not silently upgraded. Only the buyer can authorize or capture test payment after exact-version acceptance; the configured Sandbox test merchant receives it, not the actual seller. This is not escrow or marketplace settlement. On 2 November 2026, a hosted run with two distinct authenticated logins completed revision, exact-version acceptance and genuine AUD 1 virtual Sandbox authorization/capture; both workspaces retained Test captured after refresh. One developer operated both logins through an automation agent. This is a bounded two-account workflow check, not independent user research or seller settlement, and is separate from the earlier one-owner receipt. Follow the current README and keep simulated and genuine provider evidence separate.

## Verification

Run \`pnpm test\` and \`pnpm run typecheck\`. Provider tests use controlled responses and do not prove a real payment occurred. \`scripts/assessment-evaluation-cases.json\` is a labelled synthetic reference corpus, not measured model results. Record real output, source coverage, errors, abstention, latency and cost before making an accuracy claim.

The dated first-use plan and blank three-person CSV in docs are prepared only: independent participants have not been tested. Do not fill those result slots with developer walkthroughs or AI review. The new English recording plan is also prepared, not recorded. The existing 135-second edited still-image walkthrough remains unchanged and is not continuous screen capture. Historical evaluations retain their original results; this source export does not establish a new deployment, refreshed public release, video upload or competition submission.

The generated manifest lists every exported source file and its SHA-256. Runtime data, Site identity, credentials, local state, Git metadata and existing output files are excluded. Review the package before any external publication.
`;

const DEMO = `# Under-three-minute interaction recording plan

Prepared, not recorded. The existing 135-second edited still-image video is unchanged and is not continuous screen capture. Use docs/DEMO-RECORDING-2026-11-02.md for the spoken English script and preparation checklist; an actual new capture is still pending.

0:00–0:20 — Show one prepared buyer project and its exact agreed opening-hours requirement. Explain the cross-border website handoff and that a contract is optional.

0:20–0:45 — Inspect the saved local CSS/photo directories and preview. Distinguish missing local resources from an out-of-scope external-reference finding; do not claim a navigation or backend test occurred.

0:45–1:10 — Open an actually saved source AI result and its exact quote. On a real listed risk, save a reasoned human review; show that the raw AI text remains present. If no genuine AI/risk record exists, disclose that limitation and omit the action rather than fabricate one.

1:10–1:35 — Prepare editable criterion-specific feedback, explicitly request changes, switch to seller and upload the complete revised folder. The selected demonstration uses one owner with virtual roles; do not describe that switch as two independent accounts.

1:35–2:05 — Open Compare each requirement. Show the unchanged clause, old feedback and both versions' separate rule/AI/browser records. Missing new AI or browser records stay unavailable. Show source changes, not an invented automatic fixed verdict.

2:05–2:35 — Inspect the delivered mobile pages, complete required human checks and explicitly accept the current version without payment. Use the next-step control to find the remaining check.

2:35–2:55 — Show payment mode and limits. This prepared recording uses a simulated case and remains simulated. Only show a genuine Sandbox result if this exact project actually produced it; do not reuse another case's receipt. A separate hosted run used two real authenticated logins operated by the same developer through an automation agent and captured AUD 1 in virtual funds to the configured test merchant, not the seller. It is not independent user research or evidence that this planned recording exists. Close on the runnable source and pending first-use testing; do not invent users, accuracy or security certification.
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
