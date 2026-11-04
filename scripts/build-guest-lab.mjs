#!/usr/bin/env node
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {lstat,mkdir,writeFile,readFile,readdir,copyFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {build} from "vite";
const ROOT=fileURLToPath(new URL("../",import.meta.url));
export async function buildGuestLab(output=path.join(ROOT,"outputs","guest-lab")) {
  if(!path.isAbsolute(output)||path.resolve(output)===ROOT)throw new Error("Use a new absolute output directory.");
  try{await lstat(output);throw new Error("Output already exists; choose a new directory.");}catch(error){if(error.code!=="ENOENT")throw error;}
  await mkdir(output,{recursive:true});
  await build({configFile:false,root:path.join(ROOT,"app","guest-lab"),base:"./",envDir:false,envPrefix:"PBP_GUEST_PUBLIC_",publicDir:false,logLevel:"warn",build:{outDir:output,emptyOutDir:false,sourcemap:false,target:"es2022",minify:true,rollupOptions:{input:{lab:path.join(ROOT,"app","guest-lab","index.html"),verify:path.join(ROOT,"app","guest-lab","verify.html"),journey:path.join(ROOT,"app","guest-lab","journey.html"),journeys:path.join(ROOT,"app","guest-lab","journeys.html"),timepolicy:path.join(ROOT,"app","guest-lab","time-policy.html")}}}});
  // Preserve the separately authored seller reference bytes; it imports no
  // checker or lab controller. Each declared fault gets its own pinned URL.
  const seller=path.join(ROOT,"examples","seller-lifecycle-staging","frontend");
  for(const profile of["fixed","cancel-credit","move-loss","retry-duplicate"]){
    const destination=path.join(output,"seller-reference",profile);await mkdir(destination,{recursive:true});
    for(const name of["index.html","seller.css","seller.mjs","bridge.mjs","config.mjs","runtime-config.mjs"])await copyFile(path.join(seller,name),path.join(destination,name));
  }
  // A distinct JavaScript form uses configured DOM selectors and the same
  // cooperative envelope. It shares the controlled native lifecycle backend;
  // it is not another independent merchant or browser attestation service.
  const domExample=path.join(ROOT,"examples","seller-dom-staging");
  for(const profile of["fixed","cancel-credit","move-loss","retry-duplicate"]){
    const destination=path.join(output,"seller-adapter",profile);await mkdir(destination,{recursive:true});
    for(const name of["index.html","adapter.css","app.mjs"])await copyFile(path.join(domExample,name),path.join(destination,name));
    await copyFile(path.join(seller,"bridge.mjs"),path.join(destination,"bridge.mjs"));
    await copyFile(path.join(seller,"runtime-config.mjs"),path.join(destination,"runtime-config.mjs"));
    await copyFile(path.join(ROOT,"public","sdk","seller-dom-adapter.mjs"),path.join(destination,"seller-dom-adapter.mjs"));
    await writeFile(path.join(destination,"config.mjs"),`import {allowLoopbackParent} from "./runtime-config.mjs";\nexport const config=Object.freeze({allowedParentOrigins:["https://briefpay-kang-lab.blueheron8.chatgpt.site"],allowLoopbackParent,backendBasePath:"/seller-reference/${profile}/pbp/",frontendRevision:"seller-dom-${profile}-v1"});\n`,{flag:"wx"});
  }
  // Finite public source-matching fixture; preserve the exact uploaded bytes.
  const sourceDemo=path.join(output,"deployment-source-demo");await mkdir(sourceDemo,{recursive:true});
  for(const name of ["index.html","style.css"])await copyFile(path.join(ROOT,"public","deployment-source-demo",name),path.join(sourceDemo,name));
  const files=[];async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const f=path.join(folder,entry.name);if(entry.isSymbolicLink())throw new Error("Guest output cannot contain symlinks.");if(entry.isDirectory())await walk(f);else if(entry.isFile()){const bytes=await readFile(f);files.push({file:path.relative(output,f).split(path.sep).join("/"),bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}}}
  await walk(output);await writeFile(path.join(output,"guest-build.json"),JSON.stringify({schema:"guest-lab-build-v1",scope:"Isolated static guest frontend only; no main application identity, projects, D1 or provider secrets. Optional same-origin controlled HTTP lab must be supplied separately.",files},null,2)+"\n",{flag:"wx"});
  return {output,entry:path.join(output,"index.html"),files:files.length+1,method:"static-guest-frontend-v1"};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const args=process.argv.slice(2);if(args.length&&!(args.length===2&&args[0]==="--output"))throw new Error("Usage: node scripts/build-guest-lab.mjs [--output /absolute/new-directory]");console.log(JSON.stringify(await buildGuestLab(args[1])));}
