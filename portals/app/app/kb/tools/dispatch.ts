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
  // get_evidence always answers 200 with a status inside the body - including
  // for a citation the caller cannot see. A 403 or 404 there would make the
  // tool an oracle for probing which chunk ids exist in other libraries.
  getEvidence?(caller: CallerContext, citationId: string): Promise<unknown>;
  // find_entity answers 200 with an empty result for a name nobody can see,
  // for the same reason get_evidence does: a distinguishable refusal maps the
  // entity registries of libraries the caller has no access to.
  findEntity?(caller: CallerContext, name: string): Promise<unknown>;
  getContext?(caller: CallerContext, citationId: string, radius: unknown): Promise<unknown>;
  browse?(caller: CallerContext, kbId: string, target: string, pageSize: unknown, cursor: unknown): Promise<unknown>;
  // write_document returns a full DispatchResult (it has real 4xx cases:
  // not-found library, duplicate, bad args), so the backend owns the status, not
  // dispatch. Injected by the route (TD-009 track 9a).
  writeDocument?(caller: CallerContext, args: Record<string, unknown>): Promise<DispatchResult>;
  // create_entry likewise owns its status (unknown template, field validation,
  // not-found library). Injected by the route (TD-009 track 9b).
  createEntry?(caller: CallerContext, args: Record<string, unknown>): Promise<DispatchResult>;
  // create_kb / attach_kb / detach_kb own their status (name_taken, not-found /
  // not-visible library). Injected by the route (TD-009 track 9b, attachment store).
  createKb?(caller: CallerContext, args: Record<string, unknown>): Promise<DispatchResult>;
  attachKb?(caller: CallerContext, args: Record<string, unknown>): Promise<DispatchResult>;
  detachKb?(caller: CallerContext, args: Record<string, unknown>): Promise<DispatchResult>;
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
    case "karda.find_entity": {
      if (!backends.findEntity) return notImplemented(name);
      const entityName = typeof args.name === "string" ? args.name.trim() : "";
      if (!entityName) {
        return { status: 400, body: { error: "invalid_argument", detail: "name is required" } };
      }
      const result = await backends.findEntity(caller, entityName);
      return { status: 200, body: { result: result as unknown as Record<string, unknown> } };
    }
    case "karda.browse": {
      if (!backends.browse) return notImplemented(name);
      const kbId = typeof args.kb_id === "string" ? args.kb_id.trim() : "";
      if (!kbId) {
        return { status: 400, body: { error: "invalid_argument", detail: "kb_id is required" } };
      }
      // An unknown target is a 400 rather than a silent fallback to assertions:
      // a caller that asked for entities and got assertions would read the
      // answer as "this library has no entities".
      const target = typeof args.target === "string" ? args.target.trim() : "assertions";
      if (target !== "assertions" && target !== "entities") {
        return { status: 400, body: { error: "invalid_argument", detail: "target must be assertions or entities" } };
      }
      const pageResult = await backends.browse(caller, kbId, target, args.page_size, args.cursor);
      return { status: 200, body: { result: pageResult as unknown as Record<string, unknown> } };
    }
    case "karda.get_context": {
      if (!backends.getContext) return notImplemented(name);
      const citationId = typeof args.citation_id === "string" ? args.citation_id.trim() : "";
      if (!citationId) {
        return { status: 400, body: { error: "invalid_argument", detail: "citation_id is required" } };
      }
      // radius is NOT validated here - clampRadius treats anything unreadable as
      // the default. A malformed width must not cost the caller its citation.
      const context = await backends.getContext(caller, citationId, args.radius);
      return { status: 200, body: { result: context as unknown as Record<string, unknown> } };
    }
    case "karda.get_evidence": {
      if (!backends.getEvidence) return notImplemented(name);
      const citationId = typeof args.citation_id === "string" ? args.citation_id.trim() : "";
      if (!citationId) {
        return { status: 400, body: { error: "invalid_argument", detail: "citation_id is required" } };
      }
      const result = await backends.getEvidence(caller, citationId);
      return { status: 200, body: { result: result as unknown as Record<string, unknown> } };
    }
    // write_document (9a) and create_entry (9b) are wired: each captures content
    // and owns its status (both have real 4xx cases). write_document enqueues on
    // the runtime; create_entry writes a template-shaped draft.
    case "karda.write_document":
      return backends.writeDocument ? backends.writeDocument(caller, args) : notImplemented(name);
    case "karda.create_entry":
      return backends.createEntry ? backends.createEntry(caller, args) : notImplemented(name);
    // create_kb / attach_kb / detach_kb are wired (TD-009 9b, attachment store):
    // each owns its status (name_taken, not-found / not-visible library).
    case "karda.create_kb":
      return backends.createKb ? backends.createKb(caller, args) : notImplemented(name);
    case "karda.attach_kb":
      return backends.attachKb ? backends.attachKb(caller, args) : notImplemented(name);
    case "karda.detach_kb":
      return backends.detachKb ? backends.detachKb(caller, args) : notImplemented(name);
    default:
      return { status: 404, body: { error: "unknown_tool", detail: name } };
  }
}
