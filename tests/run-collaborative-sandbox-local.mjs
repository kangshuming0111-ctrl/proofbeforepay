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
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--suite" || !["collaborative-sandbox", "browser-checks", "chain-coverage"].includes(args[1]))) {
  throw new Error("Use no arguments or --suite collaborative-sandbox|browser-checks|chain-coverage.");
}
const suite = args[1] ?? "collaborative-sandbox";
const temp = await mkdtemp("/private/tmp/pbp-two-account-test-");
const pack = await buildJudgePack(repo, path.join(temp, "export"));
const source = pack.sourceDirectory;
await symlink(path.join(repo, "node_modules"), path.join(source, "node_modules"));
const node = process.execPath;
const cleanEnv = {PATH: `${path.dirname(node)}:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: process.env.HOME, LANG: "en_US.UTF-8"};

/** Read only listener addresses belonging to this spawned process tree. Never
 * scan unrelated local services or fall back to the flaky outer dev proxy. */
function ownedWorkerdListeners(rootPid, excludedPort) {
  const processList = spawnSync("/bin/ps", ["-axo", "pid=,ppid=,comm="], {env: cleanEnv, encoding: "utf8"});
  if (processList.status !== 0) throw new Error("Cannot verify owned Worker process ancestry.");
  const processes = processList.stdout.split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    return match ? [{pid: Number(match[1]), parent: Number(match[2]), command: match[3].trim()}] : [];
  });
  const owned = new Set([rootPid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const process of processes) if (!owned.has(process.pid) && owned.has(process.parent)) {
      owned.add(process.pid); changed = true;
    }
  }
  const workerdPids = processes.filter(process => owned.has(process.pid) && path.basename(process.command) === "workerd").map(process => process.pid);
  if (!workerdPids.length) return [];
  const sockets = spawnSync("/usr/sbin/lsof", ["-nP", "-a", "-p", workerdPids.join(","), "-iTCP", "-sTCP:LISTEN", "-Fpn"], {env: cleanEnv, encoding: "utf8"});
  if (sockets.status !== 0 && sockets.status !== 1) throw new Error("Cannot verify owned Worker listener addresses.");
  const listeners = []; let pid;
  for (const line of sockets.stdout.split("\n")) {
    if (/^p\d+$/u.test(line)) pid = Number(line.slice(1));
    const address = /^n127\.0\.0\.1:(\d+)$/u.exec(line);
    if (address && workerdPids.includes(pid)) {
      const port = Number(address[1]);
      if (port !== excludedPort) listeners.push({pid, port, origin: `http://127.0.0.1:${port}`});
    }
  }
  return listeners;
}

async function readLocalJson(url, headers) {
  const response = await fetch(url, {headers, redirect: "manual", signal: AbortSignal.timeout(1000)});
  if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) throw new Error("Owned listener did not return application JSON.");
  return response.json();
}

async function verifySyntheticApp(origin) {
  const marker = await readLocalJson(`${origin}/api/__synthetic_sandbox_test_mode`);
  if (marker.syntheticConfiguration !== true || marker.outboundFetch !== "blocked") return false;
  const runtime = await readLocalJson(`${origin}/api/config`);
  if (runtime.paymentMode !== "sandbox" || runtime.aiMode !== "demo") return false;
  const listing = await readLocalJson(`${origin}/api/proofs`, {"oai-authenticated-user-id": "synthetic-readiness", "oai-authenticated-user-email": "ready@synthetic.example"});
  return Array.isArray(listing.quotes);
}

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
const logFd = openSync(path.join(temp, "worker.log"), "w");
const worker = spawn(node, [...wrangler, "dev", "--config", "dist/server/wrangler.synthetic.json", "--local", "--persist-to", ".wrangler/synthetic-state", "--port", String(port), "--ip", "127.0.0.1", "--inspector-port", "0", "--log-level", "warn"], {cwd: source, env: cleanEnv, stdio: ["ignore", logFd, logFd]});
try {
  let selected;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline && !selected) {
    if (worker.exitCode !== null) break;
    for (const candidate of ownedWorkerdListeners(worker.pid, port)) {
      try {
        if (!await verifySyntheticApp(candidate.origin)) continue;
        // Recheck ancestry/listener ownership after the asynchronous reads.
        if (ownedWorkerdListeners(worker.pid, port).some(current => current.pid === candidate.pid && current.port === candidate.port)) {selected = candidate; break;}
      } catch { /* Startup-only reads; no mutation is retried. */ }
    }
    if (!selected) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!selected) throw new Error(`No owned direct app Worker passed synthetic config/D1 verification; inspect ${path.join(temp, "worker.log")}`);
  const origin = selected.origin;
  const workerConnection = {origin, listenerPid: selected.pid, spawnedRootPid: worker.pid, outerProxyPort: port, ownerVerified: true, mutationRetries: 0};
  await writeFile(path.join(temp, "worker-origin.json"), JSON.stringify(workerConnection, null, 2));
  // Require stable application/D1 routing before the first mutation. Startup
  // reads may be polled, while no mutation is retried after any failure.
  let stableReads = 0;
  for (let attempt = 0; attempt < 50 && stableReads < 5; attempt += 1) {
    try {
      stableReads = await verifySyntheticApp(origin) ? stableReads + 1 : 0;
    } catch { stableReads = 0; }
    if (stableReads < 5) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (stableReads < 5) throw new Error("Isolated application/D1 did not pass stable read-only readiness.");
  const suiteScript = suite === "browser-checks" ? "tests/browser-checks-api-smoke.py" : suite === "chain-coverage" ? "tests/chain-coverage-api-smoke.py" : "tests/collaborative-sandbox-api-smoke.py";
  const result = spawnSync("/usr/bin/python3", [suiteScript, "--url", origin], {cwd: source, env: cleanEnv, encoding: "utf8", maxBuffer: 2 * 1024 * 1024});
  await writeFile(path.join(temp, "api-result.log"), `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  if (result.status !== 0) throw new Error(`Local API test failed; inspect ${path.join(temp, "api-result.log")}`);
  const resultData = JSON.parse(result.stdout);
  const report = {...resultData, sourceExport: source, isolatedBuild: "passed", localDatabase: "freshly migrated", sourceFiles: pack.files, workerConnection, mockProviderScope: ["create-order", "authorize", "capture"], mockProviderOutOfScope: ["void", "reconcile"], deployment: "none", actualAuthenticatedAccounts: "not tested"};
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
