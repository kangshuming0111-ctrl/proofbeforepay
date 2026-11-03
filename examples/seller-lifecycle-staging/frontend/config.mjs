// Operator-owned staging configuration, never accepted from a query or message.
// Use a dedicated origin without real user accounts or customer data.
import {allowLoopbackParent} from "./runtime-config.mjs";
export const sellerConfig = Object.freeze({
  allowedParentOrigins: ["https://briefpay-kang-lab.blueheron8.chatgpt.site"],
  allowLoopbackParent,
  backendBasePath: new URL("./pbp/", import.meta.url).pathname,
  frontendRevision: "seller-reference-bridge-v1",
});
