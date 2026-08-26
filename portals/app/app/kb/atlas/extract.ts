// The Atlas extraction client - karda's side of `vxture-atlas#39`.
//
// Extraction rides the SAME `/v1/chat` data plane as `karda.ask`; #39 asks Atlas
// for a taskProfile grant, not for a new endpoint. What separates the two calls
// is the label: `karda.extract` lets Atlas route batch structured extraction to a
// cheaper model than interactive question answering, which is the entire point of
// KD-018 putting model choice in authorization rather than in karda's config.
//
// THE GRANT DOES NOT EXIST YET (`vxture-atlas#39` is open). This client ships
// anyway, on owner direction 2026-08-26, because the ungranted case is not a
// mystery: Atlas answers `404 TASK_PROFILE_NOT_ROUTABLE` and does nothing else -
// no model runs, nothing is charged, no state moves. Mapping that to the existing
// suspend path means extraction is BUILT and PARKED rather than absent, and the
// day the grant lands the parked work resumes with no karda change. The same
// discipline already carried the embed stage through the whole A1 wait
// (`UnavailableEmbeddingClient`), so this is the established shape, not a new one.
import type { ChatRequest, GenerationClient } from "../retrieval/ask";
import { getGenerationClient } from "../retrieval/generation";
import type { RawAssertion } from "../assertions/extract";
import { QuotaError, UnavailableError } from "../processing/orchestrator";
import { AtlasApiError } from "./client";
import { extractSelection } from "./selection";
import { shouldSuspend } from "./codes";

/** A slice of a document's canonical text, and where it starts in that text. */
export interface TextWindow {
  text: string;
  /** Offset of `text[0]` in the document's canonical text. */
  baseOffset: number;
}

export interface ExtractionRequest {
  window: TextWindow;
  tenantId: string;
  workspaceId: string;
  taskId: string;
}

export interface ExtractionClient {
  extract(req: ExtractionRequest): Promise<RawAssertion[]>;
}


/**
 * Map an Atlas failure onto the processing taxonomy.
 *
 * `TASK_PROFILE_NOT_ROUTABLE` is the one that matters today - it is exactly what
 * an ungranted `karda.extract` returns - and it becomes `UnavailableError`, which
 * the orchestrator suspends: parked, resumable, never `failed`, never needing a
 * human to un-fail it once #39 lands.
 *
 * A malformed or unparseable model response deliberately does NOT park. It falls
 * through as a plain Error into the bounded transient path, so a karda-side
 * prompt or schema bug surfaces as a visible failure instead of quietly parking
 * every document forever.
 */
export function mapExtractError(e: unknown): unknown {
  if (e instanceof AtlasApiError) {
    if (e.code === "QUOTA_EXCEEDED") return new QuotaError(`atlas extract: ${e.code}`);
    if (shouldSuspend(e.code, e.retryable)) {
      return new UnavailableError(`atlas extract: ${e.code}: ${e.message}`);
    }
  }
  return e;
}

// --- the response contract --------------------------------------------------

/**
 * What we require back. The division of labour is deliberate: this function
 * validates the ENVELOPE (is it JSON, is it an object, is there an assertions
 * array) and passes every item through untouched. Item-level admission is
 * `prepare()`'s job - it already carries seven named reject reasons and reports
 * what it dropped and why. Duplicating those checks here would give us two
 * disagreeing definitions of an admissible assertion.
 */
export function parseExtractionResponse(content: string): unknown[] {
  const json = stripFence(content).trim();
  if (json === "") throw new Error("atlas extract: empty response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("atlas extract: response is not JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("atlas extract: response is not an object");
  }
  const items = (parsed as Record<string, unknown>).assertions;
  if (!Array.isArray(items)) throw new Error("atlas extract: response has no assertions array");
  return items;
}

/**
 * Models wrap JSON in a fenced code block constantly, whatever the prompt says.
 * Unwrapping it is not leniency about the contract - the contract is still "one
 * JSON object" - it is refusing to fail a correct answer over a decoration.
 */
function stripFence(s: string): string {
  const m = s.match(/^\s*```(?:json)?\s*\n([\s\S]*?)\n\s*```\s*$/);
  return m ? m[1] : s;
}

