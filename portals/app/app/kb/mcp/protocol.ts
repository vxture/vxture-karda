// Minimal JSON-RPC 2.0 / MCP server plumbing for the Runos channel
// (230-runos-channel). Karda exposes its knowledge service to the Runos
// commercial-capability gateway as an MCP endpoint (Streamable HTTP, STATELESS:
// each POST is a complete request/response; no SSE, no session). Runos is a
// zero-SDK consumer - it speaks plain MCP and live-verifies `tools/list`
// against the registered capability contract at endpoint registration
// (tools_list_mismatch), so this layer's tool names/schemas ARE the contract.
//
// Deliberately dependency-free: the method surface is four fixed methods
// (initialize / notifications/initialized / tools/list / tools/call), so a
// hand-rolled dispatcher is smaller and more auditable than an SDK.

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number | string | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: "2.0";
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// JSON-RPC 2.0 reserved codes.
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;

export function rpcResult(id: number | string | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

export function rpcError(id: number | string | null, code: number, message: string): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Parse one request object. Batches were removed from MCP's JSON-RPC profile;
 *  an array is rejected as invalid rather than half-supported. */
export function parseRequest(body: unknown): JsonRpcRequest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const o = body as Record<string, unknown>;
  if (o.jsonrpc !== "2.0" || typeof o.method !== "string") return null;
  const id = o.id;
  if (id !== undefined && id !== null && typeof id !== "number" && typeof id !== "string") return null;
  const params = o.params;
  if (params !== undefined && (typeof params !== "object" || params === null || Array.isArray(params))) return null;
  return {
    jsonrpc: "2.0",
    id: id as number | string | null | undefined,
    method: o.method,
    params: params as Record<string, unknown> | undefined,
  };
}

/** Is this a notification (no id)? Notifications get 202-with-no-body. */
export function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined || req.id === null;
}

// --- MCP tool-result shape ---------------------------------------------------

export interface McpToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Wrap a handler's structured payload the way MCP tools return it: the JSON in
 *  content[0].text AND as structuredContent (the same both places, like Runos's
 *  own envelope discipline). */
export function toolResult(payload: Record<string, unknown>, isError = false): McpToolResult {
  const res: McpToolResult = {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
  if (isError) res.isError = true;
  return res;
}
