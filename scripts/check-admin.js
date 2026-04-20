const { PrismaClient } = require("@prisma/client");

async function main() {
  const prisma = new PrismaClient();
  try {
    const admins = await prisma.admin.findMany();
    console.log("ADMINS", admins.length);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("ERR", error.message);
  process.exit(1);
});
