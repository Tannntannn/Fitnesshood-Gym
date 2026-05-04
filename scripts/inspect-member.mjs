import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const id = process.argv[2] ?? "cmo8mhzb20000gcuciztp5qo5";

const user = await prisma.user.findUnique({ where: { id } });

if (!user) {
  console.log("NOT FOUND:", id);
} else {
  console.log({
    id: user.id,
    role: user.role,
    firstName: JSON.stringify(user.firstName),
    lastName: JSON.stringify(user.lastName),
    coachName: JSON.stringify(user.coachName),
    membershipExpiry: user.membershipExpiry,
    membershipStart: user.membershipStart,
    createdAt: user.createdAt,
  });
}

await prisma.$disconnect();
