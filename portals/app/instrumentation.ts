// Node-only long-running service hooks; no schema writes or browser polling.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build"
    || !process.env.PLATFORM_API_URL || !process.env.OIDC_CLIENT_SECRET || !process.env.DATABASE_URL) return;
  const { startProvisioningReconciliation } = await import("./app/provisioning/lib/reconcile");
  startProvisioningReconciliation();
}
