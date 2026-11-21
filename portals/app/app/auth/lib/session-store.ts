import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

// RP session store on Redis (080-rp section 2.4). Key families are namespaced by
// client_id so multiple RPs can share one Redis:
//   vx:rp:{cid}:authstate:{state}  login handshake {verifier,nonce,returnTo}, ~600s, single-use
//   vx:rp:{cid}:sess:{rpsid}       session bundle {tokens,sid,sub,...}, TTL ~ refresh lifetime
//   vx:rp:{cid}:sididx:{sid}       SET of rpsids for a given IdP sid (back-channel logout)
//   vx:rp:{cid}:bclogout:{jti}     logout_token replay guard
//
// Store failures throw: callers must distinguish unavailable from anonymous.

let client: Redis | null = null;

/** Graceful shutdown, including disposable-store integration tests. */
export async function closeSessionStore(): Promise<void> {
  const active = client; client = null;
  if (active) await active.quit();
}

function redis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    });
  }
  return client;
}

const k = {
  authstate: (cid: string, state: string) => `vx:rp:${cid}:authstate:${state}`,
  sess: (cid: string, rpsid: string) => `vx:rp:${cid}:sess:${rpsid}`,
  sididx: (cid: string, sid: string) => `vx:rp:${cid}:sididx:${sid}`,
  bclogout: (cid: string, jti: string) => `vx:rp:${cid}:bclogout:${jti}`,
};

export interface AuthState {
  verifier: string;
  nonce: string;
  returnTo: string;
}

export interface RpSession {
  centralNextCheckAt?: number;
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  accessExpiresAt: number; // epoch seconds
  sid?: string; // IdP session id (for back-channel logout)
  sub: string;
}

export async function putAuthState(
  cid: string,
  state: string,
  data: AuthState,
  ttlSeconds = 600,
): Promise<void> {
  await redis().set(k.authstate(cid, state), JSON.stringify(data), "EX", ttlSeconds);
}

/** Single-use: get and delete atomically (defeats state replay). */
export async function takeAuthState(cid: string, state: string): Promise<AuthState | null> {
  const raw = await redis().getdel(k.authstate(cid, state));
  return raw ? (JSON.parse(raw) as AuthState) : null;
}

export async function putSession(
  cid: string,
  rpsid: string,
  data: RpSession,
  ttlSeconds: number,
): Promise<void> {
  const r = redis();
  const tx = r.multi();
  tx.set(k.sess(cid, rpsid), JSON.stringify(data), "EX", ttlSeconds);
  if (data.sid) {
    tx.sadd(k.sididx(cid, data.sid), rpsid);
    tx.expire(k.sididx(cid, data.sid), ttlSeconds);
  }
  await tx.exec();
}

export async function getSession(cid: string, rpsid: string): Promise<RpSession | null> {
  const raw = await redis().get(k.sess(cid, rpsid));
  return raw ? (JSON.parse(raw) as RpSession) : null;
}

export async function deleteSession(cid: string, rpsid: string): Promise<void> {
  await redis().eval(
    "local raw=redis.call('get',KEYS[1]); redis.call('del',KEYS[1]); "
    + "if raw then local ok,s=pcall(cjson.decode,raw); "
    + "if ok and s.sid then redis.call('srem',ARGV[1]..s.sid,ARGV[2]) end end; return 1",
    1, k.sess(cid, rpsid), `vx:rp:${cid}:sididx:`, rpsid);
}

/** Bounded cross-replica refresh serialization, fenced by a unique lease owner. */
export async function withSessionLock<T>(cid: string, rpsid: string,
  work: (owner: string) => Promise<T>): Promise<T> {
  const lock = `vx:rp:${cid}:lock:${rpsid}`;
  const owner = randomUUID();
  const deadline = Date.now() + 12_000;
  while (!(await redis().set(lock, owner, "PX", 30_000, "NX"))) {
    if (Date.now() >= deadline) throw new Error("session_resolution_busy");
    await delay(40);
  }
  try { return await work(owner); }
  finally {
    await redis().eval("if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) end; return 0",
      1, lock, owner);
  }
}

/** Update only a still-live session under this lease; never extend its TTL. */
export async function rotateSession(cid: string, rpsid: string, expectedToken: string,
  next: RpSession, owner: string): Promise<boolean> {
  const result = await redis().eval(
    "if redis.call('get',KEYS[2])~=ARGV[3] then return -1 end; "
    + "local raw=redis.call('get',KEYS[1]); if not raw then return 0 end; "
    + "local old=cjson.decode(raw); local n=cjson.decode(ARGV[2]); "
    + "if old.accessToken~=ARGV[1] or old.sub~=n.sub or old.sid~=n.sid then return -1 end; "
    + "redis.call('set',KEYS[1],ARGV[2],'KEEPTTL','XX'); return 1",
    2, k.sess(cid, rpsid), `vx:rp:${cid}:lock:${rpsid}`,
    expectedToken, JSON.stringify(next), owner);
  if (result === -1) throw new Error("session_rotation_conflict");
  return result === 1;
}

/** Atomic central-session revocation, ordered against the refresh CAS. */
export async function deleteSessionsBySid(cid: string, sid: string): Promise<void> {
  await redis().eval(
    "local ids=redis.call('smembers',KEYS[1]); "
    + "for _,id in ipairs(ids) do redis.call('del',ARGV[1]..id) end; "
    + "redis.call('del',KEYS[1]); return #ids",
    1, k.sididx(cid, sid), `vx:rp:${cid}:sess:`);
}

export async function sessionsForSid(cid: string, sid: string): Promise<string[]> {
  return redis().smembers(k.sididx(cid, sid));
}

/** Back-channel logout replay guard: returns true only the first time for a jti. */
export async function claimBclogoutJti(cid: string, jti: string, ttlSeconds = 300): Promise<boolean> {
  const res = await redis().set(k.bclogout(cid, jti), "1", "EX", ttlSeconds, "NX");
  return res === "OK";
}
