import assert from "node:assert/strict";
import test from "node:test";
import {diagnoseRuntimeMetadata} from "../lib/runtime-metadata.ts";
import type {RuntimeRegistrationSnapshot} from "../lib/runtime-registration.ts";

const registration:RuntimeRegistrationSnapshot={id:"seller-staging",label:"Seller staging",projectId:"project-1",registrationRevision:"review-1",protocol:"booking-http-v2",baseUrl:"https://seller.example.org/pbp/",deploymentRevision:"seller-build-1",frontendBundleDigest:"a".repeat(64),backendArtifactDigest:"b".repeat(64),backendSourceCommit:"c".repeat(40),expiresAt:"2036-11-03T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"};
const expected={revision:registration.deploymentRevision,protocol:registration.protocol,registration};
const metadata=()=>({revision:registration.deploymentRevision,protocol:registration.protocol,projectId:registration.projectId,registrationRevision:registration.registrationRevision,frontendBundleDigest:registration.frontendBundleDigest,backendArtifactDigest:registration.backendArtifactDigest,backendSourceCommit:registration.backendSourceCommit});

test("legacy v1 remains revision-only while every explicit newer protocol requires its exact name",()=>{
  assert.equal(diagnoseRuntimeMetadata({revision:"legacy-1"},{revision:"legacy-1",protocol:"booking-http-v1"}).matches,true);
  assert.deepEqual(diagnoseRuntimeMetadata({revision:"new-1"},{revision:"new-1",protocol:"booking-http-v2"}).missing,["protocol"]);
  assert.deepEqual(diagnoseRuntimeMetadata({revision:"new-1",protocol:"booking-http-v2"},{revision:"new-1",protocol:"booking-http-v3"}).mismatch,["protocol"]);
  assert.equal(diagnoseRuntimeMetadata({revision:"new-1",protocol:"booking-http-v3"},{revision:"new-1",protocol:"booking-http-v3"}).matches,true);
  assert.equal(diagnoseRuntimeMetadata({revision:"new-1",protocol:"booking-http-v4"},{revision:"new-1",protocol:"booking-http-v4"}).matches,true);
  assert.deepEqual(diagnoseRuntimeMetadata({revision:"new-1",protocol:"booking-http-v3"},{revision:"new-1",protocol:"booking-http-v4"}).mismatch,["protocol"]);
  assert.deepEqual(diagnoseRuntimeMetadata({revision:"new-1"},{revision:"new-1",protocol:"booking-http-v4"}).missing,["protocol"]);
  assert.deepEqual(diagnoseRuntimeMetadata({revision:"new-1",protocol:"booking-http-v5"},{revision:"new-1",protocol:"booking-http-v4"}).malformed,["protocol"]);
});

test("all pinned association declarations must match; unrelated response data is never retained",()=>{
  const input={...metadata(),privateExtra:"PRIVATE-RESPONSE-DO-NOT-RETAIN",maxPartySize:999},before=structuredClone(input);
  const result=diagnoseRuntimeMetadata(input,expected);
  assert.deepEqual(result,{matches:true,missing:[],mismatch:[],malformed:[]});assert.deepEqual(input,before);
  assert.equal(JSON.stringify(result).includes("PRIVATE"),false);assert.equal(JSON.stringify(result).includes("999"),false);
  const wrong={revision:"different-build",protocol:"booking-http-v1",projectId:"other-project",registrationRevision:"review-2",frontendBundleDigest:"d".repeat(64),backendArtifactDigest:"e".repeat(64),backendSourceCommit:"f".repeat(40)};
  assert.deepEqual(diagnoseRuntimeMetadata(wrong,expected),{matches:false,missing:[],mismatch:["revision","protocol","projectId","registrationRevision","frontendBundleDigest","backendArtifactDigest","backendSourceCommit"],malformed:[]});
});

test("missing values, malformed values and valid-but-wrong declarations remain distinct controlled field names",()=>{
  const source=metadata();delete(source as Partial<typeof source>).projectId;
  const input={...source,revision:17,registrationRevision:"bad/review",frontendBundleDigest:"A".repeat(64),backendArtifactDigest:"short",backendSourceCommit:"branch-name"};
  assert.deepEqual(diagnoseRuntimeMetadata(input,expected),{matches:false,missing:["projectId"],mismatch:[],malformed:["revision","registrationRevision","frontendBundleDigest","backendArtifactDigest","backendSourceCommit"]});
  const optional={...registration};delete optional.backendArtifactDigest;delete optional.backendSourceCommit;
  assert.equal(diagnoseRuntimeMetadata({...metadata(),backendArtifactDigest:17,backendSourceCommit:"PRIVATE"},{...expected,registration:optional}).matches,true);
});

test("invalid JSON object shapes and accessors cannot supply a matching metadata declaration",()=>{
  for(const value of [null,[],true,"raw source",Object.create(null)])assert.deepEqual(diagnoseRuntimeMetadata(value,expected),{matches:false,missing:[],mismatch:[],malformed:["metadata"]});
  let getterCalls=0;const input=metadata();Object.defineProperty(input,"revision",{get(){getterCalls++;throw new Error("must not execute");}});
  assert.deepEqual(diagnoseRuntimeMetadata(input,expected).malformed,["revision"]);assert.equal(getterCalls,0);
});
