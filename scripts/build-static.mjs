// Builds the static web edition into ./out (used by the GitHub Pages workflow).
//   BASE_PATH=/news-dashboard npm run build:static
// Server-only entry points (API routes, auth proxy, scheduler) are set aside during the
// build because a static site has no server, then restored.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const stash = path.join(root, ".static-build-stash");
const serverOnly = ["src/app/api", "src/proxy.ts", "src/instrumentation.ts"];
const basePath = (process.env.BASE_PATH ?? "").replace(/\/$/, "");

fs.rmSync(stash, { recursive: true, force: true });
fs.mkdirSync(stash, { recursive: true });
const moved = [];
try {
  for (const rel of serverOnly) {
    const from = path.join(root, rel);
    if (!fs.existsSync(from)) continue;
    const to = path.join(stash, rel.replaceAll("/", "__"));
    fs.renameSync(from, to);
    moved.push([from, to]);
  }
  execSync("npx next build", {
    stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_STATIC: "1", NEXT_PUBLIC_BASE_PATH: basePath, NEXT_TELEMETRY_DISABLED: "1" },
  });
  // GitHub Pages: serve "_next" as-is (no Jekyll processing).
  fs.writeFileSync(path.join(root, "out", ".nojekyll"), "");
} finally {
  for (const [from, to] of moved.reverse()) fs.renameSync(to, from);
  fs.rmSync(stash, { recursive: true, force: true });
}
console.log(`Static site written to ./out (base path: "${basePath || "/"}")`);
