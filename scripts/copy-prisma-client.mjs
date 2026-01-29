import fs from "fs/promises";
import path from "path";

const appDirArg = process.argv[2];
if (!appDirArg) {
  console.error("Usage: node copy-prisma-client.mjs <app-dir>");
  process.exit(1);
}

const appDir = path.resolve(process.cwd(), appDirArg);
const repoRoot = path.resolve(appDir, "../..");
const source = path.join(repoRoot, "node_modules/.prisma/client");
const dest = path.join(appDir, ".prisma/client");

try {
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(source, dest, { recursive: true });
  console.log(`Copied Prisma client engine to ${dest}`);
} catch (error) {
  console.error("Failed to copy Prisma client engine:", error);
  process.exit(1);
}
