import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {verifyTransferExport,type TransferExport} from '../lib/transfer-competition.ts';
import {runtimeDeliveryDigest} from '../lib/runtime-project.ts';
test('recorded hosted transfer evidence and independent native rows agree without replaying any requests',async()=>{
 const root=new URL('./fixtures/recorded-transfer-competition/',import.meta.url),packet=JSON.parse(await readFile(new URL('evidence.json',root),'utf8'))as TransferExport,db=JSON.parse(await readFile(new URL('native-db-read.json',root),'utf8')),files=JSON.parse(await readFile(new URL('declared-files.json',root),'utf8'));
 const oldFetch=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Offline record verification must not replay requests');};try{
  assert.equal(verifyTransferExport(packet).consistency,'consistent');assert.equal(packet.report.result.outcome,'compatible');assert.equal(packet.report.trace.length,24);assert.equal(packet.report.trace.filter(r=>r.method==='POST').length,5);assert.equal(await runtimeDeliveryDigest(files),packet.report.deliveryDigest);assert.equal(db.runId,packet.report.runId);assert.equal(db.rows.length,3);
  for(const alias of['x','y','z']as const){const actual=packet.report.trace.find(r=>r.operationId===`final_${alias}`)!.body as Record<string,unknown>,native=db.rows.find((r:{id:string})=>r.id===actual.id);assert.ok(native);assert.equal(native.slot,actual.slot);assert.equal(native.party_size,actual.partySize);assert.equal(native.status,actual.status);assert.equal(native.idempotency_key,actual.idempotencyKey);}
  const target=packet.report.trace.find(r=>r.operationId==='final_c')!.body as Record<string,unknown>;assert.equal(target.guestCount,8);assert.equal(db.rows.filter((r:{slot:string})=>r.slot===target.slot).reduce((sum:number,r:{party_size:number})=>sum+r.party_size,0),8);assert.equal(packet.summary.originals.y,'preserved');assert.equal(packet.summary.otherBookingUnchanged,true);
  const bad=structuredClone(packet);bad.report.result.outcome='violated';assert.throws(()=>verifyTransferExport(bad));assert.equal(calls,0);
 }finally{globalThis.fetch=oldFetch;}
});
