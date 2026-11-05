#!/usr/bin/env node
import {pathToFileURL} from "node:url";
import {resolve} from "node:path";
import {readEvidenceFile} from "./verify-evidence-export.mjs";
import {verifyRevisionAudit} from "../lib/revision-audit.ts";
import {ISSUED_REVISION_AUDIT_SCHEMA,verifyIssuedRevisionAudit} from "../lib/issued-revision-audit.ts";

/** Same bounded non-symlink UTF-8 reader as the unchanged single-version CLI. */
export async function verifyRevisionAuditFile(filename){
 const value=await readEvidenceFile(filename),row=value&&typeof value==="object"?value:undefined;
 // Recognizable issued envelopes, including schema tampering, are never
 // retried as unsigned core records after a receipt failure.
 if(row&&(row.schema===ISSUED_REVISION_AUDIT_SCHEMA||Object.hasOwn(row,"audit")||Object.hasOwn(row,"receipt")))return verifyIssuedRevisionAudit(value);
 return{...await verifyRevisionAudit(value),issuance:{status:"unproven",reason:"unsigned_revision_core"}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 if(args.length!==1){process.stderr.write("Usage: node --experimental-strip-types scripts/verify-revision-audit.mjs /path/to/revision-audit.json\n");process.exitCode=2;}
 else try{const report=await verifyRevisionAuditFile(args[0]);process.stdout.write(JSON.stringify(report,null,2)+"\n");process.exitCode=report.consistency==="consistent"?0:report.consistency==="unsupported"?2:1;}
 catch{process.stdout.write(JSON.stringify({schema:"proofbeforepay-revision-audit-verification-v1",consistency:"unsupported",error:"Could not read a bounded regular UTF-8 revision JSON file. No source was executed or reconstructed and no network request was made."},null,2)+"\n");process.exitCode=2;}
}
