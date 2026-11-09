import type {ProofEvidence} from "../../lib/contracts.ts";

/** These exact built-in rows use an arbitrary delivered file as context for a
 * human check. Their stored file is not a rule-resolved owner for the clause. */
export function isStaticManualSourceReference(row: ProofEvidence, staticProject: boolean): boolean {
  if (!staticProject || row.finding !== "needs_human" || row.id !== `evidence-${row.criterionId}`) return false;
  return row.criterionId === "mobile" || /^(?:coverage|manual)-[1-9]\d*$/u.test(row.criterionId) && row.file === "index.html";
}
