import { cookies } from "next/headers";
import { getOidcConfig } from "../auth/lib/config";
import { resolveSessionUser } from "../auth/lib/session";
import { probeStorageConfiguration } from "../kb/storage/config";
import { probeDb, probeRedis } from "./probes";
import { createStatusReader, statusMode } from "./status";

const processCache = globalThis as typeof globalThis & { kardaStatusReader?: ReturnType<typeof createStatusReader> };
export const readStatus = processCache.kardaStatusReader ??= createStatusReader(async () => {
  const [database, redis, storage] = await Promise.all([
    probeDb(process.env.DATABASE_URL),
    probeRedis(process.env.REDIS_URL),
    probeStorageConfiguration(process.env),
  ]);
  return { database: database === true, redis: redis === true, storage: storage === true };
});

export async function statusAccess() {
  const mode = statusMode(process.env);
  if (mode === "off") return 404;
  if (mode === "public") return 200;

  const config = getOidcConfig();
  const jar = await cookies();
  const token = jar.get(config.cookieName)?.value;
  if (!token) return 401;
  const session = await resolveSessionUser(config, token);
  return !session.available ? 503 : session.user ? 200 : 401;
}
