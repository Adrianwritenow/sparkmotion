import { PrismaClient, UserRole, OrgRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: "admin@sparkmotion.test" },
    update: {},
    create: {
      email: "admin@sparkmotion.test",
      password: hashedPassword,
      name: "Admin User",
      role: UserRole.ADMIN,
    },
  });

  console.log("Created admin user:", admin.email);

  // Create test organization
  const org = await prisma.organization.upsert({
    where: { slug: "compassion" },
    update: {},
    create: {
      name: "Compassion International",
      slug: "compassion",
    },
  });

  console.log("Created organization:", org.name);

  // Create customer user
  const customer = await prisma.user.upsert({
    where: { email: "customer@sparkmotion.test" },
    update: {},
    create: {
      email: "customer@sparkmotion.test",
      password: hashedPassword,
      name: "Customer User",
      role: UserRole.CUSTOMER,
    },
  });

  console.log("Created customer user:", customer.email);

  // Link customer to organization with OWNER role
  const orgUser = await prisma.orgUser.upsert({
    where: {
      userId_orgId: {
        userId: customer.id,
        orgId: org.id,
      },
    },
    update: {},
    create: {
      userId: customer.id,
      orgId: org.id,
      role: OrgRole.OWNER,
    },
  });

  console.log("Linked customer to organization with role:", orgUser.role);

  console.log("\nSeed complete!");
  console.log("\nTest credentials:");
  console.log("Admin: admin@sparkmotion.test / password123");
  console.log("Customer: customer@sparkmotion.test / password123");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
