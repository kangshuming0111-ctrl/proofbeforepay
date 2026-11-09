const statuses = new Set(["supported", "changes_suggested", "insufficient_evidence"]);
const firstRunHash = "ecdca18a1c20917c5f2a0eccf3c847d2f0adf6f3feaf247b01a74e84e65e32c5";
const wholeAnswerHash = "8243e2d82d6439ac1c3a99f5301fe953ef614737775ce04436c21d675c10a19b";

async function readPinnedRecord(text, expectedHash) {
  // The archival manifest uses LF. Allow checkout line-ending conversion only.
  const canonical = text.replaceAll("\r\n", "\n");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== expectedHash) throw new Error("Historical record does not match the frozen copy");
  return JSON.parse(canonical);
}

/** Recompute historical status agreement. Never turn missing observations into matches. */
export async function historicalAiSummary(firstText, wholeText) {
  const [first, whole] = await Promise.all([
    readPinnedRecord(firstText, firstRunHash),
    readPinnedRecord(wholeText, wholeAnswerHash),
  ]);
  if (first?.schema !== "noodle-f1-first-four-live-v1" || whole?.schema !== "noodle-f1-author-first-four-whole-review-v1" || !Array.isArray(first.results) || !first.results.length || !Array.isArray(whole.wholeAnswers)) throw new Error("Historical record unavailable or unsupported");
  const seen = new Set();
  const cases = first.results.map(result => {
    if (typeof result.id !== "string" || seen.has(result.id) || !Array.isArray(result.focused) || !result.focused.length) throw new Error("Duplicate or missing case");
    seen.add(result.id);
    const reviews = whole.wholeAnswers.filter(row => row.id === result.id);
    if (reviews.length !== 1 || !Array.isArray(reviews[0].notes) || !reviews[0].notes.every(note => typeof note === "string")) throw new Error("Missing or duplicate whole-answer review");
    const ids = new Set();
    const rows = result.focused.map(row => {
      if (ids.has(row.criterionId) || typeof row.criterionId !== "string" || ![row.reference, row.raw, row.published, row.effective].every(status => statuses.has(status)) || row.sourceFinding !== null && !statuses.has(row.sourceFinding)) throw new Error("Invalid criterion record");
      ids.add(row.criterionId);
      const items = result.application?.items?.filter(item => item.criterionId === row.criterionId);
      if (items?.length !== 1 || items[0].status !== row.published || items[0].modelJudgment?.status !== row.raw || (items[0].sourceFinding?.status ?? null) !== row.sourceFinding) throw new Error("Summary does not match the saved report");
      const effective = row.sourceFinding ?? row.published;
      if (effective !== row.effective) throw new Error("Effective status does not match saved layers");
      return {criterionId: row.criterionId, reference: row.reference, raw: row.raw, published: row.published, source: row.sourceFinding, effective};
    });
    return {id: result.id, rawWholeAnswer: reviews[0].raw, applicationWholeAnswer: reviews[0].application, notes: reviews[0].notes, rows};
  });
  if (whole.wholeAnswers.length !== cases.length) throw new Error("Unmatched whole-answer review");
  const rows = cases.flatMap(value => value.rows);
  const metrics = Object.fromEntries(["raw", "published", "source", "effective"].map(layer => [layer, {
    matches: rows.filter(row => row[layer] !== null && row[layer] === row.reference).length,
    evaluated: rows.filter(row => row[layer] !== null).length,
    unavailable: rows.filter(row => row[layer] === null).length,
  }]));
  return {cases, criteria: rows.length, metrics};
}
