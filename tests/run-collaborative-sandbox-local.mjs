// Reproducible isolated API/D1 test. Never reads/copies .dev.vars, inherits
// provider credentials, publishes a site, or contacts a payment provider.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { openSync, closeSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildJudgePack } from "../scripts/build-judge-pack.mjs";

const repo = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp("/private/tmp/pbp-two-account-test-");
const pack = await buildJudgePack(repo, path.join(temp, "export"));
const source = pack.sourceDirectory;
await symlink(path.join(repo, "node_modules"), path.join(source, "node_modules"));
const node = process.execPath;
const cleanEnv = {PATH: `${path.dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: process.env.HOME, LANG: "en_US.UTF-8"};

function run(args, logName) {
  const result = spawnSync(node, args, {cwd: source, env: cleanEnv, encoding: "utf8", maxBuffer: 8 * 1024 * 1024});
  writeFileSync(path.join(temp, logName), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (result.status !== 0) throw new Error(`Isolated step failed; inspect ${path.join(temp, logName)}`);
}

run(["--test", "tests/sandbox-provider-worker.test.mjs"], "synthetic-fixture.log");
run(["scripts/run-framework.mjs", "build"], "build.log");
const server = path.join(source, "dist/server");
const config = JSON.parse(await readFile(path.join(server, "wrangler.json"), "utf8"));
config.main = "synthetic-entry.mjs";
config.name = "pbp-synthetic-sandbox-local";
config.vars = {PAYPAL_CLIENT_ID: "pbp-local-synthetic-merchant", PAYPAL_CLIENT_SECRET: "pbp-local-synthetic-secret", DEEPSEEK_API_KEY: ""};
await writeFile(path.join(server, "wrangler.synthetic.json"), JSON.stringify(config));
await writeFile(path.join(server, "synthetic-provider.mjs"), await readFile(path.join(source, "tests/sandbox-provider-worker.mjs")));
await writeFile(path.join(server, "synthetic-entry.mjs"), 'import app from "./index.js";\nimport {wrapSandboxTestWorker} from "./synthetic-provider.mjs";\nexport default wrapSandboxTestWorker(app);\n');
const wrangler = ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js"];
for (const name of (await readdir(path.join(source, "drizzle"))).filter(name => /^\d+.*\.sql$/u.test(name)).sort()) {
  run([...wrangler, "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.synthetic.json", "--persist-to", ".wrangler/synthetic-state", "--file", `drizzle/${name}`], `migration-${name}.log`);
}
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
const origin = `http://127.0.0.1:${port}`;
const logFd = openSync(path.join(temp, "worker.log"), "w");
const worker = spawn(node, [...wrangler, "dev", "--config", "dist/server/wrangler.synthetic.json", "--local", "--persist-to", ".wrangler/synthetic-state", "--port", String(port), "--ip", "127.0.0.1", "--inspector-port", "0", "--log-level", "warn"], {cwd: source, env: cleanEnv, stdio: ["ignore", logFd, logFd]});
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (worker.exitCode !== null) break;
    try {
      const response = await fetch(`${origin}/api/__synthetic_sandbox_test_mode`, {redirect: "manual"});
      const marker = await response.json();
      ready = response.ok && marker.syntheticConfiguration === true && marker.outboundFetch === "blocked";
      if (ready) break;
    } catch { /* Startup-only read polling; mutations are never retried. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`Synthetic Worker did not become ready; inspect ${path.join(temp, "worker.log")}`);
  // Require stable application/D1 routing before the first mutation. Startup
  // reads may be polled, while no mutation is retried after any failure.
  let stableReads = 0;
  for (let attempt = 0; attempt < 50 && stableReads < 5; attempt += 1) {
    try {
      const configResponse = await fetch(`${origin}/api/config`, {redirect: "manual"});
      const runtime = await configResponse.json();
      const listing = await fetch(`${origin}/api/proofs`, {headers: {"oai-authenticated-user-id": "synthetic-readiness", "oai-authenticated-user-email": "ready@synthetic.example"}, redirect: "manual"});
      const list = await listing.json();
      stableReads = configResponse.ok && runtime.paymentMode === "sandbox" && runtime.aiMode === "demo" && listing.ok && Array.isArray(list.quotes) ? stableReads + 1 : 0;
    } catch { stableReads = 0; }
    if (stableReads < 5) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (stableReads < 5) throw new Error("Isolated application/D1 did not pass stable read-only readiness.");
  const result = spawnSync("/usr/bin/python3", ["tests/collaborative-sandbox-api-smoke.py", "--url", origin], {cwd: source, env: cleanEnv, encoding: "utf8", maxBuffer: 2 * 1024 * 1024});
  await writeFile(path.join(temp, "api-result.log"), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (result.status !== 0) throw new Error(`Local API test failed; inspect ${path.join(temp, "api-result.log")}`);
  const resultData = JSON.parse(result.stdout);
  const report = {...resultData, sourceExport: source, isolatedBuild: "passed", localDatabase: "freshly migrated", sourceFiles: pack.files, mockProviderScope: ["create-order", "authorize", "capture"], mockProviderOutOfScope: ["void", "reconcile"], deployment: "none", actualAuthenticatedAccounts: "not tested"};
  await writeFile(path.join(temp, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (worker.exitCode === null) {
    const exited = once(worker, "exit");
    worker.kill("SIGTERM");
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    if (worker.exitCode === null) worker.kill("SIGKILL");
  }
  closeSync(logFd);
}
