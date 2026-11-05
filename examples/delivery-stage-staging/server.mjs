import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const profiles=['fixed','no-store','wrong-readback','no-email'];
/** Disposable loopback-only native enquiry app. No checker/verdict imports. */
export async function startStageStaging({database,profile='fixed'}){
 if(!profiles.includes(profile))throw Error('Unknown staging profile');
 const db=new DatabaseSync(database);db.exec('CREATE TABLE IF NOT EXISTS enquiries (id TEXT PRIMARY KEY, marker TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, payload_digest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS test_mail (id TEXT PRIMARY KEY, record_id TEXT NOT NULL, marker TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL, payload_digest TEXT NOT NULL)');
 const send=(response,status,body)=>{response.writeHead(status,{'content-type':'application/json'});response.end(JSON.stringify(body));};
 let sequence=0;
 const server=http.createServer(async(request,response)=>{
  try{
   const url=new URL(request.url,'http://127.0.0.1');
   if(request.method==='POST'&&url.pathname==='/enquiries'){
    let body='';for await(const chunk of request){body+=chunk;if(body.length>4096){send(response,413,{error:'too-large'});return;}}
    const input=JSON.parse(body);
    if(Object.keys(input).sort().join('|')!=='marker|message|subject'||!/^stage-[a-z0-9-]{1,80}$/u.test(input.marker)||input.subject!=='PBP synthetic enquiry'||input.message!=='Synthetic staged delivery test'){send(response,400,{error:'synthetic-only'});return;}
    const id='enquiry-'+(++sequence),payloadDigest=createHash('sha256').update(JSON.stringify({subject:input.subject,message:input.message})).digest('hex');
    if(profile!=='no-store')db.prepare('INSERT INTO enquiries VALUES (?,?,?,?,?)').run(id,input.marker,input.subject,input.message,payloadDigest);
    if(profile!=='no-email')db.prepare('INSERT INTO test_mail VALUES (?,?,?,?,?,?)').run('mail-'+sequence,id,input.marker,input.subject,input.message,payloadDigest);
    send(response,201,{id,marker:input.marker,subject:input.subject,message:input.message});return;
   }
   send(response,404,{error:'not-found'});
  }catch{send(response,500,{error:'native-operation-failed'});}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {origin:'http://127.0.0.1:'+server.address().port,
  readStored(recordId){return db.prepare('SELECT id,marker,subject,message,payload_digest FROM enquiries WHERE id=?').get(recordId)??null;},
  readFresh(recordId){const connection=new DatabaseSync(database,{readOnly:true});try{const record=connection.prepare('SELECT id,marker,subject,message,payload_digest FROM enquiries WHERE id=?').get(recordId)??null;return profile==='wrong-readback'&&record?{...record,id:'different-enquiry'}:record;}finally{connection.close();}},
  readInbox(recordId){return db.prepare('SELECT id,record_id,marker,subject,message,payload_digest FROM test_mail WHERE record_id=?').get(recordId)??null;},
  async close(){await new Promise(resolve=>server.close(resolve));db.close();}
 };
}
