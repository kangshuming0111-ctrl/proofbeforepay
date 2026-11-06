/** Opt-in, reviewed local code. Unchanged official app, disposable loopback DB. */
import {spawn,spawnSync} from 'node:child_process';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
const base=path.dirname(fileURLToPath(import.meta.url));
export const FASTAPI_REVISION='628c34e0cae200564d191c95d7edea78c88c4b5e';
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const fastapiPayloadDigest=runId=>digest({name:runId,age:18,secret_name:'PBP synthetic label'});
export async function createAdapter({plan}){
 const python=process.env.PBP_FASTAPI_PYTHON,source=path.join(base,'upstream.py');
 if(!python||!path.isAbsolute(python)||plan.scope.sourceRevision!==FASTAPI_REVISION||plan.payloadDigest!==fastapiPayloadDigest(plan.runId)||plan.stages[3].coverage!=='unsupported')throw Error('FASTAPI_PINNED_PLAN_AND_RUNTIME_REQUIRED');
 if(createHash('sha256').update(await readFile(source)).digest('hex')!=='6e09a1bf5f78a7d69e7d631a0697001a4e819d2b51898e9fc9a7eac488c9679b')throw Error('FASTAPI_SOURCE_CHANGED');
 const version=spawnSync(python,['-c','import importlib.metadata,json;print(json.dumps({k:importlib.metadata.version(k) for k in ("fastapi","sqlmodel","uvicorn")}))'],{encoding:'utf8'});
 if(version.status!==0||JSON.stringify(JSON.parse(version.stdout))!==JSON.stringify({fastapi:'0.115.12',sqlmodel:'0.0.24',uvicorn:'0.34.2'}))throw Error('FASTAPI_RUNTIME_VERSION_REQUIRED');
 const directory=await mkdtemp(path.join(tmpdir(),'pbp-fastapi-stage-')),database=path.join(directory,'database.db');
 let child,origin,recordId,requests=0;
 async function stop(){if(child&&child.exitCode===null){const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),3000);try{await ended;}finally{clearTimeout(timer);}}}
 async function call(route,payload,signal){requests++;const response=await fetch(origin+route,{method:payload?'POST':'GET',headers:payload?{'content-type':'application/json'}:{},body:payload?JSON.stringify(payload):undefined,redirect:'error',signal});if(response.status!==200)throw Error('FASTAPI_NATIVE_REQUEST_FAILED');return response.json();}
 async function start(){
  child=spawn(python,[path.join(base,'serve.py'),source],{cwd:directory,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH??'',PYTHONUNBUFFERED:'1'}});
  const info=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('FASTAPI_START_TIMEOUT')),5000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',()=>{clearTimeout(timer);reject(Error('FASTAPI_EXITED'));});child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(text.split('\n')[0]));}catch{reject(Error('FASTAPI_START_INVALID'));}}});});
  if(!Number.isInteger(info.port)||info.port<1||info.port>65535)throw Error('FASTAPI_START_INVALID');origin='http://127.0.0.1:'+info.port;
  // Readiness GETs only; no native write is ever repeated.
  for(let attempt=0;attempt<30;attempt++){try{await call('/heroes/',undefined,AbortSignal.timeout(500));return;}catch{if(child.exitCode!==null)throw Error('FASTAPI_EXITED');await new Promise(resolve=>setTimeout(resolve,30));}}
  throw Error('FASTAPI_READY_TIMEOUT');
 }
 const record=value=>({recordId:'hero-'+value.id,payloadDigest:digest({name:value.name,age:value.age,secret_name:value.secret_name})});
 function native(){const result=spawnSync(python,['-c','import sqlite3,json,sys;c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True);rows=c.execute("SELECT id,name,age,secret_name FROM hero WHERE name=?",(sys.argv[2],)).fetchall();c.close();assert len(rows)==1;print(json.dumps(dict(zip(("id","name","age","secret_name"),rows[0]))))',database,plan.runId],{encoding:'utf8',timeout:3000});if(result.status!==0)throw Error('FASTAPI_NATIVE_READ_FAILED');return record(JSON.parse(result.stdout));}
 const observation=stage=>({outcome:'observed',stage,runId:plan.runId,sourceRevision:FASTAPI_REVISION});
 try{await start();}catch(error){await stop();await rm(directory,{recursive:true,force:true});throw error;}
 return{stages:{
  async submit({signal}){const created=await call('/heroes/',{name:plan.runId,age:18,secret_name:'PBP synthetic label'},signal),row=record(created);recordId=row.recordId;return{...observation('submit'),accepted:true,operationId:'native-http-create-hero',record:row};},
  async stored_record(){return{...observation('stored_record'),reader:'native_store',connectionId:'sqlite-before-app-restart',record:native()};},
  async fresh_readback({signal}){await stop();await start();const row=record(await call('/heroes/'+recordId.slice(5),undefined,signal)),stored=native();return{...observation('fresh_readback'),reader:'fresh_connection',connectionId:'sqlite-after-app-restart',record:row.recordId===stored.recordId&&row.payloadDigest===stored.payloadDigest?stored:null};},
 },async close(){await stop();await rm(directory,{recursive:true,force:true});},counts(){return{actualHttpRequests:requests,nativeWriteRetries:0};}};
}
