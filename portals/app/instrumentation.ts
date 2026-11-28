// Node-only long-running service hooks; no schema writes or browser polling.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    if(process.env.DATABASE_URL){const {startPublicJobDispatch}=await import("./app/operations/lib/worker");startPublicJobDispatch();}
    if (!process.env.PLATFORM_API_URL
      || !process.env.OIDC_CLIENT_SECRET || !process.env.DATABASE_URL) return;
    const { startProvisioningReconciliation } = await import("./app/provisioning/lib/reconcile");
    startProvisioningReconciliation();
    const { startUsageWorker } = await import("./app/usage/lib/worker");
    startUsageWorker();
    const { startAccessOutbox } = await import("./app/events/outbox");
    startAccessOutbox();
    const { startStorageRecovery } = await import("./app/kb/storage/worker");
    startStorageRecovery();
    const { startProcessingDispatch } = await import("./app/kb/processing/dispatch");
    startProcessingDispatch();
    const { startProductionDispatch } = await import("./app/kb/production/runtime");
    startProductionDispatch();
    const { startPushDispatch } = await import("./app/kb/push/runtime");
    startPushDispatch();
    const {startGraphDispatch}=await import("./app/kb/graph/runtime");
    startGraphDispatch();
    const {startAutomaticDispatch}=await import("./app/kb/connectors/automatic/runtime");
    startAutomaticDispatch();
    const {startVisualDispatch}=await import("./app/kb/visual/runtime");
    startVisualDispatch();
  }
}
