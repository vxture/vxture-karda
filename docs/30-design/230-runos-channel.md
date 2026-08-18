# 230 - The Runos channel (karda as a commercial-capability supplier)

- Status: v1.0, implemented 2026-08-18 (endpoint + tool surface); Runos-side
  registration pending (section 6)
- Authority upstream: the Runos architecture + interface docs (2026-08-18 doc
  set), ADR-003/005/008 (Runos), the owner's product definition ("Knowledge
  Service" + "Karda 与 Runos 的关系" + "Agent 向 Karda 沉淀知识" sections,
  2026-08-18)
- Owner direction 2026-08-18: the capability platform gets knowledge READ and
  WRITE interfaces.

## 1. What this is

Runos is the L1 commercial capability plane: business-scenario L3 agents reach
every commercial capability through its gateway (`POST /v1/mcp`, four fixed
tools: discover/resolve/invoke/report_outcome). karda is a SUPPLIER on that
plane: it registers knowledge capabilities whose endpoint instances Runos's
gateway invokes over MCP.

The owner's product definition fixes the ownership boundary: Runos may wrap
karda's knowledge abilities as resources, but **karda remains the owner of the
knowledge capability** - both the direct S2S channel (`/api/tools/:tool`) and
the Runos channel front the SAME knowledge service. Implementation enforces
that: both routes assemble backends via one `buildToolBackends()`
(`kb/tools/backends.ts`); the channels differ only in authentication and
gating.

## 2. The capability contract (what gets registered in Runos)

Two capabilities, one endpoint:

| capability_id | operations (snake_case MCP tools) | risk level |
|---|---|---|
| `karda.kb-read` | `search` · `ask` · `list_kbs` | read |
| `karda.kb-write` | `write_document` · `create_entry` | write |

Registration facts that bind us (from the Runos interface doc):

- Runos **live-pulls `tools/list`** at endpoint registration and whenever an
  endpoint returns to `active`, and rejects a registration whose declared
  operations the endpoint does not serve (`409 tools_list_mismatch`). So
  `kb/mcp/tools.ts` IS the registration contract; the declared operations of
  both capabilities are a subset of one endpoint's tools/list, which is legal.
- Operation names must be snake_case; `interaction_mode` sync only.
- Registration validation returns ALL violations at once
  (`registration_invalid` with `errors[]`).
- `promote` to stable requires the credential binding to exist FIRST
  (`credential_binding_missing` hard gate) - see section 4 ordering.
- Skill-style rules (exactly one read-level fetch) do NOT apply: these are
  Connector capabilities.

## 3. The endpoint (karda side)

`POST /api/mcp` - MCP Streamable HTTP, **stateless**: each POST is one
JSON-RPC exchange; no session, no SSE (`GET` is 405). Methods: `initialize`,
`ping`, `tools/list`, `tools/call`; notifications are 202-acknowledged and
dropped. Unknown tool name in `tools/call` is a JSON-RPC error
(`invalid params`); everything after auth that fails inside a tool is an
`isError` tool result mirroring the payload in `content[0].text` and
`structuredContent` - the same two-layer rule Runos itself uses.

## 4. Authentication and the credential binding

Runos injects credentials per the capability contract's
`credential_requirements[]` (carrier/name/scheme - verified by Runos against
real third-party endpoints, TD-018 closed on their side). karda declares:

```json
{ "class": "channel", "carrier": "header", "name": "Authorization", "scheme": "Bearer" }
```

karda verifies the bearer against `RUNOS_CHANNEL_TOKEN` (host env):
constant-time (sha256 + timingSafeEqual), unset = **503 fail-closed** (never a
401 - that would send the operator to the wrong console), and
`x-vxture-internal-auth` is refused as a category error exactly like the S2S
gateway.

Provisioning order (Runos's promote hard-gate dictates it): (1) mint the token,
set it on karda's host env; (2) store it in Runos's credential vault
(`POST /governance/credentials`, mode `account-scoped` - `per-caller` is
blocked on platform token exchange) with `applies-to` covering both
capabilities; (3) register + promote.

## 5. Channel rules (the deliberate deltas vs the direct S2S channel)

1. **Service mode, context in arguments.** Runos's per-caller credentials do
   not exist yet, so calls arrive with the account-scoped channel credential
   and NO caller token. Tenant context (`org_id` = platform tenant UUID,
   `workspace_id`) is REQUIRED on every operation's arguments.
   Capability-level authorization (grant, risk_scope, quota, critical
   approval) has already run inside Runos before the call reaches us (ADR-008
   two-layer split); karda keeps the object-level checks: the target library
   must exist in the caller-named workspace, visibility gates every read.
2. **`kb_ids` is required on search/ask and is a PRESET merge** (product_110
   D5): a service caller has no user attachment list, so it names its
   libraries explicitly; ids that are not visible are dropped and echoed in
   `ignored_kb_ids` (never an existence probe - only echoes what the caller
   sent). The direct channel gains the same optional `preset_kb_ids` argument.
3. **Writes are allowed in service mode on THIS channel** (the owner's
   2026-08-18 direction). The direct channel's OBO-only rule guards against a
   background task forging USER assets; a Runos-channel write is a PRODUCT
   act and is safe because content lands as `processing` (documents) /
   `draft` (entries) and flows the governance ladder - the owner's product
   definition section 15 (Draft -> Review/Verify -> Published) is exactly the
   existing pipeline + verification runtime. Nothing written through this
   channel is directly published.
4. **`task_id` is the cross-plane attribution key**: optional but strongly
   preferred, and should be the SAME value the agent sent Runos in
   `_meta.vxture.task_id`; karda threads it to every Atlas call it makes on
   behalf of the request, closing the metering chain
   (agent -> runos -> karda -> atlas) under one work-unit id.
5. **Attribution of the write actor**: since 2026-08-18 every write path fills
   the row-level provenance columns - `created_in_product` = the channel's
   product ("runos" here; the S2S act.sub on the direct channel; "karda" for a
   Console upload) and `created_by` = the OBO user when one exists (null on
   this channel's service-mode writes). Per-AGENT attribution still lives in
   Runos's audit (`capability.call` rows carry agent/task) until the runos line
   answers whether the gateway forwards caller identity (runos#156 Q1) - if it
   does, the actor lands in `created_by` as a follow-up.

## 6. What remains (ops + liaison, no karda code)

1. Mint `RUNOS_CHANNEL_TOKEN`, set on the karda host, store in the Runos
   credential vault (section 4 order).
2. Register both capabilities + the endpoint instance
   (`https://karda.vxture.com/api/mcp` or the tailnet base) in Runos's
   registry via opera; promote to stable; verify discover/resolve/invoke
   end-to-end.
3. Liaison letter to the runos line: registration request + two contract
   questions (does the gateway forward any caller identity to endpoints; is
   the endpoint base expected on tailnet or the public edge).
4. Grants: business agents get `karda.kb-read` (and `karda.kb-write` where
   their scenario warrants) per ADR-008 product-subject grants - a Runos
   operator act, not ours.
