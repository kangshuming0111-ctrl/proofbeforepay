/** Explains the existing disabled confirmation prerequisites only. A null
 * result is not a promise that the full create request or server validation
 * will succeed. It never changes scope, checks values or confirms anything. */
export type ProjectIntakeBlockerInput = {
  coverageReady: boolean;
  coverageConfirmed: boolean;
  coverageError: string;
  coverageRows: readonly {disposition: "include" | "exclude" | "pending"; reason?: string}[];
  hasRequirementsDraft: boolean;
  requirementsConfirmed: boolean;
  businessCount: number;
  businessReady: boolean;
  businessConfirmed: boolean;
  runtimeEnabled: boolean;
  runtimeReady: boolean;
  runtimeConfirmed: boolean;
};
export type ProjectIntakeBlocker = {
  kind: "source" | "pending" | "exclusion" | "coverage" | "requirements" | "business-edit" | "business-confirm" | "runtime-edit" | "runtime-confirm";
  step: 0 | 1;
  selector: string;
};

export function projectIntakeBlocker(input: ProjectIntakeBlockerInput): ProjectIntakeBlocker | null {
  if (!input.coverageReady) {
    if (input.coverageError || !input.coverageRows.length) return {kind: "source", step: 0, selector: "#projectSummary"};
    const pending = input.coverageRows.findIndex(row => row.disposition === "pending");
    if (pending >= 0) return {kind: "pending", step: 1, selector: `.requirement-coverage-list > li:nth-child(${pending + 1}) select`};
    const exclusion = input.coverageRows.findIndex(row => row.disposition === "exclude" && !row.reason?.trim());
    if (exclusion >= 0) return {kind: "exclusion", step: 1, selector: `.requirement-coverage-list > li:nth-child(${exclusion + 1}) textarea`};
    return {kind: "coverage", step: 1, selector: ".requirement-coverage"};
  }
  if (!input.coverageConfirmed) return {kind: "coverage", step: 1, selector: ".requirement-coverage-confirm input"};
  if (input.hasRequirementsDraft && !input.requirementsConfirmed) return {kind: "requirements", step: 1, selector: ".requirements-confirm input"};
  if (input.businessCount > 0 && (!input.businessReady || !input.businessConfirmed)) return input.businessReady
    ? {kind: "business-confirm", step: 1, selector: "#intake-business-checks .business-check-confirm input"}
    : {kind: "business-edit", step: 1, selector: "#intake-business-checks .business-check-editor"};
  if (input.runtimeEnabled && (!input.runtimeReady || !input.runtimeConfirmed)) return input.runtimeReady
    ? {kind: "runtime-confirm", step: 1, selector: "#intake-runtime-checks .business-check-editor > label:last-child input"}
    : {kind: "runtime-edit", step: 1, selector: "#intake-runtime-checks .business-check-editor"};
  return null;
}
