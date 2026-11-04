#!/usr/bin/env node
/** Two explicit bounded local files only. No network, page execution or writes. */
import {open,lstat} from "node:fs/promises";
import {constants} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {checkSellerOnboarding} from "../lib/seller-onboarding.ts";

async function readLocalFile(name,limit){
 const absolute=path.resolve(name),parts=absolute.split(path.sep).filter(Boolean);let current=path.parse(absolute).root;
 for(const part of parts){current=path.join(current,part);if((await lstat(current)).isSymbolicLink())throw new Error("symlink_input_rejected");}
 const handle=await open(absolute,constants.O_RDONLY|constants.O_NOFOLLOW);try{const stat=await handle.stat();if(!stat.isFile()||stat.size>limit)throw new Error("input_size_or_type_rejected");const bytes=Buffer.alloc(limit+1),{bytesRead}=await handle.read(bytes,0,limit+1,0);if(bytesRead>limit)throw new Error("input_size_or_type_rejected");return new TextDecoder("utf-8",{fatal:true}).decode(bytes.subarray(0,bytesRead));}finally{await handle.close();}
}
export async function runPreflight(args){
 if(args.length!==2)throw new Error("usage: node --experimental-strip-types scripts/seller-onboarding-preflight.mjs /path/pbp-onboarding.json /path/index.html");
 const config=JSON.parse(await readLocalFile(args[0],32*1024)),html=await readLocalFile(args[1],256*1024);return checkSellerOnboarding(config,html);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const result=await runPreflight(process.argv.slice(2));process.stdout.write(JSON.stringify(result,null,2)+"\n");process.exitCode=result.staticMarkupReady?0:1;}
 catch(error){const known=error instanceof Error&&/^(?:usage:|symlink_input_rejected|input_size_or_type_rejected)/u.test(error.message);process.stderr.write(JSON.stringify({error:known?error.message:"local_input_unreadable_or_invalid",networkRequests:0,pageScriptsExecuted:false})+"\n");process.exitCode=2;}
}
