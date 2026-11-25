export async function register() {
  // Only start the feed scheduler in the Node.js server runtime, never during `next build`.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./lib/server/scheduler");
  startScheduler();
}
