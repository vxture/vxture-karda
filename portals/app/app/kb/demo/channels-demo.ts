// Demo overlay for 供给通道. The supply ledger has no schema yet (it lands
// with the channels milestone), so every figure here is the demo voice,
// flagged `demoOps: true` by the API. Totals DERIVE from DEMO_TOTALS_OPS so
// 知识资产, 加工管道 and 供给通道 can never disagree about today's call volume.
//
// The capability rows are NOT invented: they are the real registered contract
// from 230-runos-channel section 2 (karda.kb-read / karda.kb-write and their
// operations), and the activation checklist mirrors the liaison state - the
// Runos-side registration (runos#156) and the channel token are still pending,
// which is why the runos channel reads "off" rather than pretending to serve.
import { DEMO_TOTALS_OPS } from "./seed-data";
import type { ChannelsData } from "./channels-types";

const T = DEMO_TOTALS_OPS;

export const DEMO_CHANNELS: ChannelsData = {
  totals: {
    todayCalls: T.todayCalls,
    directCalls: T.directCalls,
    runosCalls: T.runosCalls,
    deltaPct: T.deltaPct,
    p95Ms: 412,
  },
  channels: [
    {
      key: "direct",
      name: "直供通道 · S2S",
      endpoint: "POST /api/tools/:tool",
      state: "live",
      todayCalls: T.directCalls,
      p95Ms: 380,
      errorRatePct: 0.4,
      spark: [30, 38, 32, 55, 48, 66, 58, 78, 72],
    },
    {
      key: "runos",
      name: "Runos 通道 · MCP",
      endpoint: "POST /api/mcp",
      state: "off",
      todayCalls: T.runosCalls,
      p95Ms: 0,
      errorRatePct: 0,
      spark: [20, 24, 18, 30, 26, 34, 28, 40, 36],
    },
  ],
  capabilities: [
    {
      id: "cap-read",
      code: "karda.kb-read",
      operations: ["search", "ask", "list_kbs"],
      risk: "read",
      status: "stable",
      todayCalls: 962,
    },
    {
      id: "cap-write",
      code: "karda.kb-write",
      operations: ["write_document", "create_entry"],
      risk: "write",
      status: "pending",
      todayCalls: 242,
    },
  ],
  consumers: [
    { code: "forge", via: "runos", calls: 486, sharePct: 40, topAsset: "投标知识库" },
    { code: "scribe", via: "direct", calls: 326, sharePct: 27, topAsset: "平台产品资料" },
    { code: "anlan", via: "direct", calls: 231, sharePct: 19, topAsset: "巡检问答沉淀" },
    { code: "raven", via: "runos", calls: 161, sharePct: 14, topAsset: "设备作业手册" },
  ],
  activation: [
    { label: "端点已实现", done: true, note: "无状态 MCP · tools/list 即注册契约" },
    { label: "凭证绑定", done: false, note: "RUNOS_CHANNEL_TOKEN 待下发(宿主环境)" },
    { label: "Runos 侧注册", done: false, note: "runos#156 · 两个能力的端点登记" },
    { label: "promote 稳定档", done: false, note: "需凭证绑定先行(硬门)" },
  ],
  sources: { traffic: "demo", registry: "demo" },
  demoOps: true,
};
