// Binding lifecycle (220-connector-framework section 3). A Binding is the
// subscription of a library to one external source; this service owns the rules
// the store cannot: the connector must be a known one, a source binds to a KB at
// most once, and the state machine active <-> paused -> revoked is one-way into
// the terminal `revoked`.
//
// Registration is an OWNER act carried out OBO (section 9) - the route resolves
// the actor; this service assumes an authorized caller and enforces the domain
// rules. The revoke CASCADE (excluding the binding's content from recall) needs
// the document<->binding linkage that lands with the connector data-plane, so
// revoke here moves the binding to its terminal state and the cascade is wired in
// that later batch.
import type { BindingStore, BindingRow, BindingMode, BindingState, CreateBindingInput } from "./binding-store";
import { isKnownConnector } from "./catalog";

export type BindingError =
  | { code: "unknown_connector" }
  | { code: "binding_exists" }
  | { code: "not_found" }
  | { code: "illegal_transition"; from: BindingState; to: BindingState };

export type Result<T> = { ok: true; value: T } | { ok: false; error: BindingError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: BindingError): Result<never> => ({ ok: false, error });

// active/paused are interchangeable; revoked is terminal (section 3).
const TRANSITIONS: Record<BindingState, readonly BindingState[]> = {
  active: ["paused", "revoked"],
  paused: ["active", "revoked"],
  revoked: [],
};

export class BindingService {
  constructor(private store: BindingStore) {}

  /**
   * Bind a source to a library. Starts in `backfill` mode (first full sync) and
   * `active`. Refuses an unknown connector, and the same source bound twice.
   */
  async create(input: CreateBindingInput): Promise<Result<BindingRow>> {
    if (!isKnownConnector(input.connectorCode)) return err({ code: "unknown_connector" });
    if (!input.externalSourceId) return err({ code: "not_found" });
    const existing = await this.store.findBySource(input.kbId, input.connectorCode, input.externalSourceId);
    if (existing) return err({ code: "binding_exists" });
    return ok(await this.store.create({ ...input, mode: input.mode ?? "backfill" }));
  }

  async get(id: string): Promise<Result<BindingRow>> {
    const r = await this.store.get(id);
    return r ? ok(r) : err({ code: "not_found" });
  }

  async listForKb(kbId: string): Promise<BindingRow[]> {
    return this.store.listForKb(kbId);
  }

  async pause(id: string): Promise<Result<BindingRow>> {
    return this.transition(id, "paused");
  }
  async resume(id: string): Promise<Result<BindingRow>> {
    return this.transition(id, "active");
  }
  /** Revoke: terminal. The recall-exclusion cascade lands with the data-plane. */
  async revoke(id: string): Promise<Result<BindingRow>> {
    return this.transition(id, "revoked");
  }

  /** Promote a completed backfill to steady-state incremental sync. */
  async promoteToIncremental(id: string): Promise<Result<BindingRow>> {
    const b = await this.store.get(id);
    if (!b) return err({ code: "not_found" });
    if (b.mode === "incremental") return ok(b);
    const updated = await this.store.setMode(id, "incremental" as BindingMode);
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  private async transition(id: string, to: BindingState): Promise<Result<BindingRow>> {
    const b = await this.store.get(id);
    if (!b) return err({ code: "not_found" });
    if (b.state === to) return ok(b); // idempotent no-op
    if (!TRANSITIONS[b.state].includes(to)) {
      return err({ code: "illegal_transition", from: b.state, to });
    }
    const updated = await this.store.setState(id, to);
    return updated ? ok(updated) : err({ code: "not_found" });
  }
}
