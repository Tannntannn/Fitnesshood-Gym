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

  const services = [
    { name: "Membership", tier: "Bronze", contractMonths: 1, monthlyRate: 1200, membershipFee: 0 },
    { name: "Membership", tier: "Silver", contractMonths: 6, monthlyRate: 1000, membershipFee: 800 },
    { name: "Membership", tier: "Gold", contractMonths: 9, monthlyRate: 950, membershipFee: 500 },
    { name: "Membership", tier: "Platinum", contractMonths: 12, monthlyRate: 900, membershipFee: 500 },
    { name: "Membership", tier: "Students", contractMonths: 3, monthlyRate: 900, membershipFee: 500 },
    { name: "Normal Fee", tier: "Walk-in Student", contractMonths: 0, monthlyRate: 100, membershipFee: 0 },
    { name: "Normal Fee", tier: "Non-member", contractMonths: 0, monthlyRate: 150, membershipFee: 0 },
    { name: "Normal Fee", tier: "Walk-in Regular", contractMonths: 0, monthlyRate: 150, membershipFee: 0 },
    { name: "Other Service", tier: "General", contractMonths: 0, monthlyRate: 0, membershipFee: 0 },
    { name: "Other Service", tier: "Locker", contractMonths: 0, monthlyRate: 150, membershipFee: 0 },
    { name: "Other Service", tier: "Wi-Fi", contractMonths: 0, monthlyRate: 100, membershipFee: 0 },
    { name: "Other Service", tier: "Pre-workout", contractMonths: 0, monthlyRate: 100, membershipFee: 0 },
    { name: "Other Service", tier: "PT Bronze Package", contractMonths: 0, monthlyRate: 3500, membershipFee: 0 },
    { name: "Other Service", tier: "PT Silver Package", contractMonths: 0, monthlyRate: 6000, membershipFee: 0 },
    { name: "Other Service", tier: "PT Gold Package", contractMonths: 0, monthlyRate: 9000, membershipFee: 0 },
    { name: "Other Service", tier: "PT Platinum Package", contractMonths: 0, monthlyRate: 12000, membershipFee: 0 },
    { name: "Other Service", tier: "Elite Transformation (2 Months)", contractMonths: 0, monthlyRate: 25000, membershipFee: 0 },
    { name: "Other Service", tier: "Small Group Training", contractMonths: 0, monthlyRate: 1500, membershipFee: 0 },
    { name: "Other Service", tier: "Online Training Plan", contractMonths: 0, monthlyRate: 2000, membershipFee: 0 },
    { name: "Other Service", tier: "Nutrition Consultation", contractMonths: 0, monthlyRate: 500, membershipFee: 0 },
    { name: "Other Service", tier: "Meal Plan Customization", contractMonths: 0, monthlyRate: 1000, membershipFee: 0 },
    { name: "Other Service", tier: "Personal Training Bronze", contractMonths: 0, monthlyRate: 1500, membershipFee: 0 },
    { name: "Other Service", tier: "Personal Training Silver", contractMonths: 0, monthlyRate: 3000, membershipFee: 0 },
    { name: "Other Service", tier: "Personal Training Gold", contractMonths: 0, monthlyRate: 5000, membershipFee: 0 },
  ];

  for (const service of services) {
    const contractPrice = service.monthlyRate * service.contractMonths + service.membershipFee;
    await prisma.service.upsert({
      where: { name_tier: { name: service.name, tier: service.tier } },
      update: {
        contractMonths: service.contractMonths,
        monthlyRate: service.monthlyRate,
        membershipFee: service.membershipFee,
        contractPrice,
        isActive: true,
      },
      create: {
        ...service,
        contractPrice,
        isActive: true,
      },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
