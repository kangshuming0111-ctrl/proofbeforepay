declare const __PROOF_SOURCE_RELEASE__: {schema: string; sha256: string; files: number};

/** Public code provenance only. No identities, database state, provider configuration or secrets. */
export function GET() {
  return Response.json({ ...__PROOF_SOURCE_RELEASE__, scope: "Selected application source, build configuration and public text assets. Excludes credentials, runtime data, site identity and public benchmark files." }, {headers: {"Cache-Control": "no-store"}});
}
