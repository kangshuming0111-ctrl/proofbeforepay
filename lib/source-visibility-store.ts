import {env} from "cloudflare:workers";
import type {ProofActor,ProofRecord} from "./proof-store";
import {DomainError} from "./domain.ts";
import {createSourceVisibilityReport,sourceVisibilityPlan,validateStoredVisibilityReport,SOURCE_VISIBILITY_LIMIT,type SourceVisibilityPlan,type SourceVisibilityReport} from "./source-visibility.ts";
import {SOURCE_VISIBILITY_INSERT} from "./source-visibility-sql.ts";

function db(){if(!env.DB)throw new DomainError("Source-visibility storage is unavailable.",503);return env.DB;}
type Row={id:string;quote_id:string;delivery_id:string;delivery_digest:string;assessment_id:string;payload:string;created_at:string};
function decode(row:Row){
 let value:unknown;try{value=JSON.parse(row.payload);}catch{throw new DomainError("Saved source-visibility evidence needs operator review.",503);}
 const report=validateStoredVisibilityReport(value);
 if(report.id!==row.id||report.projectId!==row.quote_id||report.deliveryId!==row.delivery_id||report.deliveryDigest!==row.delivery_digest||report.assessmentId!==row.assessment_id||report.receivedAt!==row.created_at)throw new DomainError("Saved source-visibility metadata differs from its retained evidence.",503);
 return report;
}
export async function sourceVisibilityReports(projectId:string){const rows=await db().prepare("SELECT * FROM source_visibility_reports WHERE quote_id = ? ORDER BY rowid DESC LIMIT ?").bind(projectId,SOURCE_VISIBILITY_LIMIT+1).all<Row>();if(rows.results.length>SOURCE_VISIBILITY_LIMIT)throw new DomainError("Source-visibility history exceeds its retained bound.",503);return rows.results.map(decode);}
export async function sourceVisibilityView(record:ProofRecord){
 let plan:SourceVisibilityPlan|undefined;
 if(record.quote.proof.delivery?.assessment)plan=await sourceVisibilityPlan(record.quote);
 const reports=await sourceVisibilityReports(record.quote.id);
 return{plan,reports:reports.map(report=>({...report,stale:!plan||report.deliveryId!==plan.deliveryId||report.deliveryDigest!==plan.deliveryDigest||report.assessmentId!==plan.assessmentId})),reportLimit:SOURCE_VISIBILITY_LIMIT,scope:{clientReported:true,staticSnapshot:true,scriptsExecuted:false,modelCalled:false,acceptance:false,payment:false,deploymentAttestation:false}};
}
export async function saveSourceVisibility(record:ProofRecord,actor:ProofActor,input:unknown){
 if(!actor.authenticated||!["buyer","seller"].includes(record.role))throw new DomainError("Only authenticated project members may save citation observations.",403);
 if(record.quote.proof.paymentOperation)throw new DomainError("Wait for the pending payment operation before saving supplemental observations.",409);
 const {report,previousReportId}=await createSourceVisibilityReport(record.quote,record.role,input),result=await db().prepare(SOURCE_VISIBILITY_INSERT).bind(report.id,report.projectId,report.deliveryId,report.deliveryDigest,report.assessmentId,JSON.stringify(report),report.receivedAt,record.quote.id,record.version,actor.id,actor.id,record.quote.id,SOURCE_VISIBILITY_LIMIT,record.quote.id,report.deliveryId,report.assessmentId,previousReportId??"").run();
 if(result.meta.changes!==1)throw new DomainError("The project or observation history changed, or its retained history is full. Refresh before observing again.",409);
 return report;
}
