/**
 * Reset a user's password (bcrypt, cost 12) and clear forcePasswordReset.
 *
 * Run from repo root (DATABASE_URL must be set, e.g. from apps/admin/.env):
 *   export $(grep -E '^DATABASE_URL=' apps/admin/.env | xargs)
 *   pnpm --filter @sparkmotion/api exec tsx scripts/reset-password.ts <email> <newPassword>
 */
import { db } from "@sparkmotion/database";
import bcrypt from "bcryptjs";

async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: tsx scripts/reset-password.ts <email> <newPassword>");
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const user = await db.user.update({
    where: { email },
    data: { password: hash, forcePasswordReset: false },
    select: { id: true, email: true, role: true },
  });

  console.log(`Password reset for ${user.email} (${user.role}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
