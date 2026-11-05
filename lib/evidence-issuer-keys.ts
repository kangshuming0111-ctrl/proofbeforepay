/** Public trust anchor distributed with the official verifier. Private key is
 * an existing Site runtime secret, never a source or client configuration value.
 * Rotation requires retaining previous approved public keys for old receipts. */
export const EVIDENCE_ISSUER_ORIGIN = "https://briefpay-kang-lab.blueheron8.chatgpt.site";
export const EVIDENCE_ISSUER_KEY_ID = "pbp-issuer-92779b570c3e4a8d";
export const EVIDENCE_ISSUER_KEYS:Readonly<Record<string,string>> = Object.freeze({
  [EVIDENCE_ISSUER_KEY_ID]: "MCowBQYDK2VwAyEALzj891J6d2OH4t9MFTP0cYxiwi6FUetpWLfC1OI1Xy0=",
});
