import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { withTimeout } from "../../lib/probes";

type Env = Record<string, string | undefined>;
const OSS_KEYS = ["ALIYUN_OSS_BUCKET", "ALIYUN_OSS_REGION", "ALIYUN_OSS_ACCESS_KEY_ID", "ALIYUN_OSS_ACCESS_KEY_SECRET"] as const;

/** Configuration presence only; never claims a successful remote storage probe. */
export function storageConfiguration(env: Env): boolean | null {
  const configured = OSS_KEYS.filter(key => Boolean(env[key]?.trim())).length;
  if (configured === OSS_KEYS.length) return true;
  // Partial cloud configuration must not silently select another backend.
  if (configured > 0) return false;
  // KD-019 cloud migration remains HELD. A reviewed persistent filesystem
  // mount is the supported interim deployment, never an in-memory fallback.
  if (env.KARDA_OBJECT_ROOT?.trim()) return true;
  return null;
}

export async function probeStorageConfiguration(env: Env): Promise<boolean | null> {
  const configuration = storageConfiguration(env);
  if (configuration !== true || OSS_KEYS.every(key => Boolean(env[key]?.trim()))) return configuration;
  return withTimeout((async () => {
    try {
      const root = env.KARDA_OBJECT_ROOT!;
      await access(root, constants.R_OK | constants.W_OK);
      return (await stat(root)).isDirectory();
    } catch { return false; }
  })(), 1_000, false);
}
