import assert from "node:assert/strict";
import test from "node:test";
import {JOURNEY_STEP_IDS,JOURNEY_SLOTS,journeyKey,type JourneyObservation} from "../lib/journey-checks.ts";
import {newProjectJourneyPlan,evaluateStoredProjectJourneyReport,validateStoredProjectJourneyReport,type ProjectJourneyReport} from "../lib/project-journey.ts";
import {projectJourneyStepLabel,projectJourneyUnavailableLabel,draftProjectJourneyFeedback} from "../lib/project-journey-display.ts";

function fixture():ProjectJourneyReport{
 const runId="12345678-1234-4234-8234-123456789abc",digest="a".repeat(64),at="2026-11-03T00:00:00.000Z",plan=newProjectJourneyPlan(at),base="/custom-seller/pbp/";
 return{id:"saved-report-A",runId,deliveryId:"saved-delivery-A",deliveryDigest:digest,planDigest:plan.planDigest,plan,registration:{id:"seller-a",label:"Developer-operated reference",projectId:"project-a",registrationRevision:"r1",protocol:"booking-lifecycle-http-v1",recipe:"booking-lifecycle-20-v1",frontendEntryUrl:"https://seller.example/seller.html",backendBaseUrl:"https://seller.example"+base,deploymentRevision:"lifecycle-fixed-v1",frontendBundleDigest:digest,scenario:"fixed",expiresAt:"2099-01-01T00:00:00.000Z",testOnly:true,provenance:"operator-approved-declaration"},receivedAt:at,reportedByRole:"buyer",observer:"client-controlled-browser-with-server-readbacks",browserAttestation:false,input:{runId,scenario:"fixed",startedAt:at,finishedAt:at,frontendEntry:"https://seller.example/seller.html?run="+runId,frontendDigest:digest,metadata:{},observations:JOURNEY_STEP_IDS.map(id=>({id,unavailableReason:id==="meta"?"server_read_timeout":"prerequisite_not_observed"}))}};
}
function put(report:ProjectJourneyReport,observation:JourneyObservation){report.input.observations[JOURNEY_STEP_IDS.indexOf(observation.id)]=observation;}
function metadata(report:ProjectJourneyReport){const body={protocol:"booking-lifecycle-http-v1",revision:"lifecycle-fixed-v1",maxPartySize:6,maxGuestsPerSlot:8,syntheticOnly:true,deploymentAttestation:false};report.input.metadata=body;put(report,{id:"meta",requests:[{method:"GET",path:new URL(report.registration.backendBaseUrl).pathname+"meta",status:200,response:body}]});}
function create(report:ProjectJourneyReport,party=5){const body={testRunId:report.runId,marker:`PBP-${report.runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:JOURNEY_SLOTS.a,partySize:party};put(report,{id:"create",ui:{actionId:"create",status:"success",message:"PRIVATE_PAGE_TEXT_😀".repeat(40),fields:{operation:"create",partySize:"5",slot:JOURNEY_SLOTS.a}},requests:[{method:"POST",path:new URL(report.registration.backendBaseUrl).pathname+"bookings",key:journeyKey(report.runId,"cancel-create"),status:201,request:body,response:{...body,id:"booking-a",status:"active",revision:"lifecycle-fixed-v1",idempotencyKey:journeyKey(report.runId,"cancel-create")}}]});}
function assertBounded(value:string){assert.ok(value.length<=1000,`UTF16 length ${value.length}`);for(let i=0;i<value.length;i++){const unit=value.charCodeAt(i);if(unit>=0xd800&&unit<=0xdbff){assert.ok(i+1<value.length);const next=value.charCodeAt(++i);assert.ok(next>=0xdc00&&next<=0xdfff);}else assert.ok(unit<0xdc00||unit>0xdfff);}}

test("all twenty labels are readable in both languages and unknown IDs never echo caller text",()=>{
 for(const language of["zh","en"]as const){for(const id of JOURNEY_STEP_IDS){const label=projectJourneyStepLabel(id,language);assert.ok(label.length>3);assert.notEqual(label,id);assert.ok(!label.includes("_"));}assert.ok(!projectJourneyStepLabel("PRIVATE_UNKNOWN_STEP",language).includes("PRIVATE"));}
 assert.match(projectJourneyStepLabel("move_full_readback","zh"),/保留原预约/);assert.match(projectJourneyStepLabel("response_loss_retry","en"),/duplicates/);
});
test("unknown reasons explain prerequisites, server problems and stop semantics without converting them to failed work",()=>{
 assert.match(projectJourneyUnavailableLabel("prerequisite_not_observed","zh"),/前面.*未确认/);
 for(const reason of["server_read_timeout","server_read_unavailable","redirect_blocked","network_unavailable","server_fetch_configuration"]){assert.match(projectJourneyUnavailableLabel(reason,"en"),/unverified|functionality|verdict|not a seller defect/);assert.match(projectJourneyUnavailableLabel(reason,"zh"),/不能|不代表/);}
 assert.match(projectJourneyUnavailableLabel("evidence_size_limit; discarded","zh"),/保存上限/);assert.match(projectJourneyUnavailableLabel("run_closed_without_further_network; prior browser writes may have committed","en"),/not rollback/);assert.match(projectJourneyUnavailableLabel("seller_bridge_timeout_external_outcome_unknown","zh"),/不会回滚/);
 assert.ok(!projectJourneyUnavailableLabel("PRIVATE_UNKNOWN_REASON","en").includes("PRIVATE"));
});
test("a wrong-party finding cites the actual saved path and only non-observed steps, preserving IDs and input",()=>{
 const report=fixture();metadata(report);create(report,1);const before=structuredClone(report);assert.equal(evaluateStoredProjectJourneyReport(report).steps.find(s=>s.id==="meta")!.outcome,"observed");
 for(const language of["zh","en"]as const){const draft=draftProjectJourneyFeedback(report,language);assertBounded(draft);assert.ok(draft.includes(report.id)&&draft.includes(report.deliveryId));assert.ok(draft.includes("/custom-seller/pbp/bookings"));assert.match(draft,language==="zh"?/页面人数5，请求人数1/:/Page guests 5; request guests 1/);assert.ok(!draft.includes("PRIVATE_PAGE_TEXT"));assert.ok(!draft.split("\n").some(line=>line.startsWith("meta ")));assert.ok(!draft.includes("/custom-seller/pbp/meta"));}
 assert.deepEqual(report,before);
});
test("a confirmed creation is not copied into feedback while subsequent unknown steps remain unknown",()=>{
 const report=fixture();metadata(report);create(report);const evaluation=evaluateStoredProjectJourneyReport(report);assert.equal(evaluation.steps.find(s=>s.id==="create")!.outcome,"observed");
 for(const language of["zh","en"]as const){const draft=draftProjectJourneyFeedback(report,language);assertBounded(draft);assert.ok(!draft.split("\n").some(line=>/^(?:meta|create)\s/u.test(line)));assert.ok(!draft.includes("/custom-seller/pbp/bookings"));assert.ok(draft.includes("/custom-seller/pbp/"));assert.ok(draft.includes(language==="zh"?"未确定":"unknown"));}
});
test("server outage and blocked redirect drafts request evidence recovery rather than seller feature repair",()=>{
 for(const reason of["server_read_timeout","redirect_blocked","server_fetch_configuration","evidence_size_limit; unavailable","run_closed_without_further_network; committed outcome unknown"]){const report=fixture();report.input.observations[0].unavailableReason=reason;for(const language of["zh","en"]as const){const draft=draftProjectJourneyFeedback(report,language);assertBounded(draft);assert.ok(draft.includes(language==="zh"?"不直接判功能不达标":"not a finding of unmet work"));assert.ok(!draft.includes(language==="zh"?"卖家功能不达标，请整改":"seller functionality failed"));if(reason==="server_fetch_configuration")assert.ok(draft.includes(language==="zh"?"主站配置":"main configuration"));}}
});
test("5xx readback data is not treated as a proven missing or duplicate booking",()=>{
 const report=fixture();metadata(report);put(report,{id:"response_loss_create",ui:{actionId:"response_loss_create",status:"unknown",message:"controlled response",fields:{operation:"create",slot:JOURNEY_SLOTS.b,partySize:"1"}},requests:[{method:"POST",path:"/custom-seller/pbp/bookings",key:journeyKey(report.runId,"loss-create"),status:504,request:{testRunId:report.runId,marker:`PBP-${report.runId}`,customer:"PBP synthetic",email:"pbp-test@example.invalid",slot:JOURNEY_SLOTS.b,partySize:1},response:{code:"response_lost_after_commit"}}]});put(report,{id:"response_loss_readback",merchant:{status:503,body:{bookings:[]}}});
 const result=evaluateStoredProjectJourneyReport(report);assert.equal(result.steps.find(s=>s.id==="response_loss_readback")!.outcome,"mismatch");
 for(const language of["zh","en"]as const){const draft=draftProjectJourneyFeedback(report,language);assertBounded(draft);assert.ok(draft.includes("HTTP503"));assert.ok(!draft.includes(language==="zh"?"对应0笔":"0 records for the original"));assert.ok(!draft.split("\n").some(line=>line.startsWith("response_loss_create ")));}
});
test("worst allowed identifiers and long actual path fit1000 UTF16 with an explicit remainder and complete safety boundary",()=>{
 const report=fixture();report.id="r".repeat(80);report.deliveryId="d".repeat(80);const base="/"+"x".repeat(455)+"/pbp/";report.registration.backendBaseUrl="https://seller.example"+base;metadata(report);report.input.metadata={...report.input.metadata as object,maxGuestsPerSlot:9};report.input.observations[0].requests![0].response=structuredClone(report.input.metadata);validateStoredProjectJourneyReport(report);
 for(const language of["zh","en"]as const){const draft=draftProjectJourneyFeedback(report,language);assertBounded(draft);assert.ok(draft.includes(report.id));assert.ok(draft.includes(report.deliveryId));assert.ok(draft.includes(base+"meta"));assert.ok(draft.includes(language==="zh"?"项详见":"other exceptions"));assert.ok(draft.endsWith(language==="zh"?"不改变验收或付款。":"no acceptance or payment."));}
});
test("an invalid report yields a safe unverified message, never raw private strings or a replacement success",()=>{
 const report=fixture();report.input.frontendEntry+="&private=SECRET";for(const language of["zh","en"]as const){const draft=draftProjectJourneyFeedback(report,language);assertBounded(draft);assert.ok(!draft.includes("SECRET"));assert.ok(draft.includes(language==="zh"?"无法完整校验":"could not be validated"));}
});
