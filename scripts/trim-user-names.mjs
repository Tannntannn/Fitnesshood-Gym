import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  select: { id: true, firstName: true, lastName: true, coachName: true },
});

const norm = (v) =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ") : v;

let fixed = 0;
for (const u of users) {
  const newFirst = norm(u.firstName) ?? u.firstName;
  const newLast = norm(u.lastName) ?? u.lastName;
  const newCoach = u.coachName == null ? u.coachName : norm(u.coachName) || null;
  const changes = {};
  if (newFirst !== u.firstName) changes.firstName = newFirst;
  if (newLast !== u.lastName) changes.lastName = newLast;
  if (newCoach !== u.coachName) changes.coachName = newCoach;
  if (Object.keys(changes).length === 0) continue;

  if (changes.firstName !== undefined || changes.lastName !== undefined) {
    await prisma.user.update({
      where: { id: u.id },
      data: {
        ...(changes.firstName !== undefined ? { firstName: changes.firstName } : {}),
        ...(changes.lastName !== undefined ? { lastName: changes.lastName } : {}),
      },
    });
  }
  if (changes.coachName !== undefined) {
    await prisma.$executeRaw`
      UPDATE "User" SET "coachName" = ${changes.coachName} WHERE "id" = ${u.id}
    `;
  }
  fixed += 1;
  console.log(`fixed ${u.id}:`, changes);
}

console.log(`done. ${fixed} user(s) updated.`);
await prisma.$disconnect();
