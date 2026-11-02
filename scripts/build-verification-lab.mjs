import {readFile,writeFile,mkdir,readdir,lstat,cp} from "node:fs/promises";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {buildGuestLab} from "./build-guest-lab.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const args=process.argv.slice(2);
if(args.length!==2||args[0]!=="--output"||!path.isAbsolute(args[1]))throw new Error("Use --output /absolute/new-directory");
const output=args[1];
try{await lstat(output);throw new Error("Output exists; choose a new directory");}catch(error){if(error.code!=="ENOENT")throw error;}
await mkdir(output,{recursive:true});
const guest=path.join(output,"frontend");await buildGuestLab(guest);
const assets={};
async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){const f=path.join(folder,entry.name);if(entry.isDirectory())await walk(f);else if(entry.isFile()&&entry.name!=="guest-build.json"){const name="/"+path.relative(guest,f).split(path.sep).join("/");assets[name]={body:(await readFile(f)).toString("base64"),type:name.endsWith(".html")?"text/html; charset=utf-8":name.endsWith(".js")?"text/javascript; charset=utf-8":"text/css; charset=utf-8"};}}}
await walk(guest);
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve("wrangler/package.json"))("esbuild");
await mkdir(path.join(output,"worker"),{recursive:true});
await esbuild.build({entryPoints:[path.join(root,"app/guest-lab/server.ts")],bundle:true,platform:"browser",format:"esm",target:"es2022",outfile:path.join(output,"worker/index.js"),plugins:[{name:"guest-assets",setup(build){build.onResolve({filter:/^pbp-guest-assets$/},()=>({path:"assets",namespace:"guest"}));build.onLoad({filter:/.*/,namespace:"guest"},()=>({contents:`export default ${JSON.stringify(assets)}`,loader:"js"}));}}]});
await cp(path.join(root,"tests/fixtures/booking-backend/drizzle"),path.join(output,"drizzle"),{recursive:true});
const sellerMigrations=path.join(root,"tests/fixtures/seller-staging-hosted");
for(const name of (await readdir(sellerMigrations)).filter(name=>/^\d+.*\.sql$/u.test(name)).sort())await cp(path.join(sellerMigrations,name),path.join(output,"drizzle",name));
const journalPath=path.join(output,"drizzle/meta/_journal.json"),journal=JSON.parse(await readFile(journalPath,"utf8"));
const sellerJournal=JSON.parse(await readFile(path.join(sellerMigrations,"meta/_journal.json"),"utf8"));
for(const entry of sellerJournal.entries){
  if(entry.idx!==journal.entries.length||journal.entries.some(previous=>previous.tag===entry.tag)||entry.when<=journal.entries.at(-1).when)throw new Error("Seller migration journal is inconsistent.");
  journal.entries.push(entry);
}
await writeFile(journalPath,JSON.stringify(journal,null,2)+"\n");
await writeFile(path.join(output,"lab-build.json"),JSON.stringify({schema:"isolated-lab-build-v1",scope:"Synthetic-only public fixture and browser-local roleplay; no main application environment, provider credentials or project records copied.",assets:Object.keys(assets)},null,2)+"\n");
process.stdout.write(JSON.stringify({output,worker:path.join(output,"worker/index.js"),assets:Object.keys(assets).length})+"\n");
