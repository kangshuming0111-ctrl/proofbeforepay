#!/usr/bin/env node
import { readFile, writeFile, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

import {MAX_BYTES,issue,validateFirstUseSession,summarizeFirstUseSessions} from "../lib/first-use-session.mjs";
export {validateFirstUseSession,summarizeFirstUseSessions} from "../lib/first-use-session.mjs";

async function readSession(file) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw issue("INVALID_SESSION_FILE");
  let value; try { value = JSON.parse(await readFile(file, "utf8")); } catch { throw issue("INVALID_SESSION_JSON"); }
  return validateFirstUseSession(value);
}
export async function runFirstUseCli(args) {
  if (args.length === 2 && args[0] === "--summarize") {
    const names = await readdir(args[1]);
    if (names.length > 200) throw issue("SESSION_COLLECTION_LIMIT");
    const records = await Promise.all(names.filter(name => name.endsWith(".json")).sort().map(name => readSession(path.join(args[1], name))));
    return summarizeFirstUseSessions(records);
  }
  if (args.length !== 4 || args[0] !== "--input" || args[2] !== "--output" || !args[1] || !args[3]) throw issue("USAGE: --input <session.json> --output <record.json> OR --summarize <records-directory>");
  const session = await readSession(args[1]), bytes = JSON.stringify(session, null, 2) + "\n";
  await writeFile(args[3], bytes, { flag: "wx", mode: 0o600 });
  return { recorded: true, sessionId: session.sessionId, mode: session.mode, eligibleForHumanAggregate: session.mode === "human_first_use", sha256: createHash("sha256").update(bytes).digest("hex"), researchClaim: "No occurrence or identity verified; aggregate separately." };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await runFirstUseCli(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error?.code === "EEXIST" ? "RECORD_ALREADY_EXISTS" : error?.code?.startsWith?.("E") ? "SESSION_FILE_IO_FAILED" : error?.message ?? "SESSION_RECORD_FAILED"); process.exitCode = 1; }
}
