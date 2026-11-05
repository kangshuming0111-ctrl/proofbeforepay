/** Pins are verified against authored sources and the public mirror by tests.
 * Updating either dependency requires deliberately updating its byte/hash pin. */
export const SELLER_KIT_DEPENDENCIES = Object.freeze([
  Object.freeze({name: "seller-dom-adapter.mjs", path: "/sdk/seller-dom-adapter.mjs", source: "public/sdk/seller-dom-adapter.mjs", version: "pbp-seller-dom-adapter-v1", bytes: 12005, sha256: "42be34dd51c79b1ea1df75724335093eb61d6cdfa8ad5ec63758b8e481f02143"}),
  Object.freeze({name: "bridge.mjs", path: "/sdk/seller-lifecycle-bridge.mjs", source: "examples/seller-lifecycle-staging/frontend/bridge.mjs", version: "pbp-seller-bridge-v1", bytes: 3882, sha256: "260ec46148faabfa59c4da2dfe71ba5c05a3739bbf7be3a1207af13d8079c359"}),
]);
