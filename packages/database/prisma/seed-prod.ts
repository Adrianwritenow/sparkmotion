import { PrismaClient } from "../generated/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const db = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === "development") {
    console.error("ERROR: seed-prod is not intended for development. Aborting.");
    process.exit(1);
  }

  const email = "adrianwritenow@gmail.com";
  const password = crypto.randomBytes(16).toString("base64url");
  const hashed = await bcrypt.hash(password, 12);

  const user = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Adrian Rodriguez",
      password: hashed,
      role: "ADMIN",
      forcePasswordReset: true,
    },
  });

  console.log("-------------------------------------------");
  console.log("Admin account seeded:");
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${password}`);
  console.log(`  ID:       ${user.id}`);
  console.log("  forcePasswordReset: true");
  console.log("-------------------------------------------");
  console.log("SAVE THIS PASSWORD — it will not be shown again.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
