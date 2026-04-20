import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.admin.upsert({
    where: { email: "admin@gym.com" },
    update: {},
    create: {
      email: "admin@gym.com",
      password: await bcrypt.hash("admin123", 10),
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
