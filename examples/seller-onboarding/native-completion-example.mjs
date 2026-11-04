/** Integration seam, not an alternative request handler. Call after your real
 * synthetic operation finishes, using its actual request and response trace. */
import {getPendingProofCommand,completeProofOperation} from "./pbp-connect.mjs";

export const captureProofCommand=()=>getPendingProofCommand();

export function publishNativeCompletion(command,trace){
 if(!command)return; // ordinary manual operation
 const success=Number.isInteger(trace.status)&&trace.status>=200&&trace.status<300&&!trace.error;
 const unknown=trace.status===undefined||trace.status===504||!!trace.error;
 completeProofOperation({command,requests:[trace],...(success?{receipt:trace.response}:{}),status:success?"success":unknown?"unknown":"error",message:success?"The native reservation operation completed.":unknown?"Outcome unknown. Read saved records before any original-key retry.":"The native reservation operation was rejected."});
}

// Capture captureProofCommand() BEFORE awaiting the native request, then pass
// that same command with its completed trace. Never look up a newer command
// after an asynchronous operation.
// Your existing handler still owns validation, the actual HTTP request and
// native saved records. The journal must include the exact synthetic body,
// original key, actual same-origin POST path and observed status/response/error.
// Never call publishNativeCompletion with an invented successful trace.
