// Persistence port for Binding - the subscription between a KnowledgeBase and one
// syncable external source (220-connector-framework section 3). The table already
// exists (schema.prisma `binding`); this surfaces it. In-memory for the offline
// path, Prisma over karda_kb when DATABASE_URL is set.
import { prismaEnabled, getPrismaClient } from "../../lib/db";

export type BindingMode = "backfill" | "incremental";
export type BindingState = "active" | "paused" | "revoked";

export interface BindingRow {
  id: string;
  kbId: string;
  connectorCode: string;
  externalSourceId: string;
  mode: BindingMode;
  state: BindingState;
  cursor: string | null;
  lastSyncedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBindingInput {
  kbId: string;
  connectorCode: string;
  externalSourceId: string;
  mode?: BindingMode;
  createdBy?: string | null;
}

export interface BindingStore {
  create(input: CreateBindingInput): Promise<BindingRow>;
  get(id: string): Promise<BindingRow | null>;
  listForKb(kbId: string): Promise<BindingRow[]>;
  /** The uniqueness key (kb, connector, source) - a source is bound to a KB once. */
  findBySource(kbId: string, connectorCode: string, externalSourceId: string): Promise<BindingRow | null>;
  setState(id: string, state: BindingState): Promise<BindingRow | null>;
  setMode(id: string, mode: BindingMode): Promise<BindingRow | null>;
  setCursor(id: string, cursor: string | null, lastSyncedAt: Date): Promise<BindingRow | null>;
}

// --- in-memory ---------------------------------------------------------------

let seq = 0;
const nid = () => `bnd_${(seq += 1).toString(16).padStart(8, "0")}`;

export class InMemoryBindingStore implements BindingStore {
  private rows = new Map<string, BindingRow>();

  async create(input: CreateBindingInput): Promise<BindingRow> {
    const now = new Date();
    const row: BindingRow = {
      id: nid(),
      kbId: input.kbId,
      connectorCode: input.connectorCode,
      externalSourceId: input.externalSourceId,
      mode: input.mode ?? "backfill",
      state: "active",
      cursor: null,
      lastSyncedAt: null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return { ...row };
  }
  async get(id: string): Promise<BindingRow | null> {
    const r = this.rows.get(id);
    return r ? { ...r } : null;
  }
  async listForKb(kbId: string): Promise<BindingRow[]> {
    return [...this.rows.values()].filter((r) => r.kbId === kbId).map((r) => ({ ...r }));
  }
  async findBySource(kbId: string, connectorCode: string, externalSourceId: string): Promise<BindingRow | null> {
    const r = [...this.rows.values()].find(
      (x) => x.kbId === kbId && x.connectorCode === connectorCode && x.externalSourceId === externalSourceId,
    );
    return r ? { ...r } : null;
  }
  async setState(id: string, state: BindingState): Promise<BindingRow | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    r.state = state;
    r.updatedAt = new Date();
    return { ...r };
  }
  async setMode(id: string, mode: BindingMode): Promise<BindingRow | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    r.mode = mode;
    r.updatedAt = new Date();
    return { ...r };
  }
  async setCursor(id: string, cursor: string | null, lastSyncedAt: Date): Promise<BindingRow | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    r.cursor = cursor;
    r.lastSyncedAt = lastSyncedAt;
    r.updatedAt = new Date();
    return { ...r };
  }
}

// --- Prisma ------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRow(r: any): BindingRow {
  return {
    id: r.id,
    kbId: r.kbId,
    connectorCode: r.connectorCode,
    externalSourceId: r.externalSourceId,
    mode: r.mode as BindingMode,
    state: r.state as BindingState,
    cursor: r.cursor,
    lastSyncedAt: r.lastSyncedAt,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PrismaBindingStore implements BindingStore {
  async create(input: CreateBindingInput): Promise<BindingRow> {
    const p = await getPrismaClient();
    return toRow(
      await p.binding.create({
        data: {
          kbId: input.kbId,
          connectorCode: input.connectorCode,
          externalSourceId: input.externalSourceId,
          mode: input.mode ?? "backfill",
          createdBy: input.createdBy ?? null,
        },
      }),
    );
  }
  async get(id: string): Promise<BindingRow | null> {
    const p = await getPrismaClient();
    const r = await p.binding.findUnique({ where: { id } });
    return r ? toRow(r) : null;
  }
  async listForKb(kbId: string): Promise<BindingRow[]> {
    const p = await getPrismaClient();
    return (await p.binding.findMany({ where: { kbId }, orderBy: { createdAt: "asc" } })).map(toRow);
  }
  async findBySource(kbId: string, connectorCode: string, externalSourceId: string): Promise<BindingRow | null> {
    const p = await getPrismaClient();
    const r = await p.binding.findFirst({ where: { kbId, connectorCode, externalSourceId } });
    return r ? toRow(r) : null;
  }
  async setState(id: string, state: BindingState): Promise<BindingRow | null> {
    return this.patch(id, { state });
  }
  async setMode(id: string, mode: BindingMode): Promise<BindingRow | null> {
    return this.patch(id, { mode });
  }
  async setCursor(id: string, cursor: string | null, lastSyncedAt: Date): Promise<BindingRow | null> {
    return this.patch(id, { cursor, lastSyncedAt });
  }
  private async patch(id: string, data: Record<string, unknown>): Promise<BindingRow | null> {
    const p = await getPrismaClient();
    const res = await p.binding.updateMany({ where: { id }, data: { ...data, updatedAt: new Date() } });
    if (res.count === 0) return null;
    return this.get(id);
  }
}

export function getBindingStore(): BindingStore {
  return prismaEnabled() ? new PrismaBindingStore() : new InMemoryBindingStore();
}
