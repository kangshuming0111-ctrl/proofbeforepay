import type {EvidenceFollowup} from "./evidence-followup.ts";
export function followupHeadsGuard(projectId:string,tasks:EvidenceFollowup[]){
 // Keep parameter count constant even at the 12-task retained limit. The
 // payload equality also catches same-version corruption, not only CAS heads.
 return{sql:"(SELECT count(*) FROM evidence_followups WHERE quote_id = ?) = ? AND NOT EXISTS (SELECT 1 FROM evidence_followups AS saved WHERE saved.quote_id = ? AND NOT EXISTS (SELECT 1 FROM json_each(?) AS expected WHERE json_extract(expected.value, '$.id') = saved.id AND json_extract(expected.value, '$.version') = saved.version AND json_extract(expected.value, '$.payload') = saved.payload))",bindings:[projectId,tasks.length,projectId,JSON.stringify(tasks.map(t=>({id:t.id,version:t.version,payload:JSON.stringify(t)})))]};
}
