// One-off refresh: `npm run refresh` (fetches all feeds, clusters, scores and summarizes).
import { runRefresh } from "../src/lib/server/pipeline";

runRefresh("cli")
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.status === "failed" ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
