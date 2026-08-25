import { NextResponse } from "next/server";
import { manifest, PROTOCOL_VERSION } from "../../../kb/tools/catalog";
import { requireAuth } from "../../../kb/api/http";

// GET /api/tools/catalog   the tool surface, for a HUMAN to read
//
// The same descriptors as /.well-known/vxture-tools, behind a session instead of
// an S2S token. That is not duplication for its own sake: the well-known is
// tailnet-only and S2S-authenticated by design (product_210 - it is NEVER
// public), so a browser cannot read it, and an agent developer evaluating karda
// therefore had no way to see the tool surface at all short of reading our
// source. This route exists so the 工具面 page can.
//
// It publishes the SAME `manifest()`, so the page cannot drift from the
// machine-readable contract: if a tool's metering changes, both move together.
//
// The channel descriptions are here rather than in the page because they are
// facts about the deployment, not presentation - a developer's first question is
// "where do I point my agent", and it should not be answered by a hardcoded
// string in a component.
export const dynamic = "force-dynamic";

export interface ToolChannel {
  key: "runos" | "direct";
  name: string;
  endpoint: string;
  transport: string;
  auth: string;
  /** Why a developer would choose this door over the other one. */
  suits: string;
}

const CHANNELS: ToolChannel[] = [
  {
    key: "runos",
    name: "Runos 能力平台",
    endpoint: "POST /api/mcp",
    transport: "MCP Streamable HTTP（无状态：一次 POST 一次完整 JSON-RPC，无会话、无 SSE）",
    auth: "由 Runos 网关代为鉴权与计量",
    suits: "已经在 Runos 上编排的 agent——注册一次，工具面由网关拉取。",
  },
  {
    key: "direct",
    name: "直供通道",
    endpoint: "POST /api/tools/:tool",
    transport: "S2S HTTP（tailnet 面，公网边缘不路由）",
    auth: "S2S token（aud=karda），OBO 时附带用户身份",
    suits: "自建编排、或需要按调用直接控制 task_id 归集的场景。",
  },
];

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const m = manifest();
  return NextResponse.json({
    protocolVersion: PROTOCOL_VERSION,
    tools: m.tools,
    channels: CHANNELS,
    // One knowledge service, two doors: the SAME backends serve both channels
    // (kb/mcp/tools.ts assembles via the same buildToolBackends the direct S2S
    // channel uses). A developer choosing a door should know the choice does not
    // change what they get.
    sameBackendBothChannels: true,
  });
}
