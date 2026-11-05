import { DomainError } from "./domain.ts";
import { MODEL_DIAGNOSIS_REVISION, type ModelDiagnosis, type ModelDiagnosisExplanationPacket, type ModelDiagnosticFinding } from "./model-diagnostics.ts";
import { modelEvidenceBinding, validateModelEvidenceExplanation, type ModelEvidenceExplanation } from "./model-evidence-explanation.ts";

export type ModelExplanationCoverageState = "explained" | "provider_omission" | "packet_limit" | "not_requested";
export type ModelExplanationCoverageRow = { finding: ModelDiagnosticFinding; state: ModelExplanationCoverageState };
export type ModelExplanationCoverage = {
  reportId: string;
  rows: ModelExplanationCoverageRow[];
  summary: { criticalTotal: number; explained: number; providerOmission: number; packetLimit: number; notRequested: number };
};

/** Receives the exact validated diagnosis and its derived packet. Coverage is
 * about cited IDs, not semantic correctness, a new verdict or an AI retest. */
export function modelExplanationCoverage(diagnosis: ModelDiagnosis, packet: ModelDiagnosisExplanationPacket, explanation?: ModelEvidenceExplanation): ModelExplanationCoverage {
  const fail = () => { throw new DomainError("AI explanation coverage does not match this exact report and diagnostic revision.", 409); };
  if (diagnosis.schema !== "model-diagnosis-v1" || packet.schema !== "model-diagnosis-explanation-input-v1" || packet.diagnosisRevision !== MODEL_DIAGNOSIS_REVISION) fail();
  for (const key of ["reportId", "deliveryId", "deliveryDigest", "journeyPlanDigest", "modelSpecDigest", "outcome", "reason"] as const) if (diagnosis[key] !== packet[key]) fail();
  const ids = diagnosis.findings.map(finding => finding.id), supplied = diagnosis.findings.slice(0, 8);
  if (new Set(ids).size !== ids.length || packet.omittedFindingCount !== diagnosis.findings.length - supplied.length
    || JSON.stringify(packet.findingIds) !== JSON.stringify(supplied.map(finding => finding.id))
    || JSON.stringify(packet.findings.map(finding => [finding.id, finding.severity])) !== JSON.stringify(supplied.map(finding => [finding.id, finding.severity]))) fail();
  // Existing partial explanations remain valid. Only an exact-bound saved
  // explanation establishes that any supplied item received provider output.
  const validated = explanation ? validateModelEvidenceExplanation(explanation, modelEvidenceBinding(packet)) : undefined;
  const cited = new Set(validated?.findings.flatMap(group => group.findingIds) ?? []), sent = new Set(packet.findingIds);
  const rows: ModelExplanationCoverageRow[] = diagnosis.findings.filter(finding => finding.severity !== "information").map(finding => ({
    finding: structuredClone(finding),
    state: !validated ? "not_requested" : !sent.has(finding.id) ? "packet_limit" : cited.has(finding.id) ? "explained" : "provider_omission",
  }));
  return { reportId: diagnosis.reportId, rows, summary: {
    criticalTotal: rows.length,
    explained: rows.filter(row => row.state === "explained").length,
    providerOmission: rows.filter(row => row.state === "provider_omission").length,
    packetLimit: rows.filter(row => row.state === "packet_limit").length,
    notRequested: rows.filter(row => row.state === "not_requested").length,
  } };
}
