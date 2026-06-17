// One-off local password reset. Run: DATABASE_URL=... node packages/database/reset-password.mjs <email> <password>
import { PrismaClient } from "./generated/client/index.js";
import bcrypt from "bcryptjs";

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("usage: node reset-password.mjs <email> <password>");
  process.exit(1);
}

const prisma = new PrismaClient();
const hashed = await bcrypt.hash(password, 12);
const user = await prisma.user.update({
  where: { email },
  data: { password: hashed },
});
console.log(`Password reset for ${user.email} (id=${user.id})`);
await prisma.$disconnect();
