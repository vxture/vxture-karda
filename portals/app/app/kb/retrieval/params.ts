import { DEFAULT_SEARCH_PARAMS } from "./search";
import { VERIFICATION_FILTERS, type VerificationFilter } from "../lib/state";

// Coercion of the two wire params every retrieval entry point accepts.
//
// Extracted because there were already two identical copies (search-tool,
// console-retrieval) and ask-tool was about to become a third. These are not
// cosmetic helpers: `verificationFilter` decides WHICH QUALITY TIER a caller
// gets, so a copy that drifts - or is quietly missing, which is exactly what
// happened to ask - changes what content an agent's answer is grounded on.

/** Coerce a wire value to a known filter, falling back to the default.
 *
 *  Falls back rather than rejecting: an unknown string is a caller mistake, and
 *  answering with the DEFAULT tier is safer than either failing the call or
 *  silently widening to `all`. */
export function verificationFilterOf(v: unknown): VerificationFilter {
  return typeof v === "string" && (VERIFICATION_FILTERS as readonly string[]).includes(v)
    ? (v as VerificationFilter)
    : DEFAULT_SEARCH_PARAMS.verificationFilter;
}

/** Coerce top_k. Capped at 50 - a caller asking for more is asking us to page
 *  the whole corpus through a rerank. */
export function topKOf(v: unknown): number {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= 50 ? v : DEFAULT_SEARCH_PARAMS.topK;
}
