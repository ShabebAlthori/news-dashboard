// Standalone scheduler, for deployments that run the web server with DISABLE_SCHEDULER=true
// (for example several web replicas sharing one database). Usage: `npm run worker`.
import { runRefresh } from "../src/lib/server/pipeline";
import { getPrefs } from "../src/lib/server/settings";

let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));

async function loop() {
  while (!stopping) {
    const result = await runRefresh("schedule").catch((err) => {
      console.error("[worker] refresh failed", err);
      return null;
    });
    if (result && result.status !== "skipped") {
      console.log(`[worker] ${new Date().toISOString()} ${result.status}: ${result.newArticles} new, ${result.summarized} summarized`);
    }
    const minutes = Math.min(15, Math.max(10, getPrefs().refreshMinutes));
    for (let waited = 0; waited < minutes * 60 && !stopping; waited++) await new Promise((r) => setTimeout(r, 1000));
  }
  process.exit(0);
}

void loop();
