import { PrismaClient, UserRole, OrgRole } from "../generated/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const hashedPassword = await bcrypt.hash("password123", 10);

  // Create admin user (global, no org)
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

  // Create Compassion org
  const compassionOrg = await prisma.organization.upsert({
    where: { slug: "compassion" },
    update: {},
    create: {
      name: "Compassion International",
      slug: "compassion",
    },
  });

  console.log("Created organization:", compassionOrg.name);

  // Create customer user linked to Compassion
  const customer = await prisma.user.upsert({
    where: { email: "customer@sparkmotion.test" },
    update: {},
    create: {
      email: "customer@sparkmotion.test",
      password: hashedPassword,
      name: "Customer User",
      role: UserRole.CUSTOMER,
      orgId: compassionOrg.id,
      orgRole: OrgRole.OWNER,
    },
  });

  console.log("Created customer user:", customer.email);

  // Create Loadtest org
  const loadtestOrg = await prisma.organization.upsert({
    where: { slug: "loadtest-org" },
    update: {},
    create: {
      name: "Load Test Org",
      slug: "loadtest-org",
    },
  });

  console.log("Created organization:", loadtestOrg.name);

  // Create loadtest admin
  const loadtestAdmin = await prisma.user.upsert({
    where: { email: "loadtest-admin@sparkmotion.test" },
    update: {},
    create: {
      email: "loadtest-admin@sparkmotion.test",
      password: hashedPassword,
      name: "Loadtest Admin",
      role: UserRole.ADMIN,
    },
  });

  console.log("Created loadtest admin:", loadtestAdmin.email);

  // Create loadtest customer linked to Loadtest org
  const loadtestCustomer = await prisma.user.upsert({
    where: { email: "loadtest-customer@sparkmotion.test" },
    update: {},
    create: {
      email: "loadtest-customer@sparkmotion.test",
      password: hashedPassword,
      name: "Loadtest Customer",
      role: UserRole.CUSTOMER,
      orgId: loadtestOrg.id,
      orgRole: OrgRole.OWNER,
    },
  });

  console.log("Created loadtest customer:", loadtestCustomer.email);

  // Seed BandTag entries
  const adminTag = await prisma.bandTag.upsert({
    where: { title: "admin" },
    update: {},
    create: { title: "admin" },
  });
  const vipTag = await prisma.bandTag.upsert({
    where: { title: "vip" },
    update: {},
    create: { title: "vip" },
  });
  console.log("Created tags:", adminTag.title, vipTag.title);

  console.log("\nSeed complete!");
  console.log("\nTest credentials:");
  console.log("Admin: admin@sparkmotion.test / password123");
  console.log("Customer: customer@sparkmotion.test / password123");
  console.log("Loadtest Admin: loadtest-admin@sparkmotion.test / password123");
  console.log("Loadtest Customer: loadtest-customer@sparkmotion.test / password123");
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
