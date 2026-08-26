import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AtlasExtractionClient,
  UnavailableExtractionClient,
  mapExtractError,
  parseExtractionResponse,
  rebase,
  EXTRACTION_SYSTEM_PROMPT,
} from "./extract";
import { AtlasApiError } from "./client";
import { QuotaError, UnavailableError } from "../processing/orchestrator";
import { KARDA_ENDPOINTS, extractSelection } from "./selection";
import type { ChatRequest, ChatResponse, GenerationClient } from "../retrieval/ask";

const err = (code: string, status: number, retryable: boolean) => new AtlasApiError(code, status, retryable, code);

class FakeGeneration implements GenerationClient {
  seen: ChatRequest | null = null;
  constructor(private reply: string | Error) {}
  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.seen = req;
    if (this.reply instanceof Error) throw this.reply;
    return { content: this.reply };
  }
}

const body = (assertions: unknown[]) => JSON.stringify({ assertions });

// --- the ungranted case: the whole reason this ships before the grant --------------

test("an ungranted extract ENDPOINT parks rather than fails", () => {
  // What Atlas answers until the product holds the endpoint grant. It must
  // suspend: parked, resumable, never `failed` - so the day the grant lands the
  // work resumes with no karda change and no human un-failing anything. The
  // retired TASK_PROFILE_NOT_ROUTABLE carried identical semantics, which is why
  // the switch to the product axis needed no change here.
  const mapped = mapExtractError(err("ENDPOINT_NOT_ROUTABLE", 404, false));
  assert.ok(mapped instanceof UnavailableError);
});

test("quota parks too, under its own error class", () => {
  assert.ok(mapExtractError(err("QUOTA_EXCEEDED", 429, false)) instanceof QuotaError);
});

test("a retryable Atlas failure does NOT park - it takes the bounded transient path", () => {
  const e = err("RATE_LIMITED", 429, true);
  assert.equal(mapExtractError(e), e);
});

test("a karda-side payload bug does not park either", () => {
  // Parking a prompt/schema bug would hide it forever behind "waiting on Atlas".
  const e = err("CHAT_MESSAGES_INVALID", 400, false);
  assert.equal(mapExtractError(e), e);
});

test("the offline stand-in suspends, like the embedding one did through the A1 wait", async () => {
  await assert.rejects(() => new UnavailableExtractionClient().extract(), UnavailableError);
});

// --- offsets: the dangerous part --------------------------------------------------

test("window offsets are rebased into document offsets", () => {
  // The model answers in WINDOW coordinates; everything downstream reads DOCUMENT
  // coordinates. Forgetting the shift throws nothing and looks fine - it just
  // anchors every assertion to text that does not say it.
  const out = rebase([{ statement: "s", startOffset: 10, endOffset: 20 }], 1000);
  assert.equal(out[0].startOffset, 1010);
  assert.equal(out[0].endOffset, 1020);
});

test("a window at the start of the document is still rebased (by zero)", () => {
  const out = rebase([{ statement: "s", startOffset: 3, endOffset: 4 }], 0);
  assert.deepEqual([out[0].startOffset, out[0].endOffset], [3, 4]);
});

test("a non-numeric offset becomes NaN, which prepare() rejects - it never becomes the base", () => {
  // The trap: `undefined + 1000` is NaN but `null + 1000` is 1000, which would
  // silently turn a missing offset into "the start of the window" and anchor a
  // statement to text nobody claimed.
  const out = rebase([{ statement: "s", startOffset: null, endOffset: "x" }], 1000);
  assert.ok(Number.isNaN(out[0].startOffset));
  assert.ok(Number.isNaN(out[0].endOffset));
});

test("rebasing carries every other field through untouched", () => {
  const out = rebase([{ kind: "fact", statement: "s", assertedBy: "招标文件", mentions: ["甲方"], startOffset: 1, endOffset: 2 }], 5);
  assert.equal(out[0].assertedBy, "招标文件");
  assert.deepEqual(out[0].mentions, ["甲方"]);
});

