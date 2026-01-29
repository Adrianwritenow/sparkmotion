import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const appDirArg = process.argv[2];
if (!appDirArg) {
  console.error("Usage: node copy-prisma-client.mjs <app-dir>");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const appDir = path.resolve(repoRoot, appDirArg);
const require = createRequire(import.meta.url);
let source;

try {
  const prismaClientPkg = require.resolve("@prisma/client/package.json", {
    paths: [repoRoot],
  });
  const prismaClientDir = path.dirname(prismaClientPkg);
  source = path.join(prismaClientDir, "..", ".prisma", "client");
} catch {
  source = path.join(repoRoot, "node_modules/.prisma/client");
}

async function findPnpmPrismaClient() {
  const pnpmDir = path.join(repoRoot, "node_modules/.pnpm");
  try {
    const entries = await fs.readdir(pnpmDir);
    const prismaEntry = entries.find((name) => name.startsWith("@prisma+client@"));
    if (!prismaEntry) return null;
    return path.join(pnpmDir, prismaEntry, "node_modules/.prisma/client");
  } catch {
    return null;
  }
}
const dest = path.join(appDir, ".prisma/client");

try {
  let resolvedSource = source;
  try {
    await fs.access(resolvedSource);
  } catch {
    const pnpmSource = await findPnpmPrismaClient();
    if (pnpmSource) {
      resolvedSource = pnpmSource;
    }
  }

  await fs.mkdir(dest, { recursive: true });
  await fs.cp(resolvedSource, dest, { recursive: true });
  console.log(`Copied Prisma client engine to ${dest}`);
} catch (error) {
  console.error("Failed to copy Prisma client engine:", error);
  process.exit(1);
}
