// Refreshes all feeds, then writes the web edition's data files:
//   out/data/snapshot.json  — every story of the last SNAPSHOT_DAYS days (default 7)
//   out/data/status.json    — last update time, source health and AI status (polled by the page)
//   out/data/radar.json     — Data Radar items (releases, research, updates) and radar source health
//   out/data/report.json    — the latest Weekly Tech Reports
// Usage: npm run export:static [-- <output dir>] [--no-refresh]
import fs from "node:fs";
import path from "node:path";
import { runRefresh } from "../src/lib/server/pipeline";
import { exportSnapshotStories } from "../src/lib/server/queries";
import { getRadar } from "../src/lib/server/radar";
import { listReports, maybeGenerateWeeklyReport } from "../src/lib/server/report";
import { defaultPrefs } from "../src/lib/server/settings";
import { getSourcesHealth, getStatus } from "../src/lib/server/status";
import type { Snapshot } from "../src/lib/shared/types";

async function main() {
  const args = process.argv.slice(2);
  const outDir = path.resolve(args.find((a) => !a.startsWith("--")) ?? "out/data");
  const days = Math.min(30, Math.max(1, Number(process.env.SNAPSHOT_DAYS ?? 7)));

  if (!args.includes("--no-refresh")) {
    const result = await runRefresh("cron");
    console.log(JSON.stringify(result));
  }

  // Normally done by the refresh; also covers --no-refresh exports of an existing database.
  maybeGenerateWeeklyReport();
  // The page flags data as stale relative to how often this site is actually republished
  // (the workflow's cadence), not the self-hosted scheduler's preference.
  const publishMinutes = Math.min(1440, Math.max(5, Number(process.env.PUBLISH_INTERVAL_MINUTES ?? 15) || 15));
  const status = { ...getStatus(), running: false, nextRunAt: null, intervalMinutes: publishMinutes };
  const sources = getSourcesHealth();
  const stories = exportSnapshotStories(days);
  // Written after the refresh finished, so the page never thinks a newer update exists.
  const generatedAt = new Date().toISOString();
  const snapshot: Snapshot = { version: 1, generatedAt, retentionDays: days, status, sources, defaultPrefs: defaultPrefs(), stories };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "snapshot.json"), JSON.stringify(snapshot));
  fs.writeFileSync(path.join(outDir, "radar.json"), JSON.stringify({ ...getRadar(), generatedAt }));
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ generatedAt, reports: listReports(6) }));
  // status.json last: the page polls it and then loads the other files at this version.
  fs.writeFileSync(path.join(outDir, "status.json"), JSON.stringify({ generatedAt, status, sources }));
  const kb = Math.round(fs.statSync(path.join(outDir, "snapshot.json")).size / 1024);
  console.log(`Wrote ${stories.length} stories (${kb} KB) to ${outDir}`);
  if (!status.lastSuccessAt && stories.length === 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