// --- the response envelope --------------------------------------------------------

test("a fenced code block is unwrapped - the contract is still one JSON object", () => {
  const fenced = "```json\n" + body([{ statement: "a" }]) + "\n```";
  assert.equal(parseExtractionResponse(fenced).length, 1);
});

test("an empty assertions array is a valid answer, not a failure", () => {
  // "Extract nothing you cannot point at" has to be an answer the model can give.
  assert.deepEqual(parseExtractionResponse(body([])), []);
});

test("prose, a bare array, or a missing assertions key are all rejected", () => {
  assert.throws(() => parseExtractionResponse("Sure! Here are the assertions:"), /not JSON/);
  assert.throws(() => parseExtractionResponse("[]"), /not an object/);
  assert.throws(() => parseExtractionResponse('{"items":[]}'), /no assertions array/);
  assert.throws(() => parseExtractionResponse("   "), /empty response/);
});

test("malformed ITEMS pass through - admission is prepare()'s job, not this file's", () => {
  // Two disagreeing definitions of an admissible assertion is how a reject reason
  // stops matching what was actually dropped.
  assert.equal(parseExtractionResponse(body([{ nonsense: true }, null])).length, 2);
});

// --- the call ---------------------------------------------------------------------

test("the call carries the karda.extract profile, temperature 0, and the tenant context", async () => {
  const gen = new FakeGeneration(body([{ statement: "s", startOffset: 0, endOffset: 1 }]));
  await new AtlasExtractionClient(gen).extract({
    window: { text: "hello", baseOffset: 400 },
    tenantId: "org-1",
    workspaceId: "ws-1",
    taskId: "t-1",
  });
  const seen = gen.seen!;
  assert.equal(seen.endpointCode, KARDA_ENDPOINTS.extract);
  assert.equal(seen.modelCode, undefined); // model choice is the operator's, per KD-018
  assert.equal(seen.temperature, 0);
  assert.equal(seen.tenantId, "org-1");
  assert.equal(seen.taskId, "t-1");
  assert.equal(seen.messages[1].content, "hello");
});

test("the client rebases before returning, so callers never see window coordinates", async () => {
  const gen = new FakeGeneration(body([{ statement: "s", startOffset: 2, endOffset: 5 }]));
  const out = await new AtlasExtractionClient(gen).extract({
    window: { text: "hello world", baseOffset: 400 },
    tenantId: "o",
    workspaceId: "w",
    taskId: "t",
  });
  assert.deepEqual([out[0].startOffset, out[0].endOffset], [402, 405]);
});

test("an Atlas failure from the call is mapped, not leaked raw", async () => {
  const gen = new FakeGeneration(err("ENDPOINT_NOT_ROUTABLE", 404, false));
  await assert.rejects(
    () => new AtlasExtractionClient(gen).extract({ window: { text: "x", baseOffset: 0 }, tenantId: "o", workspaceId: "w", taskId: "t" }),
    UnavailableError,
  );
});

test("the default selection sends an ENDPOINT and no model - selection lives in the grant", () => {
  const sel = extractSelection();
  assert.equal(sel.endpointCode, "chat/extract");
  assert.equal(sel.modelCode, undefined);
  assert.equal((sel as { taskProfile?: string }).taskProfile, undefined, "the legacy tenant axis is not sent");
});

test("extraction does NOT share the ask endpoint", () => {
  // Same rule as before the axis change, and it survives the change on purpose:
  // one endpoint would leave routing, billing and observability unable to tell
  // batch extraction from interactive answering.
  assert.notEqual(KARDA_ENDPOINTS.extract, KARDA_ENDPOINTS.ask);
});

test("the prompt states the two rules that are not stylistic", () => {
  // asserted_by is the source's speaker, never the uploader or the model; and an
  // offset that does not contain the supporting text is worse than no assertion.
  assert.match(EXTRACTION_SYSTEM_PROMPT, /Never the uploader, never yourself/);
  assert.match(EXTRACTION_SYSTEM_PROMPT, /worse than no assertion/);
});
