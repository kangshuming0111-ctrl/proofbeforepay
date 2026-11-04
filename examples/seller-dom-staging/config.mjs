// Deployment-owned configuration. The build writes a separate fixed file for
// each controlled profile; no query or parent message chooses a backend.
import {allowLoopbackParent} from "./runtime-config.mjs";
export const config=Object.freeze({allowedParentOrigins:["https://briefpay-kang-lab.blueheron8.chatgpt.site"],allowLoopbackParent,backendBasePath:"/pbp/",frontendRevision:"seller-dom-example-v1"});
