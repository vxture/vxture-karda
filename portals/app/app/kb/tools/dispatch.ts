// Tool dispatch: given an authenticated caller and a tool name + args, enforce
// the mode gate, then route. The gate runs BEFORE any backend check, so a
// service-mode call to an OBO-only tool gets 403 access_denied whether or not
// that tool's backend exists yet - the authorization semantics do not wait on
// the plumbing.
//
// list_kbs is fully wired (KbService exists). search/ask are wired to the
// retrieval chain (the chain exists; its recall backends are stubbed, TD-008).
// create_kb / attach / detach / write / create_entry pass the gate but return
// not_implemented, because their runtime (task worker, C2 attachment fill) is
// TD-007/008 - honest, and crucially the OBO-only refusal is already enforced.
import { toolByName, checkMode, type CallMode } from "./catalog";
import type { CallerContext } from "./s2s";

export interface DispatchResult {
  status: number;
  body: Record<string, unknown>;
}

export interface ToolBackends {
  listKbs(workspaceId: string, filter?: "attached" | "visible"): Promise<unknown>;
  // search/ask are injected as thunks so the route composes the retrieval chain;
  // dispatch stays free of the chain's construction details.
  search?(caller: CallerContext, args: Record<string, unknown>): Promise<unknown>;
  ask?(caller: CallerContext, args: Record<string, unknown>): Promise<unknown>;
}

const notImplemented = (name: string): DispatchResult => ({
  status: 501,
  body: { error: "not_implemented", detail: `${name} backend is not wired yet` },
});

const accessDenied = (reason: string): DispatchResult => ({
  status: 403,
  body: { error: "access_denied", detail: reason },
});

export async function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  caller: CallerContext,
  backends: ToolBackends,
): Promise<DispatchResult> {
  const tool = toolByName(name);
  if (!tool) return { status: 404, body: { error: "unknown_tool", detail: name } };

  // The mode gate - the OBO-only rule, before anything else.
  const gate = checkMode(tool, caller.mode as CallMode);
  if (!gate.allowed) return accessDenied(gate.reason);

  // A tool requiring a user must have one even in OBO (defensive: OBO implies a
  // sub, but assert it rather than trust the shape).
  if (tool.mode === "obo_only" && !caller.user) {
    return accessDenied("this tool requires a user identity");
  }

  const ws = caller.workspace;
  if (!ws) return { status: 400, body: { error: "no_workspace", detail: "token carries no workspace" } };

  switch (name) {
    case "karda.list_kbs": {
      const filter = args.filter === "attached" || args.filter === "visible" ? args.filter : undefined;
      const kbs = await backends.listKbs(ws, filter);
      return { status: 200, body: { knowledgeBases: kbs as unknown as Record<string, unknown> } };
    }
    case "karda.search": {
      if (!backends.search) return notImplemented(name);
      const result = await backends.search(caller, args);
      return { status: 200, body: { result: result as Record<string, unknown> } };
    }
    case "karda.ask": {
      if (!backends.ask) return notImplemented(name);
      const result = await backends.ask(caller, args);
      return { status: 200, body: { result: result as Record<string, unknown> } };
    }
    // OBO-only tools: gate already passed (so a service call was refused above),
    // but the runtime behind them is not built. Return not_implemented rather
    // than a fake success.
    case "karda.create_kb":
    case "karda.attach_kb":
    case "karda.detach_kb":
    case "karda.write_document":
    case "karda.create_entry":
      return notImplemented(name);
    default:
      return { status: 404, body: { error: "unknown_tool", detail: name } };
  }
}