/**
 * Rebase window offsets into document offsets.
 *
 * THE MOST DANGEROUS LINE IN THIS FILE. The model is given a WINDOW and answers
 * in window coordinates; every span, every citation and every `get_context` call
 * downstream reads document coordinates. Forgetting the shift does not throw and
 * does not look wrong - it silently anchors every assertion in the document to
 * text that does not say it, and the further into the document the window sits,
 * the further off it lands. So the shift happens HERE, once, at the boundary
 * where window coordinates stop existing, rather than at each caller.
 */
export function rebase(items: unknown[], baseOffset: number): RawAssertion[] {
  return items.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const shift = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v + baseOffset : NaN);
    return {
      ...(o as unknown as RawAssertion),
      startOffset: shift(o.startOffset),
      endOffset: shift(o.endOffset),
    };
  });
}

/**
 * The instruction. Kept next to the parser on purpose: the prompt and the shape
 * we accept are one contract, and splitting them across files is how they drift.
 *
 * Two rules in it are not stylistic. `asserted_by` is WHO THE SOURCE SAYS SAID
 * IT - never the uploader and never the model, the distinction the schema keeps
 * as separate `asserted_by` / `extracted_by` columns. And offsets must be exact,
 * because an assertion whose span does not contain its statement is worse than no
 * assertion: it is a citation to text that does not support it.
 */
export const EXTRACTION_SYSTEM_PROMPT = [
  "You extract verifiable assertions from a document excerpt.",
  "",
  "Answer with ONE JSON object and nothing else:",
  '{"assertions":[{"kind","subject","statement","assertedBy","asOf","validUntil","startOffset","endOffset","confidence","mentions"}]}',
  "",
  "- kind: one of fact, claim, event, procedure, rule.",
  "- statement: the assertion in one self-contained sentence, in the document's language.",
  "- assertedBy: who the DOCUMENT says is asserting it (a person, an organisation, a",
  "  named source). Never the uploader, never yourself. Null when the document does",
  "  not say.",
  "- asOf / validUntil: ISO-8601 when the document states them, otherwise null.",
  "- startOffset / endOffset: a half-open character range in the excerpt you were",
  "  given, containing the text the statement rests on. It must be exact: a range",
  "  that does not contain the supporting text is worse than no assertion at all.",
  "- confidence: 0..1.",
  "- mentions: entity names the statement refers to, as written.",
  "",
  "Extract nothing you cannot point at. An empty array is a correct answer.",
].join("\n");

// --- the client -------------------------------------------------------------

export class AtlasExtractionClient implements ExtractionClient {
  constructor(private generation: GenerationClient) {}

  async extract(req: ExtractionRequest): Promise<RawAssertion[]> {
    const chat: ChatRequest = {
      taskId: req.taskId,
      ...extractSelection(),
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: req.window.text },
      ],
      // Extraction is a structured read of text that is already there, not a
      // creative act; sampling would only invent variation between two runs over
      // the same document.
      temperature: 0,
      tenantId: req.tenantId,
      workspaceId: req.workspaceId,
    };

    let content: string;
    try {
      content = (await this.generation.chat(chat)).content;
    } catch (e) {
      throw mapExtractError(e);
    }
    return rebase(parseExtractionResponse(content), req.window.baseOffset);
  }
}

/**
 * The stand-in used while the grant is missing or Atlas is unreachable.
 *
 * It suspends rather than fails, exactly as `UnavailableEmbeddingClient` did
 * through the A1 wait: a caller that hits this parks its work and resumes when
 * the real client arrives, losing nothing it had already done.
 */
export class UnavailableExtractionClient implements ExtractionClient {
  async extract(): Promise<RawAssertion[]> {
    throw new UnavailableError("extraction capability (Atlas karda.extract grant) is not yet available");
  }
}

/**
 * The extraction client for this deployment.
 *
 * Returns the stand-in - never null - when Atlas is unreachable. That is the
 * difference from `getGenerationClient()`, which returns null so `karda.ask` can
 * answer `not_implemented`: ask is a request someone is waiting on, and telling
 * them plainly beats parking them. Extraction is background work with nobody
 * waiting, so the honest behaviour is to park it and resume later, which needs a
 * client that throws the parking error rather than an absent one every caller
 * would have to special-case.
 */
export function getExtractionClient(): ExtractionClient {
  const generation = getGenerationClient();
  return generation ? new AtlasExtractionClient(generation) : new UnavailableExtractionClient();
}
