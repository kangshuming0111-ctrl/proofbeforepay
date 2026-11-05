import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url)),PINNED_COMMIT='2c1b30d0503cfb064f1cb252e6614a06915a362a';
const payloadDigest=(title,body)=>createHash('sha256').update(JSON.stringify({title,body})).digest('hex');
export async function createAdapter({plan}){
 const python=process.env.PBP_FLASK_PYTHON,upstream=process.env.PBP_FLASK_SOURCE;
 if(!python||!upstream||!path.isAbsolute(python)||!path.isAbsolute(upstream)||plan.scope.sourceRevision!==PINNED_COMMIT)throw Error('FLASK_PINNED_SOURCE_REQUIRED');
 const head=spawnSync('git',['-C',upstream,'rev-parse','HEAD'],{encoding:'utf8'}),dirty=spawnSync('git',['-C',upstream,'status','--porcelain','--untracked-files=all','--','examples/tutorial'],{encoding:'utf8'});
 if(head.status!==0||head.stdout.trim()!==PINNED_COMMIT||dirty.status!==0||dirty.stdout.trim())throw Error('FLASK_SOURCE_CHANGED');
 const version=spawnSync(python,['-c','import importlib.metadata; print(importlib.metadata.version("flask"))'],{encoding:'utf8'});if(version.status!==0||version.stdout.trim()!=='3.1.2')throw Error('FLASK_RUNTIME_VERSION_REQUIRED');
 const dir=await mkdtemp(path.join(tmpdir(),'pbp-flask-stage-'));const database=path.join(dir,'native.sqlite');let child,origin,cookie,recordId,requests=0;
 async function start(init){
  child=spawn(python,[path.join(root,'serve.py'),'--source',upstream,'--database',database,...(init?['--init']:[])],{stdio:['ignore','pipe','ignore']});
  const info=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('FLASK_START_TIMEOUT')),5000);child.once('error',reject);child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n')){clearTimeout(timer);try{resolve(JSON.parse(text.split('\n')[0]));}catch{reject(Error('FLASK_START_INVALID'));}}});child.once('exit',()=>{clearTimeout(timer);reject(Error('FLASK_EXITED'));});});origin='http://127.0.0.1:'+info.port;
 }
 async function stop(){if(child&&child.exitCode===null){const closing=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await closing;}}
 async function call(route,fields,signal){requests++;return fetch(origin+route,{method:fields?'POST':'GET',body:fields?new URLSearchParams(fields):undefined,headers:cookie?{cookie}:{},redirect:'manual',signal});}
 function fromPage(html){
  for(const match of html.matchAll(/<article class="post">([\s\S]*?)<\/article>/gu)){
   const title=/<h1>([^<]*)<\/h1>/u.exec(match[1])?.[1],body=/<p class="body">([\s\S]*?)<\/p>/u.exec(match[1])?.[1],id=/href="\/(\d+)\/update"/u.exec(match[1])?.[1];
   if(title===plan.runId&&body!==undefined&&id)return {recordId:'post-'+id,payloadDigest:payloadDigest(title,body)};
  }return null;
 }
 function nativeRow(){
  const p=spawnSync(python,['-c','import sqlite3,json,sys; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); row=c.execute("SELECT id,title,body FROM post WHERE title=?",(sys.argv[2],)).fetchone(); c.close(); print(json.dumps(row))',database,plan.runId],{encoding:'utf8'});if(p.status!==0)throw Error('FLASK_NATIVE_READ_FAILED');const row=JSON.parse(p.stdout);return row?{recordId:'post-'+row[0],payloadDigest:payloadDigest(row[1],row[2])}:null;
 }
 const base=stage=>({outcome:'observed',stage,runId:plan.runId,sourceRevision:plan.scope.sourceRevision});
 try{await start(true);}catch(error){await stop();await rm(dir,{recursive:true,force:true});throw error;}
 return {stages:{
  async submit({signal}){
   const username='pbp_'+randomUUID().replaceAll('-','').slice(0,12),password=randomUUID();
   const register=await call('/auth/register',{username,password},signal);if(register.status!==302)throw Error('FLASK_REGISTER_FAILED');
   const login=await call('/auth/login',{username,password},signal);cookie=login.headers.getSetCookie()[0]?.split(';')[0];if(login.status!==302||!cookie)throw Error('FLASK_LOGIN_FAILED');
   const posted=await call('/create',{title:plan.runId,body:'PBP synthetic body'},signal);const page=await call('/',undefined,signal),record=fromPage(await page.text());recordId=record?.recordId;
   return {...base('submit'),accepted:posted.status===302&&page.status===200,operationId:'native-http-create-post',record};
  },
  async stored_record(){return {...base('stored_record'),reader:'native_store',connectionId:'sqlite-probe-before-restart',record:nativeRow()};},
  async fresh_readback({signal}){
   await stop();await start(false);cookie=undefined;
   // A new public page request checks the same original application after restart.
   // The fresh independent SQLite read is not substituted by the prior response.
   const page=await call('/',undefined,signal),html=await page.text(),row=nativeRow();
   const pageHasRecord=html.includes('<h1>'+plan.runId+'</h1>')&&html.includes('<p class="body">PBP synthetic body</p>');
   return {...base('fresh_readback'),reader:'fresh_connection',connectionId:'sqlite-probe-after-application-restart',record:page.status===200&&pageHasRecord&&row?.recordId===recordId?row:null};
  }
 },async close(){await stop();await rm(dir,{recursive:true,force:true});},counts(){return {actualHttpRequests:requests};}};
}
