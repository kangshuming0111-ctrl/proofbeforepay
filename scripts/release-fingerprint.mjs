import { createHash } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const directories = ["app", "lib", "components", "hooks", "db", "drizzle", "worker", "vendor", "scripts/vite", "scripts/connector-preview", "public"];
const roots = ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "vite.config.ts", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "scripts/release-fingerprint.mjs", "scripts/run-framework.mjs", "scripts/build-verified.sh", "scripts/sites-env.sh", "scripts/sites-env.mjs", "scripts/execution-profile.mjs", "scripts/tool-environment.mjs"];
const extension = /\.(?:html|ts|tsx|mts|cts|js|mjs|cjs|css|json|sql|svg)$/u;
const forbidden = /^(?:node_modules|dist|outputs|work|__pycache__|credentials?|cookies?|secrets?|private[-_]?(?:keys?|notes?)|personal[-_]?notes?|auth[-_]?state|storage[-_]?state)(?:\.(?:md|txt|json))?$/iu;

function excludedPath(name) {
  return name === "public/benchmarks" || name.startsWith("public/benchmarks/")
    || name.split("/").some(part => part.startsWith(".") || forbidden.test(part));
}

export function isReleaseSource(name) {
  return roots.includes(name) || directories.some(directory => name.startsWith(`${directory}/`)) && extension.test(name) && !excludedPath(name);
}

/** Selected application source and public text assets; no benchmark or compiled bytes. */
export function fingerprintEntries(entries) {
  const files = entries.filter(entry => isReleaseSource(entry.relative)).map(entry => ({
    file: entry.relative,
    sha256: createHash("sha256").update(entry.bytes.toString("utf8").replace(/\r\n/gu, "\n")).digest("hex"),
  })).sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0);
  if (new Set(files.map(file => file.file)).size !== files.length) throw new Error("Duplicate source names.");
  return {schema: "proofbeforepay-app-source-v2", sha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"), files: files.length};
}

export async function releaseFingerprint(root) {
  const entries = [];
  async function walk(relative) {
    if ((await lstat(path.join(root, relative))).isSymbolicLink()) throw new Error(`Source symlink rejected: ${relative}`);
    for (const item of await readdir(path.join(root, relative), {withFileTypes: true})) {
      const name = `${relative}/${item.name}`;
      if (excludedPath(name)) continue;
      if (item.isSymbolicLink()) throw new Error(`Source symlink rejected: ${name}`);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile() && isReleaseSource(name)) entries.push({relative: name, bytes: await readFile(path.join(root, name))});
    }
  }
  for (const directory of directories) {
    try {await walk(directory);} catch (error) {if (error.code !== "ENOENT") throw error;}
  }
  for (const relative of roots) {
    try {
      if ((await lstat(path.join(root, relative))).isSymbolicLink()) throw new Error(`Source symlink rejected: ${relative}`);
      entries.push({relative, bytes: await readFile(path.join(root, relative))});
    } catch (error) {if (error.code !== "ENOENT") throw error;}
  }
  return fingerprintEntries(entries);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await releaseFingerprint(fileURLToPath(new URL("../", import.meta.url)))));
}
