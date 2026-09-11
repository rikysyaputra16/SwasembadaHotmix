import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");
const manifestPath = join(projectRoot, "private-migration", "r2-manifest.json");
const sourceRootArg = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
const bucket = process.env.R2_BUCKET || "swasembada-hotmix-proofs";

if (!sourceRootArg) {
  console.error("Usage: node scripts/upload-r2-proofs.mjs <original-project-root> [--dry-run]");
  console.error('Example: node scripts/upload-r2-proofs.mjs "C:/SwasembadaHotmix" --dry-run');
  process.exit(1);
}

const sourceRoot = resolve(sourceRootArg);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const missing = manifest.filter((entry) => !existsSync(join(sourceRoot, entry.sourceRelativePath)));
if (missing.length) {
  console.error(`Migration stopped: ${missing.length} source proof file(s) are missing.`);
  for (const entry of missing) console.error(`- ${entry.sourceRelativePath}`);
  process.exit(2);
}

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
let uploaded = 0;
for (const entry of manifest) {
  const sourceFile = join(sourceRoot, entry.sourceRelativePath);
  const objectPath = `${bucket}/${entry.r2Key}`;
  const args = [
    "wrangler", "r2", "object", "put", objectPath,
    "--file", sourceFile,
    "--content-type", entry.contentType || "application/octet-stream",
    "--remote",
  ];
  console.log(`${dryRun ? "[DRY RUN]" : "[UPLOAD]"} ${objectPath}`);
  if (dryRun) continue;
  const result = spawnSync(npx, args, { stdio: "inherit", cwd: projectRoot });
  if (result.status !== 0) {
    console.error(`Upload failed for ${entry.sourceRelativePath}.`);
    process.exit(result.status || 3);
  }
  uploaded++;
}
console.log(dryRun ? `Validated ${manifest.length} proof file(s).` : `Uploaded ${uploaded} proof file(s) to R2.`);
