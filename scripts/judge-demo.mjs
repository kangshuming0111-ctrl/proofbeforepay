#!/usr/bin/env node
// One local, provider-free judge session. The source checkout, its environment
// files, database, running services and hosting configuration are never changed.
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { access, mkdir, mkdtemp, open, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectPublicSource } from "./build-judge-pack.mjs";
import { releaseFingerprint } from "./release-fingerprint.mjs";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const PNPM = "11.25.0";
const PROVIDERS = ["DEEPSEEK_API_KEY", "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"];
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const ownedGroups = new WeakSet(), stoppingChildren = new WeakMap();

export function validateNode(version = process.versions.node) {
  const [major, minor] = version.split(".").map(Number);
  if (!Number.isInteger(major) || major < 22 || major === 22 && minor < 13) throw new Error("Install Node.js 22.13 or newer (Node.js 24 recommended), then run this command again.");
}

export function cleanJudgeEnvironment(input, runDirectory, node = process.execPath) {
  const env = {};
  // Do not forward NODE_OPTIONS, provider keys, proxy credentials, npm settings,
  // Cloudflare login variables or arbitrary user environment to child processes.
  for (const name of ["PATH", "LANG", "LC_ALL", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT"]) {
    if (typeof input[name] === "string") env[name] = input[name];
  }
  env.PATH = `${path.dirname(node)}${path.delimiter}${env.PATH ?? ""}`;
  Object.assign(env, {
    CI: "1", NODE_USE_SYSTEM_CA: "1", NO_COLOR: "1", FORCE_COLOR: "0",
    XDG_CONFIG_HOME: path.join(runDirectory, "tool-config"),
    XDG_CACHE_HOME: path.join(runDirectory, "tool-cache"),
    NPM_CONFIG_USERCONFIG: path.join(runDirectory, "empty.npmrc"),
    NPM_CONFIG_GLOBALCONFIG: path.join(runDirectory, "empty-global.npmrc"),
    NPM_CONFIG_CACHE: path.join(runDirectory, "npm-cache"),
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
    SITES_RUNTIME_ROOT: path.join(runDirectory, "tool-runtime"),
    CLOUDFLARE_CF_FETCH_ENABLED: "false", WRANGLER_SEND_METRICS: "false", WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: path.join(runDirectory, "tool-runtime", "wrangler.log"),
    WRANGLER_REGISTRY_PATH: path.join(runDirectory, "tool-runtime", "dev-registry"),
    MINIFLARE_REGISTRY_PATH: path.join(runDirectory, "tool-runtime", "registry"),
  });
  for (const name of PROVIDERS) env[name] = "";
  return env;
}

export function judgeConfig(nonce, port) {
  if (!/^[0-9a-f-]{36}$/u.test(nonce) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid local judge readiness settings.");
  return `// Generated only inside this isolated judge session. Never used for deployment.\nimport original from "./vite.config";\nimport { defineConfig } from "vite";\nexport default defineConfig(async context => {\n  const base = typeof original === "function" ? await original(context) : await original;\n  return { ...base, server: { ...base.server, host: "127.0.0.1", port: ${port}, strictPort: true }, plugins: [\n    { name: "judge-session-readiness", enforce: "pre", configureServer(server) { server.middlewares.use((request, response, next) => {\n      if (request.url?.split("?")[0] !== "/__proofbeforepay_judge_ready") return next();\n      response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify({ session: ${JSON.stringify(nonce)}, pid: process.pid, providerFree: true }));\n    }); } }, ...(base.plugins ?? []) ] };\n});\n`;
}

/** Read-only readiness on the exact reserved loopback origin. A unique generated
 * middleware marker prevents accidentally reporting an unrelated service ready. */
export async function verifyJudgeReady(origin, nonce, expectedPid, expectedSource, fetcher = fetch, observe = () => {}) {
  const url = new URL(origin);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Judge readiness requires an exact loopback origin.");
  const request = async (route, extra = {}) => {
    observe(`Waiting for local ${route.split("?")[0]}`);
    try { return await fetcher(new URL(route, url), { redirect: "manual", signal: AbortSignal.timeout(2000), ...extra }); }
    catch (error) { observe(`Local ${route.split("?")[0]} request did not complete`); throw error; }
  };
  const json = async (response, stage) => {
    if (!response.ok) { observe(`${stage} returned HTTP ${response.status}`); return undefined; }
    if (!response.headers.get("content-type")?.includes("application/json")) { observe(`${stage} returned a non-JSON response`); return undefined; }
    try { return await response.json(); } catch { observe(`${stage} returned invalid JSON`); return undefined; }
  };
  const markerResponse = await request("/__proofbeforepay_judge_ready");
  const marker = await json(markerResponse, "Readiness marker");
  if (!marker || !Number.isInteger(expectedPid) || marker.session !== nonce || marker.pid !== expectedPid || marker.providerFree !== true) { if (marker) observe("Readiness marker did not match the owned session and server PID"); return false; }
  const configResponse = await request("/api/config");
  const config = await json(configResponse, "Provider configuration");
  if (!config) return false;
  if (config.aiMode !== "demo" || config.paymentMode !== "demo") throw new Error("The isolated session unexpectedly enabled a live provider; it will be stopped.");
  const release = await json(await request("/api/release"), "Local source fingerprint");
  if (!release) return false;
  if (release.schema !== expectedSource.schema || release.sha256 !== expectedSource.sha256 || release.files !== expectedSource.files) {
    throw new Error("The isolated app source fingerprint did not match the copied source; it will be stopped.");
  }
  // Exercise the existing development-only sign-in. This neither logs in to
  // ChatGPT nor creates a real user. The browser later uses this same entry URL.
  const signIn = await request("/signin-with-chatgpt?return_to=/");
  const cookie = signIn.headers.get("set-cookie")?.split(";")[0];
  if (signIn.status !== 302 || signIn.headers.get("location") !== "/" || !cookie) { observe("The existing local development sign-in was not ready"); return false; }
  const listingResponse = await request("/api/proofs", { headers: { cookie } });
  const listing = await json(listingResponse, "Local database listing");
  if (!listing) return false;
  if (!Array.isArray(listing.quotes)) { observe("Local database listing did not return project records"); return false; }
  observe("Owned local session, demo providers and D1 verified");
  return true;
}

async function reservePort() {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
  return port;
}

export function stopOwnedChild(child) {
  if (!child) return Promise.resolve();
  if (stoppingChildren.has(child)) return stoppingChildren.get(child);
  const stopping = (async () => {
    if (ownedGroups.has(child) && Number.isInteger(child.pid)) {
      const alive = () => {
        // Some macOS execution contexts reject signal 0 for a departed group
        // with EPERM. Read numeric process-group membership instead of treating
        // that ambiguous error as proof that a process is still alive.
        const table = spawnSync("/bin/ps", ["-axo", "pid=,pgid="], {encoding:"utf8", env:{PATH:"/usr/bin:/bin", LANG:"C"}});
        if (table.status !== 0) throw new Error("Cannot verify the owned local demo process group's shutdown.");
        return table.stdout.split("\n").some(line => { const row = /^\s*(\d+)\s+(\d+)\s*$/u.exec(line); return row && Number(row[2]) === child.pid; });
      };
      const send = signal => { try { process.kill(-child.pid, signal); } catch (error) { if (error.code !== "ESRCH") throw error; } };
      // Only process groups created by our own detached spawns are signalled.
      // Keep cleaning the group even if its direct CLI has already exited.
      send("SIGTERM");
      const deadline = Date.now() + 3000;
      while (alive() && Date.now() < deadline) await sleep(25);
      if (alive()) {
        send("SIGKILL");
        const forcedDeadline = Date.now() + 1000;
        while (alive() && Date.now() < forcedDeadline) await sleep(25);
        if (alive()) throw new Error("The owned local demo process group did not stop; inspect its session logs.");
      }
      return;
    }
    if (child.exitCode !== null || child.signalCode !== null) return;
    const finished = once(child, "exit");
    child.kill("SIGTERM");
    await Promise.race([finished, sleep(3000)]);
    if (child.exitCode === null && child.signalCode === null) {child.kill("SIGKILL"); await Promise.race([finished, sleep(1000)]);}
  })();
  stoppingChildren.set(child, stopping);
  return stopping;
}

async function exists(file) {
  try { await access(file, constants.F_OK); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

async function pinnedPnpm(node, executablePath) {
  const candidates = [path.resolve(path.dirname(node), "../node_modules/pnpm/bin/pnpm.cjs"), path.resolve(path.dirname(node), "../lib/node_modules/pnpm/bin/pnpm.cjs")];
  for (const directory of (executablePath ?? "").split(path.delimiter).filter(Boolean)) {
    try { candidates.push(await realpath(path.join(directory, "pnpm"))); } catch { /* Not installed in this PATH entry. */ }
  }
  for (const file of new Set(candidates)) {
    try {
      const info = JSON.parse(await readFile(path.resolve(path.dirname(file), "../package.json"), "utf8"));
      if (info.name === "pnpm" && info.version === PNPM && await exists(file)) return file;
    } catch { /* A standalone wrapper is not a verified pnpm module. */ }
  }
}

/** Reuse the publication allowlist without its archive subprocess: every child
 * in this command must receive the clean environment, including initial setup. */
export async function prepareJudgeSource(sourceRoot, runDirectory) {
  const sources = await collectPublicSource(sourceRoot);
  const entries = [...sources, {relative:".openai/hosting.json", bytes:Buffer.from('{"d1":"DB","r2":null}\n')}];
  const sourceDirectory = path.join(runDirectory, "source");
  await mkdir(sourceDirectory); // Existing directories are rejected, never overwritten.
  const manifest = [];
  for (const entry of entries) {
    const target = path.join(sourceDirectory, entry.relative);
    await mkdir(path.dirname(target), {recursive:true});
    await writeFile(target, entry.bytes, {flag:"wx"});
    manifest.push({file:entry.relative, bytes:entry.bytes.length, sha256:createHash("sha256").update(entry.bytes).digest("hex")});
  }
  await writeFile(path.join(runDirectory, "source-manifest.json"), JSON.stringify({scope:"Isolated judge source snapshot; no runtime data or credentials",files:manifest},null,2) + "\n", {flag:"wx",mode:0o600});
  return {sourceDirectory, files:entries.length};
}

export async function startJudgeDemo({ sourceRoot = REPO, inputEnv = process.env, smoke = false, onStatus = text => console.log(text), signal } = {}) {
  validateNode();
  if (process.platform === "win32") throw new Error("The isolated judge helper currently uses POSIX process-group cleanup. On Windows, run it inside WSL2, or use the README's manual local setup. Native Windows startup and cleanup have not been validated.");
  // A fresh workspace means migrations never replay on an existing user's DB.
  // Keeping it on exit allows inspection; repeated commands create a new session.
  const runDirectory = await mkdtemp(path.join(tmpdir(), "proofbeforepay-judge-"));
  const env = cleanJudgeEnvironment(inputEnv, runDirectory);
  await Promise.all([
    mkdir(env.XDG_CONFIG_HOME, {recursive:true}), mkdir(env.XDG_CACHE_HOME, {recursive:true}),
    mkdir(env.SITES_RUNTIME_ROOT, {recursive:true}),
    writeFile(env.NPM_CONFIG_USERCONFIG, "", {flag:"wx", mode:0o600}),
    writeFile(env.NPM_CONFIG_GLOBALCONFIG, "", {flag:"wx", mode:0o600}),
  ]);
  const children = new Set();
  let stopping = false;
  const abort = () => { stopping = true; for (const child of children) void stopOwnedChild(child).catch(() => {}); };
  signal?.addEventListener("abort", abort, {once:true});
  async function run(command, args, cwd, logName) {
    if (stopping || signal?.aborted) throw new Error("Judge session stopped.");
    const logFile = path.join(runDirectory, logName), log = await open(logFile, "wx", 0o600);
    const child = spawn(command, args, {cwd, env, detached:true, stdio:["ignore", log.fd, log.fd]});
    ownedGroups.add(child);
    children.add(child);
    try {
      const [code] = await once(child, "close");
      if (code !== 0) throw new Error(`Local setup failed at ${logName}. Inspect ${logFile}; the source checkout and earlier sessions are unchanged.`);
    } finally { try { await stopOwnedChild(child); } finally { children.delete(child); await log.close(); } }
  }
  let server, serverLog;
  try {
    onStatus("Preparing an isolated, provider-free copy…");
    const pack = await prepareJudgeSource(sourceRoot, runDirectory);
    const source = pack.sourceDirectory;
    const expectedSource = await releaseFingerprint(source);
    // Only dependency code is reused. The running project's source, runtime
    // state and environment files are never symlinked into this session.
    if (await exists(path.join(sourceRoot, "node_modules", "vinext", "package.json")) && await exists(path.join(sourceRoot, "node_modules", "wrangler", "package.json"))) {
      await symlink(path.join(sourceRoot, "node_modules"), path.join(source, "node_modules"), "dir");
      onStatus("Reusing installed dependencies; no provider credentials are copied.");
    } else {
      onStatus(`Installing pinned dependencies with pnpm ${PNPM}; the first run needs npm registry access…`);
      const installedPnpm = await pinnedPnpm(process.execPath, env.PATH);
      const installArgs = ["install", "--frozen-lockfile", "--store-dir", path.join(runDirectory, "pnpm-store")];
      if (installedPnpm) await run(process.execPath, [installedPnpm, ...installArgs], source, "install.log");
      else {
        const npmCandidates = [path.resolve(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), path.resolve(path.dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js")];
        const npmCli = (await Promise.all(npmCandidates.map(async file => await exists(file) ? file : undefined))).find(Boolean);
        const command = npmCli ? process.execPath : "npm";
        await run(command, [...(npmCli ? [npmCli] : []), "exec", "--yes", `--package=pnpm@${PNPM}`, "--", "pnpm", ...installArgs], source, "install.log");
      }
    }
    // Deliberately generated empty local config also prevents framework fallback
    // to any optional provider. No existing env file is opened or copied.
    await writeFile(path.join(source, ".dev.vars"), PROVIDERS.map(name => `${name}=\n`).join(""), {flag:"wx", mode:0o600});
    onStatus("Building the local app…");
    await run(process.execPath, ["scripts/run-framework.mjs", "build"], source, "build.log");
    const wrangler = ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js"];
    for (const name of (await readdir(path.join(source, "drizzle"))).filter(name => /^\d+.*\.sql$/u.test(name)).sort()) {
      onStatus(`Preparing the fresh demo database (${name})…`);
      await run(process.execPath, [...wrangler, "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/state", "--file", `drizzle/${name}`], source, `migration-${name}.log`);
    }
    const port = await reservePort(), nonce = randomUUID(), origin = `http://127.0.0.1:${port}`;
    const readinessConfig = "vite.judge.config.ts";
    await writeFile(path.join(source, readinessConfig), judgeConfig(nonce, port), {flag:"wx", mode:0o600});
    serverLog = await open(path.join(runDirectory, "server.log"), "wx", 0o600);
    server = spawn(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/vite/bin/vite.js", "--config", readinessConfig], {cwd:source, env, detached:true, stdio:["ignore", serverLog.fd, serverLog.fd]});
    ownedGroups.add(server);
    let serverSpawnError;
    server.once("error", error => { serverSpawnError = error; });
    children.add(server);
    const deadline = Date.now() + 120_000;
    let ready = false, lastReadiness = "The server has not answered its readiness marker";
    while (!ready && Date.now() < deadline && !stopping && !signal?.aborted) {
      if (serverSpawnError || server.exitCode !== null || server.signalCode !== null) break;
      try { ready = await verifyJudgeReady(origin, nonce, server.pid, expectedSource, fetch, message => { lastReadiness = message; }); }
      catch (error) { if (error.message.includes("it will be stopped")) throw error; }
      if (!ready) await sleep(250);
    }
    if (!ready) throw new Error(`The isolated app did not become ready. Last check: ${lastReadiness}. Inspect ${path.join(runDirectory, "server.log")}. No unrelated process was stopped; rerun to use a fresh port and database.`);
    const readyRecord = {origin, entryUrl:`${origin}/signin-with-chatgpt?return_to=/`, runDirectory, sourceDirectory:source, serverPid:server.pid,
      providers:"disabled", auth:"existing loopback-only fixed development account", database:"fresh isolated D1", sourceExportFiles:pack.files, applicationSource:expectedSource,
      mode:smoke ? "readiness-smoke" : "interactive", realModelOrPaymentCalls:0};
    await writeFile(path.join(runDirectory, "ready.json"), JSON.stringify(readyRecord, null, 2) + "\n", {flag:"wx", mode:0o600});
    onStatus(smoke ? `Readiness verified; stopping this smoke-check session. Logs: ${runDirectory}` : `\nReady — open this local demo:\n${readyRecord.entryUrl}\n\nNo API keys or real sign-in are required. This fixed local account is not a second real user.\nAI and payments are simulated; no model or PayPal calls occur.\nSession files and logs: ${runDirectory}\nPress Ctrl+C here to stop only this demo. Running the command again starts a fresh session.\n`);
    if (smoke) return readyRecord;
    await once(server, "exit");
    if (!stopping && !signal?.aborted) throw new Error(`The demo stopped. Inspect ${path.join(runDirectory, "server.log")}; rerun for a fresh session.`);
    return readyRecord;
  } catch (error) {
    throw new Error(`${error.message}\nSession files kept at ${runDirectory}`);
  } finally {
    stopping = true; signal?.removeEventListener("abort", abort);
    const cleanup = await Promise.allSettled([...children].map(stopOwnedChild));
    await serverLog?.close();
    const failure = cleanup.find(result => result.status === "rejected");
    if (failure) throw failure.reason;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--smoke") || args.length > 1) {
    console.error("Usage: node scripts/judge-demo.mjs [--smoke]"); process.exitCode = 2;
  } else {
    const controller = new AbortController();
    const stop = () => controller.abort();
    process.once("SIGINT", stop); process.once("SIGTERM", stop);
    try { await startJudgeDemo({smoke:args[0] === "--smoke", signal:controller.signal}); }
    catch (error) { console.error(error.message); process.exitCode = controller.signal.aborted ? 130 : 1; }
    finally { process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop); }
  }
}
