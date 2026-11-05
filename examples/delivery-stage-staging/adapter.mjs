import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {startStageStaging} from './server.mjs';
/** This adapter owns its native connection/HTTP details. The runner has no
 * endpoint discovery and never interprets a success page as a stored record. */
export async function createAdapter({plan,profile='fixed'}){
 const dir=await mkdtemp(path.join(tmpdir(),'pbp-stage-staging-'));
 const native=await startStageStaging({database:path.join(dir,'native.sqlite'),profile});let recordId;
 const base=stage=>({outcome:'observed',stage,runId:plan.runId,sourceRevision:plan.scope.sourceRevision});
 const actualDigest=row=>createHash('sha256').update(JSON.stringify({subject:row.subject,message:row.message})).digest('hex');
 const record=row=>row?{recordId:row.id,payloadDigest:actualDigest(row)}:null;
 return {stages:{
  async submit({signal}){const r=await fetch(native.origin+'/enquiries',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({marker:plan.runId,subject:'PBP synthetic enquiry',message:'Synthetic staged delivery test'}),signal});const body=await r.json();recordId=body.id;return {...base('submit'),runId:body.marker??plan.runId,accepted:r.status===201,operationId:'native-enquiry-post',record:r.status===201?{recordId:body.id,payloadDigest:actualDigest(body)}:null};},
  async stored_record(){const row=native.readStored(recordId);return {...base('stored_record'),runId:row?.marker??plan.runId,connectionId:'writer-native-connection',reader:'native_store',record:record(row)};},
  async fresh_readback(){const row=native.readFresh(recordId);return {...base('fresh_readback'),runId:row?.marker??plan.runId,connectionId:'fresh-'+randomUUID(),reader:'fresh_connection',record:record(row)};},
  async email_receipt(){const row=native.readInbox(recordId);return {...base('email_receipt'),runId:row?.marker??plan.runId,transport:'test_sink',receipt:row?{receiptId:row.id,recordId:row.record_id,payloadDigest:actualDigest(row)}:null};}
 },async close(){await native.close();await rm(dir,{recursive:true,force:true});}};
}
