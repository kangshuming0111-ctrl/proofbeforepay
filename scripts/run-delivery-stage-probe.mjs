#!/usr/bin/env node
/** Explicitly executes a seller-selected LOCAL adapter. Never import a browser
 * upload. Use only reviewed adapters against isolated synthetic staging data. */
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createDeliveryStageProbe} from '../lib/delivery-stage-probe.ts';
import {validateDeliveryStagePlan} from '../lib/delivery-stage-evidence.ts';
export async function runDeliveryStageProbeCli(args){
  if(args.length!==6||args[0]!=='--plan'||args[2]!=='--adapter'||args[4]!=='--output')throw Error('USAGE: --plan <local-plan.json> --adapter <reviewed-local-adapter.mjs> --output <new-report.json>');
  let planFile=path.resolve(args[1]),adapterFile=path.resolve(args[3]);const output=path.resolve(args[5]);
  for(const [file,limit]of [[planFile,16384],[adapterFile,65536]]){const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error('INVALID_LOCAL_STAGE_INPUT');}
  planFile=await realpath(planFile);adapterFile=await realpath(adapterFile);
  // Validate all declarative input and reserve a new output before any imported
  // module can execute. A module is code, not a trusted evidence packet.
  const plan=validateDeliveryStagePlan(JSON.parse(await readFile(planFile,'utf8')));
  const handle=await (await import('node:fs/promises')).open(output,'wx',0o600);
  try{
    const module=await import(pathToFileURL(adapterFile).href);
    if(typeof module.createAdapter!=='function')throw Error('LOCAL_ADAPTER_FACTORY_REQUIRED');
    const adapter=await module.createAdapter({plan:structuredClone(plan)});
    try{const report=await createDeliveryStageProbe(adapter.stages).run(plan);await handle.writeFile(JSON.stringify(report,null,2)+'\n');return {recorded:true,reportDigest:report.digest,summary:report.summary,realModelCalls:0};}
    finally{if(typeof adapter.close==='function')await adapter.close();}
  }finally{await handle.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(await runDeliveryStageProbeCli(process.argv.slice(2)),null,2));}
 catch(error){console.error(error?.code==='EEXIST'?'STAGE_REPORT_ALREADY_EXISTS':error instanceof Error&&/^[A-Z][A-Z0-9_: <>().-]{0,220}$/u.test(error.message)?error.message:'STAGE_PROBE_FAILED');process.exitCode=1;}
}
