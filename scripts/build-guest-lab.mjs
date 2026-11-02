#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {lstat,mkdir,writeFile,readFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {build} from "vite";
const ROOT=fileURLToPath(new URL("../",import.meta.url));
export async function buildGuestLab(output=path.join(ROOT,"outputs","guest-lab")) {
  if(!path.isAbsolute(output)||path.resolve(output)===ROOT)throw new Error("Use a new absolute output directory.");
  try{await lstat(output);throw new Error("Output already exists; choose a new directory.");}catch(error){if(error.code!=="ENOENT")throw error;}
  await mkdir(output,{recursive:true});
  await build({configFile:false,root:path.join(ROOT,"app","guest-lab"),base:"./",envDir:false,envPrefix:"PBP_GUEST_PUBLIC_",publicDir:false,logLevel:"warn",build:{outDir:output,emptyOutDir:false,sourcemap:false,target:"es2022",minify:true}});
  const files=[];async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const f=path.join(folder,entry.name);if(entry.isSymbolicLink())throw new Error("Guest output cannot contain symlinks.");if(entry.isDirectory())await walk(f);else if(entry.isFile()){const bytes=await readFile(f);files.push({file:path.relative(output,f).split(path.sep).join("/"),bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}}}
  await walk(output);await writeFile(path.join(output,"guest-build.json"),JSON.stringify({schema:"guest-lab-build-v1",scope:"Isolated static guest frontend only; no main application identity, projects, D1 or provider secrets. Optional same-origin controlled HTTP lab must be supplied separately.",files},null,2)+"\n",{flag:"wx"});
  return {output,entry:path.join(output,"index.html"),files:files.length+1,method:"static-guest-frontend-v1"};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==="--output"))throw new Error("Usage: node scripts/build-guest-lab.mjs [--output /absolute/new-directory]");console.log(JSON.stringify(await buildGuestLab(args[1])));}
