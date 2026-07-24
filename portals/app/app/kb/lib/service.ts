// KnowledgeBase asset-layer service: the one place that composes the ownership
// rules (ownership.ts), the persistence port (store.ts), and the invariants the
// DB also holds. Routes call this; this calls the store. The rule the service
// keeps that the DB cannot is authorization - who may do a thing - because the
// DB sees rows, not actors.
import {
  ownershipShapeValid,
  canPublish,
  canTransferOwnership,
  type Actor,
  type KbOwnership,
  type OwnerType,
  type PublishState,
} from "./ownership";
import type { CreateKbInput, KbStore, KnowledgeBaseRow, UpdateKbInput } from "./store";

export type ServiceError =
  | { code: "invalid_ownership_shape" }
  | { code: "name_taken" }
  | { code: "not_found" }
  | { code: "forbidden"; reason: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: ServiceError): Result<never> => ({ ok: false, error });

function ownershipOf(row: KnowledgeBaseRow): KbOwnership {
  return {
    ownerType: row.ownerType,
    ownerSub: row.ownerSub,
    workspaceId: row.workspaceId,
    publishState: row.publishState,
  };
}

export class KbService {
  constructor(private store: KbStore) {}

  async create(input: CreateKbInput): Promise<Result<KnowledgeBaseRow>> {
    if (!ownershipShapeValid({ ownerType: input.ownerType, ownerSub: input.ownerSub })) {
      return err({ code: "invalid_ownership_shape" });
    }
    if (await this.store.nameTaken(input.workspaceId, input.name)) {
      return err({ code: "name_taken" });
    }
    return ok(await this.store.createKb(input));
  }

  async get(id: string): Promise<Result<KnowledgeBaseRow>> {
    const row = await this.store.getKb(id);
    return row ? ok(row) : err({ code: "not_found" });
  }

  async list(workspaceId: string): Promise<KnowledgeBaseRow[]> {
    return this.store.listKbs(workspaceId);
  }

  /**
   * Rename / reconfigure. Publish-state changes are NOT accepted here - they go
   * through `setPublishState` because they carry an authorization rule the plain
   * config patch does not. Splitting them stops a caller sneaking a publish
   * through the config path where the ladder check would be skipped.
   */
  async update(
    id: string,
    patch: Omit<UpdateKbInput, "publishState">,
  ): Promise<Result<KnowledgeBaseRow>> {
    const row = await this.store.getKb(id);
    if (!row) return err({ code: "not_found" });
    // Whitelist the config columns at RUNTIME, not just in the type. The `Omit`
    // guards a TypeScript caller; a route handed a JSON body could still carry
    // publishState, and passing it through to the store would let a publish slip
    // past setPublishState's ladder check. Copy only the allowed keys that are
    // actually present - carrying `undefined` keys through would null unspecified
    // columns under the in-memory store's Object.assign.
    const ALLOWED = [
      "name",
      "description",
      "processingTemplateId",
      "governanceEnabled",
      "exemptSyncedContent",
    ] as const;
    const safe: Omit<UpdateKbInput, "publishState"> = {};
    for (const k of ALLOWED) {
      if (patch[k] !== undefined) (safe as Record<string, unknown>)[k] = patch[k];
    }
    if (safe.name && safe.name !== row.name) {
      if (await this.store.nameTaken(row.workspaceId, safe.name, id)) {
        return err({ code: "name_taken" });
      }
    }
    const updated = await this.store.updateKb(id, safe);
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  async setPublishState(
    id: string,
    actor: Actor,
    target: PublishState,
  ): Promise<Result<KnowledgeBaseRow>> {
    const row = await this.store.getKb(id);
    if (!row) return err({ code: "not_found" });
    const decision = canPublish(ownershipOf(row), actor, target);
    if (!decision.allowed) return err({ code: "forbidden", reason: decision.reason });
    const updated = await this.store.updateKb(id, { publishState: target });
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  /**
   * Whether `actor` is permitted to transfer this library - a pure check the
   * caller can run to gate a UI or an admin flow. The transfer WRITE itself is
   * deliberately not here: `owner_sub` is column-locked (98_column_locks), so
   * the service role cannot change it by design, and it should not - reassigning
   * a departed user's library is an administrative act that belongs on a
   * privileged path (db-init-style), not on the runtime service role. Modelling
   * it as a normal update would require widening the column lock, which would
   * hand the runtime a capability the governance design intentionally withholds.
   * Tracked as a known gap; see the workplan.
   */
  async canTransfer(id: string, actor: Actor): Promise<Result<true>> {
    const row = await this.store.getKb(id);
    if (!row) return err({ code: "not_found" });
    const decision = canTransferOwnership(ownershipOf(row), actor);
    return decision.allowed ? ok(true) : err({ code: "forbidden", reason: decision.reason });
  }

  async remove(id: string): Promise<Result<true>> {
    const done = await this.store.softDeleteKb(id);
    return done ? ok(true) : err({ code: "not_found" });
  }
}

export type { OwnerType };
