import { flushUsage } from "./flush";
let started = false;
export function startUsageWorker(): void {
  if (started) return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await flushUsage();
      if (result.scanned) console.info("[usage/flush]", result);
    } catch { console.error("[usage/flush] unavailable; durable rows retained"); }
    finally { running = false; }
  };
  setTimeout(() => { void tick(); }, 2000).unref();
  setInterval(() => { void tick(); }, 30000).unref();
}
