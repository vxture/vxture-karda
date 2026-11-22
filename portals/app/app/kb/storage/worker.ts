import { getRawObjectStore } from "./objectstore";
import { ReservedObjectStore } from "./reservations";
let started = false;
export function startStorageRecovery(): void {
  if (started) return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await new ReservedObjectStore(getRawObjectStore()).recover();
      if (result.recovered || result.deleted || result.retained) console.info("[storage/recovery]", result);
    } catch { console.error("[storage/recovery] unavailable; reservations retained"); }
    finally { running = false; }
  };
  setTimeout(() => { void tick(); }, 5_000).unref();
  setInterval(() => { void tick(); }, 300_000).unref();
}
