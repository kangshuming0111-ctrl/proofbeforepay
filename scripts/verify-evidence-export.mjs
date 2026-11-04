#!/usr/bin/env node
import {open,lstat} from "node:fs/promises";
import {constants} from "node:fs";
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {verifyEvidenceBundle,EVIDENCE_BUNDLE_BYTE_LIMIT} from "../lib/evidence-bundle.ts";

/** Bounded regular-file input only. No source execution, credentials, environment
 * configuration or network access are needed by this command. */
export async function readEvidenceFile(filename){
  const before=await lstat(filename);
  if(before.isSymbolicLink()||!before.isFile()||before.size>EVIDENCE_BUNDLE_BYTE_LIMIT)throw new Error("Use a regular, non-symlink evidence JSON file within the byte limit.");
  const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const current=await file.stat();
    if(!current.isFile()||current.dev!==before.dev||current.ino!==before.ino)throw new Error("The evidence file changed while opening.");
    const bytes=Buffer.alloc(EVIDENCE_BUNDLE_BYTE_LIMIT+1);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)break;offset+=bytesRead;}
    if(offset>EVIDENCE_BUNDLE_BYTE_LIMIT)throw new Error("The evidence file exceeds the byte limit.");
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(0,offset)));
  }finally{await file.close();}
}
export async function verifyEvidenceFile(filename){return verifyEvidenceBundle(await readEvidenceFile(filename));}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args.length!==1){process.stderr.write("Usage: node --experimental-strip-types scripts/verify-evidence-export.mjs /path/to/evidence.json\n");process.exitCode=2;}
  else try{
    const report=await verifyEvidenceFile(args[0]);process.stdout.write(JSON.stringify(report,null,2)+"\n");
    process.exitCode=report.consistency==="consistent"?0:report.consistency==="unsupported"?2:1;
  }catch{
    process.stdout.write(JSON.stringify({schema:"proofbeforepay-evidence-verification-v1",consistency:"unsupported",error:"Could not read a bounded regular UTF-8 evidence JSON file. No evidence source was executed and no network request was made."},null,2)+"\n");process.exitCode=2;
  }
}
