/**
 * Browser/server shared structural validation. Never authenticates a reviewer.
 * @param {import("./evaluation-review").ReviewSheet} expected Trusted pinned sheet.
 * @param {unknown} sheet Untrusted imported receipts.
 * @returns {{pending: number, accept: number, revise: number, reject: number}}
 */
export function validateReviewReceipts(expected, sheet) {
  if (!sheet || typeof sheet !== "object" || Array.isArray(sheet) ||
      Object.keys(sheet).some(k => !["formatVersion", "purpose", "corpusSha256", "datasetSha256", "entries"].includes(k)) ||
      sheet.formatVersion !== 1 || sheet.purpose !== expected.purpose ||
      sheet.corpusSha256 !== expected.corpusSha256 || sheet.datasetSha256 !== expected.datasetSha256 ||
      !Array.isArray(sheet.entries) || sheet.entries.length !== expected.entries.length) throw new Error("review_binding_mismatch");
  const cases = new Map(expected.entries.map(e => [e.caseId, e.caseSha256]));
  const seen = new Set(), counts = { pending: 0, accept: 0, revise: 0, reject: 0 };
  for (const entry of sheet.entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).some(k => !["caseId", "caseSha256", "decision", "reviewer", "reviewedAt", "note"].includes(k)) ||
        seen.has(entry.caseId) || !cases.has(entry.caseId) || cases.get(entry.caseId) !== entry.caseSha256 ||
        !["pending", "accept", "revise", "reject"].includes(entry.decision) || typeof entry.note !== "string" || entry.note.length > 10000) {
      throw new Error("invalid_review_entry");
    }
    seen.add(entry.caseId);
    if (entry.decision === "pending") {
      if (entry.reviewer !== null || entry.reviewedAt !== null) throw new Error("invalid_pending_review");
    } else if (typeof entry.reviewer !== "string" || !entry.reviewer.trim() || entry.reviewer.length > 128 ||
        typeof entry.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.reviewedAt) ||
        !Number.isFinite(Date.parse(entry.reviewedAt)) || new Date(entry.reviewedAt).toISOString() !== entry.reviewedAt || !entry.note.trim()) {
      throw new Error("review_receipt_required");
    }
    counts[entry.decision]++;
  }
  return counts;
}
