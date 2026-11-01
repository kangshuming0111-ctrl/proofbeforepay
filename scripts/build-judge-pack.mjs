import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

// Build a local reviewable export. This never reads runtime credentials, publishes
// a repository, changes Site access, starts a provider call or installs packages.
const ROOT_FILES = ["README.md", "LICENSE", "AGENTS.md", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.json", "next.config.ts", "vite.config.ts", "postcss.config.mjs", "eslint.config.mjs", "drizzle.config.ts", "cloudflare-env.d.ts", "components.json", ".gitignore", ".agents/skills/proofbeforepay-delivery/SKILL.md", ".agents/skills/proofbeforepay-delivery/references/code-map.md"];
const SOURCE_DIRS = ["app", "lib", "db", "drizzle", "components", "hooks", "worker", "vendor", "public", "scripts", "tests", "docs"];
const EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".css", ".json", ".sql", ".md", ".yaml", ".yml", ".svg", ".py", ".sh", ".LICENSE"]);
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

ProofBeforePay helps a buyer and a website developer agree on static website requirements, review saved delivery evidence, request revisions, accept an exact version and separately confirm test payment. A contract is optional. Current uploads are flat HTML/CSS; scripts, external images, forms and backend behavior are not executed in the isolated preview.

## Clean local setup

Use Node.js 24 and pnpm 11.25.0. Install the pinned dependencies with \`pnpm install --frozen-lockfile\`, then run \`pnpm run build\`.

For a fresh local database, run these commands in order. Do not replay them against a database that has already applied them:

\`node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_flashy_master_chief.sql\`

\`node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_low_chimera.sql\`

\`node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_flawless_lake.sql\`

Run \`pnpm run dev\` and open the Local URL printed by the server, normally http://localhost:5173. Open /signin-with-chatgpt once to activate the fixed local test account before creating a collaborative demo. The development sign-in emulates one local account on loopback only; it is not production authentication and cannot test two real logins. Data is local and separate from the hosted Site.

Start with the built-in two-sided demonstration and keep payment in simulated mode. Lock the scope as buyer, switch to seller, prepare the first delivery and inspect the missing Contact page and broken booking target. Submit a note, return it with buyer feedback, prepare the revised delivery, then inspect and explicitly accept the current version. A revision label alone does not mean every requirement passed.

## Optional providers

No secrets are included. Copy the generated placeholder \`.env.example\` to the Git-ignored \`.dev.vars\` only if you choose to configure your own DeepSeek API and PayPal Sandbox REST app. Restart after configuring. AI assessment is an explicit action that sends requirements and bounded saved source to the configured model and may cost money. A rule review is not a model call. Never use production PayPal credentials or real money for this prototype.

If the application offers the explicit same-owner Sandbox rehearsal, it uses a simulated seller perspective and the configured Sandbox test merchant. It is not seller onboarding, escrow or marketplace settlement. A genuine Sandbox run requires separate buyer approval, authorization and explicit capture; do not splice its status into an unrelated simulated case. Follow the current UI and README for the mode available in this exported version.

## Verification

Run \`pnpm test\` and \`pnpm run typecheck\`. Provider tests use controlled responses and do not prove a real payment occurred. \`scripts/assessment-evaluation-cases.json\` is a labelled synthetic reference corpus, not measured model results. Record real output, source coverage, errors, abstention, latency and cost before making an accuracy claim.

The generated manifest lists every exported source file and its SHA-256. Runtime data, Site identity, credentials, local state, Git metadata and existing output files are excluded. Review the package before any external publication.
`;

const DEMO = `# Three-minute demonstration plan

0:00–0:20 — A small business outsources its website across borders. The disagreement is concrete: the seller says it is done; the buyer points to the agreed opening hours and missing contact destination.

0:20–0:45 — Show buyer-confirmed requirements and price. A contract is optional. Explain which exact version will be reviewed.

0:45–1:20 — Show actual saved first-delivery files, a missing page/link finding and the wrong opening hours. If a real AI assessment is requested, show its actual cited result and label the model. Never substitute the reference evaluation labels for a live response.

1:20–1:50 — The buyer prepares specific feedback and explicitly requests changes. The seller uploads or prepares v2. Show the preserved prior version and submitted feedback.

1:50–2:25 — Compare current findings with available prior evidence. Open the corrected source citation. A person checks mobile usability and explicitly accepts this exact delivery; AI does not decide payment.

2:25–2:50 — If this same project has actually completed the explicit Sandbox rehearsal, show buyer approval, authorization and capture or cancellation evidence. Otherwise label payment simulated and explain the real Sandbox path separately. Do not imply funds are settled to a real seller.

2:50–3:00 — Show the runnable source/setup route, scope limitations and genuine verification evidence. Do not invent savings, accuracy, security certification or an award probability.
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
