import {constants} from "node:fs";
import {lstat,open,readdir} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {validateStaticFiles} from "../lib/static-project.ts";
import {assertStaticPath,encodeRasterDataUrl,STATIC_RESOURCE_LIMITS,staticFileKind} from "../lib/static-resources.ts";
import {runtimeDeliveryDigest} from "../lib/runtime-project.ts";
import {validateRuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

const PRIVATE_PART=/^(?:\.|node_modules$|credentials?(?:[._-]|$)|cookies?(?:[._-]|$)|secrets?(?:[._-]|$)|private(?:[._-]|$)|auth[-_]?state(?:[._-]|$)|storage[-_]?state(?:[._-]|$))/iu;
const FLAGS=new Set(["project-id","target-id","label","base-url","deployment-revision","registration-revision","expires-at","frontend-folder","backend-artifact-digest","backend-source-commit","output","protocol"]);
const MAX_ENTRIES=200;
const HELP="Usage: node --experimental-strip-types scripts/create-runtime-registration.mjs --project-id ID --target-id ID --label LABEL --base-url https://staging.example.org/pbp-test/ --deployment-revision REV --registration-revision REV --expires-at UTC_ISO --frontend-folder /absolute/canonical/folder [--protocol booking-http-v2] [--backend-artifact-digest SHA256] [--backend-source-commit COMMIT] [--output /absolute/new.json]\nCreates a local proposal only. No URL registration, operator approval, HTTP, model or payment call occurs.";

function fail(message){throw new Error(message);}
function canonicalAbsolute(value,name){
 if(typeof value!=="string"||!path.isAbsolute(value)||path.normalize(value)!==value||value.includes("\0"))fail(`${name} must be a canonical absolute path.`);
 return value;
}
async function noSymlinkAncestors(value,{directory=true}={}){
 let current=path.parse(value).root;
 const parts=value.slice(current.length).split(path.sep).filter(Boolean);
 for(let i=0;i<parts.length;i++){
  if(PRIVATE_PART.test(parts[i])&&!(i===0&&parts[i]==="private"))fail("Private or hidden paths are not read by the registration helper.");
  current=path.join(current,parts[i]);
  const info=await lstat(current);
  if(info.isSymbolicLink())fail("Symbolic-link paths are not supported; supply the canonical folder directly.");
  if((i<parts.length-1||directory)&&!info.isDirectory())fail("A required directory is unavailable.");
 }
}
function unchanged(before,after){return before.dev===after.dev&&before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&after.isFile()&&after.nlink===1;}
async function boundedRead(filename,before,maxBytes){
 const handle=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  if(!unchanged(before,await handle.stat()))fail("A frontend file changed before reading; stop edits and try again.");
  const buffer=Buffer.alloc(maxBytes+1);let length=0;
  while(length<buffer.length){const result=await handle.read(buffer,length,buffer.length-length,length);if(!result.bytesRead)break;length+=result.bytesRead;}
  if(length>maxBytes)fail("A frontend file exceeds the allowed byte limit.");
  if(!unchanged(before,await handle.stat())||length!==before.size)fail("A frontend file changed during reading; stop edits and try again.");
  return buffer.subarray(0,length);
 }finally{await handle.close();}
}

/** Read only the explicitly named static export. A metadata-only first pass
 * rejects hidden/private/unsupported entries and all links before file reads.
 * No source is executed, fetched, installed or copied into the proposal. */
export async function snapshotFrontendFolder(folder){
 canonicalAbsolute(folder,"Frontend folder");await noSymlinkAncestors(folder);
 const inventory=[];let entries=0,textBytes=0,rasterBytes=0;
 async function walk(relative=""){
  const directory=relative?path.join(folder,relative):folder;
  for(const entry of await readdir(directory,{withFileTypes:true})){
   if(++entries>MAX_ENTRIES)fail("The frontend folder contains too many entries.");
   if(PRIVATE_PART.test(entry.name))fail("Private or hidden paths are not read by the registration helper.");
   const name=relative?`${relative}/${entry.name}`:entry.name;
   assertStaticPath(name);
   const filename=path.join(folder,...name.split("/")),info=await lstat(filename);
   if(info.isSymbolicLink())fail("Symbolic links in the frontend folder are not supported.");
   if(info.isDirectory()){await walk(name);continue;}
   if(!info.isFile()||info.nlink!==1)fail("Only independent regular static files are supported.");
   const kind=staticFileKind(name);if(!kind)fail("Unsupported frontend entry: supply only the exact HTML/CSS/PNG/JPEG/WebP export, with no other files.");
   if(inventory.length>=STATIC_RESOURCE_LIMITS.maxFiles)fail("The frontend export exceeds the40file limit.");
   const raster=["png","jpeg","webp"].includes(kind),limit=raster?STATIC_RESOURCE_LIMITS.rasterFileBytes:STATIC_RESOURCE_LIMITS.textFileBytes;
   if(info.size<1||info.size>limit)fail("A frontend file is empty or exceeds the allowed byte limit.");
   if(raster)rasterBytes+=info.size;else textBytes+=info.size;
   if(rasterBytes>STATIC_RESOURCE_LIMITS.rasterTotalBytes||textBytes>STATIC_RESOURCE_LIMITS.textTotalBytes)fail("The frontend export exceeds the total byte limit.");
   inventory.push({name,filename,info,kind,limit});
  }
 }
 await walk();
 if(!inventory.some(item=>item.name==="index.html"))fail("Include a root-level index.html in the frontend export.");
 const files=Object.create(null);
 for(const item of inventory){
  // Recheck each ancestor before opening; the descriptor must match the prior
  // inventory inode before bytes are read, and be unchanged afterwards.
  await noSymlinkAncestors(path.dirname(item.filename));
  const bytes=await boundedRead(item.filename,item.info,item.limit);
  files[item.name]=["html","css"].includes(item.kind)?new TextDecoder("utf-8",{fatal:true}).decode(bytes):encodeRasterDataUrl(item.name,bytes);
 }
 return validateStaticFiles(files);
}

