// Copies the frozen app dataset (repo data/app) into web/public/data so the app is fully local.
// Runs automatically before `dev` and `build`. Fixtures are NOT copied (tests read them in place).
import { copyFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "data", "app");
const dst = join(here, "..", "public", "data");
mkdirSync(dst, { recursive: true });
for (const f of ["candidates.geojson", "meta.json"]) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.error(`sync-data: missing ${from} (run scripts/export_app_data.py)`);
    process.exit(1);
  }
  copyFileSync(from, join(dst, f));
  console.log(`sync-data: ${f} (${(statSync(from).size / 1e6).toFixed(2)} MB)`);
}
