import { getPrismaClient } from "../lib/db";
import { getEventBus } from "./bus";

export async function readWorkspaceRevision(ws: string): Promise<string> {
  return (await (await getPrismaClient()).accessRevision.findUnique({ where: { workspaceId: ws } }))?.generation.toString() ?? "0";
}
export async function publishWorkspaceRevision(workspaceId: string,
  publish: (ws: string, revision: string) => Promise<void> = (ws, revision) => getEventBus().publishWorkspace(ws, revision)): Promise<void> {
  const db = await getPrismaClient();
  const row = await db.accessRevision.findUnique({ where: { workspaceId } });
  if (!row) return;
  await publish(workspaceId, row.generation.toString());
  // A newer transaction must stay pending even when this older send finishes.
  await db.accessRevision.updateMany({ where: { workspaceId, generation: row.generation,
    publishedGeneration: { lt: row.generation } }, data: { publishedGeneration: row.generation } });
}
export async function flushAccessRevisions(): Promise<void> {
  const db = await getPrismaClient();
  const rows = await db.accessRevision.findMany({ where: { generation: { gt: db.accessRevision.fields.publishedGeneration } },
    orderBy: { updatedAt: "asc" }, take: 100 });
  for (const row of rows) {
    try { await publishWorkspaceRevision(row.workspaceId); }
    catch { console.error("[access/outbox] workspace publication remains pending"); }
  }
}
let started = false;
export function startAccessOutbox(): void {
  if (started) return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await flushAccessRevisions(); }
    catch { console.error("[access/outbox] publication pending; retry scheduled"); }
    finally { running = false; }
  };
  setTimeout(() => { void tick(); }, 1000).unref();
  setInterval(() => { void tick(); }, 30000).unref();
}