function candidate(options,digest){return validateRuntimeRegistrationSnapshot({
 id:options["target-id"],label:options.label,projectId:options["project-id"],protocol:options.protocol??"booking-http-v2",
 baseUrl:options["base-url"],deploymentRevision:options["deployment-revision"],registrationRevision:options["registration-revision"],
 frontendBundleDigest:digest,expiresAt:options["expires-at"],testOnly:true,provenance:"operator-approved-declaration",
 ...(options["backend-artifact-digest"]!==undefined?{backendArtifactDigest:options["backend-artifact-digest"]}:{}),
 ...(options["backend-source-commit"]!==undefined?{backendSourceCommit:options["backend-source-commit"]}:{}),
});}
export async function createRuntimeRegistrationProposal(options,now=Date.now()){
 // Validate metadata and expiry before any frontend file content is read.
 const initial=candidate(options,"0".repeat(64));
 if(!Number.isFinite(now)||Date.parse(initial.expiresAt)<=now)fail("Choose a future registration expiry; this helper never renews an expired declaration.");
 const files=await snapshotFrontendFolder(options["frontend-folder"]),entry=candidate(options,await runtimeDeliveryDigest(files));
 return{schema:"proofbeforepay-runtime-registration-proposal-v1",status:"proposal-awaiting-operator-review",operatorApprovalRecorded:false,installed:false,
  candidate:entry,frontend:{fileCount:Object.keys(files).length,digestAlgorithm:"SHA-256 over JSON.stringify(Object.entries(savedFileMap).sort(([a],[b])=>a.localeCompare(b,'en')))",files:Object.keys(files).sort()},
  limits:["This file is a proposal, not operator approval or installation. The provenance field describes the required installed-entry format only.","An operator must verify the authorised test-only staging destination and review this candidate before configuring the server registry.","Frontend digest and optional backend artifact/commit values are declarations, not deployed-code attestation.","No HTTP, model, payment, credentials, backend code execution or private configuration is used by this helper."]};
}
function parse(args){
 const result={};for(let i=0;i<args.length;i+=2){const flag=args[i];if(!flag?.startsWith("--")||!FLAGS.has(flag.slice(2))||i+1>=args.length||Object.hasOwn(result,flag.slice(2)))fail(HELP);result[flag.slice(2)]=args[i+1];}
 for(const key of ["project-id","target-id","label","base-url","deployment-revision","registration-revision","expires-at","frontend-folder"])if(!result[key])fail(HELP);
 return result;
}
async function writeNew(output,text,folder){
 canonicalAbsolute(output,"Output");if(path.extname(output)!==".json")fail("Write the proposal to a new .json file.");
 const root=canonicalAbsolute(folder,"Frontend folder"),relative=path.relative(root,output);
 if(!relative.startsWith(`..${path.sep}`)&&relative!==".."&&!path.isAbsolute(relative))fail("Save the proposal outside the frontend export so it cannot change that bundle.");
 await noSymlinkAncestors(path.dirname(output));
 if(PRIVATE_PART.test(path.basename(output)))fail("Private or hidden output paths are not supported.");
 const handle=await open(output,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await handle.writeFile(text,"utf8");}finally{await handle.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{
  if(process.argv.length===3&&process.argv[2]==="--help"){process.stdout.write(HELP+"\n");}
  else{const options=parse(process.argv.slice(2)),proposal=await createRuntimeRegistrationProposal(options),text=JSON.stringify(proposal,null,2)+"\n";if(options.output){await writeNew(options.output,text,options["frontend-folder"]);process.stdout.write("Registration proposal saved locally; operator review and server installation remain required.\n");}else process.stdout.write(text);}
 }catch(error){process.stderr.write((error instanceof Error?error.message:"Registration proposal unavailable")+"\n");process.exitCode=1;}
}
