import { NextResponse } from "next/server";
import {
  MCP_PROTOCOL_VERSION,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  INVALID_PARAMS,
  PARSE_ERROR,
  parseRequest,
  isNotification,
  rpcError,
  rpcResult,
} from "../../kb/mcp/protocol";
import { MCP_TOOLS, callMcpTool, channelCaller, isMcpTool } from "../../kb/mcp/tools";
import { dispatchResultFromMcp, recordSupplyCall } from "../../kb/tools/supply-ledger";
import { authenticateChannel } from "../../kb/mcp/auth";
import { buildToolBackends } from "../../kb/tools/backends";
import { PROTOCOL_VERSION as TOOLSET_VERSION } from "../../kb/tools/catalog";

// POST /api/mcp   (the Runos channel, 230-runos-channel; tailnet only)
//
// Karda's supplier face on the Runos commercial-capability gateway: an MCP
// Streamable HTTP endpoint in STATELESS mode - each POST is one complete
// JSON-RPC exchange, no session, no SSE (Runos's gateway makes one tools/call
// per invoke and live-pulls tools/list at endpoint registration). The tool
// surface and channel rules live in kb/mcp/tools.ts; backend assembly is the
// SAME buildToolBackends() the direct S2S channel uses - one knowledge
// service, two doors.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const auth = authenticateChannel(req.headers);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(rpcError(null, PARSE_ERROR, "body is not JSON"), { status: 400 });
  }

  const rpc = parseRequest(body);
  if (!rpc) {
    return NextResponse.json(rpcError(null, INVALID_REQUEST, "not a JSON-RPC 2.0 request object"), { status: 400 });
  }

  // Notifications (initialized, cancelled, ...) are acknowledged and dropped -
  // stateless mode has no session state for them to advance.
  if (isNotification(rpc)) {
    return new NextResponse(null, { status: 202 });
  }
  const id = rpc.id as number | string;

  switch (rpc.method) {
    case "initialize":
      return NextResponse.json(
        rpcResult(id, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "karda", version: TOOLSET_VERSION },
        }),
      );

    case "ping":
      return NextResponse.json(rpcResult(id, {}));

    case "tools/list":
      return NextResponse.json(
        rpcResult(id, {
          tools: MCP_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        }),
      );

    case "tools/call": {
      const params = rpc.params ?? {};
      const name = typeof params.name === "string" ? params.name : "";
      if (!isMcpTool(name)) {
        // An unknown tool name is a protocol error, not an isError result -
        // the same line Runos itself draws for its four fixed tools.
        return NextResponse.json(rpcError(id, INVALID_PARAMS, `unknown tool: ${name || "(missing name)"}`));
      }
      const args =
        params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
          ? (params.arguments as Record<string, unknown>)
          : {};
      const startedAt = Date.now();
      const result = await callMcpTool(name, args, buildToolBackends());
      // The supply ledger, same seam as the direct channel (240 section 4.3).
      // channelCaller returns null when org_id/workspace_id are missing, which
      // is exactly the case callMcpTool already refused - no tenant, no row.
      const caller = channelCaller(args);
      if (caller) {
        await recordSupplyCall({
          channel: "runos",
          toolName: name,
          args,
          caller,
          result: dispatchResultFromMcp(result),
          latencyMs: Date.now() - startedAt,
        });
      }
      return NextResponse.json(rpcResult(id, result));
    }

    default:
      return NextResponse.json(rpcError(id, METHOD_NOT_FOUND, `method not supported: ${rpc.method}`));
  }
}

// The endpoint is stateless: no SSE stream to open, so GET is not part of the
// contract (405 tells a session-expecting client immediately, rather than
// hanging it on a stream that will never send).
export async function GET(): Promise<Response> {
  return new NextResponse("stateless MCP endpoint: POST JSON-RPC only", { status: 405 });
}
