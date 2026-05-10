import { PrismaClient } from "@prisma/client";

/** Default interactive `prisma.$transaction` timeout is 5s — confirm payment / lock-in paths can exceed that on slow DB or cold start. */
export const PRISMA_INTERACTIVE_TX_OPTIONS = {
  maxWait: 15_000,
  timeout: 30_000,
} as const;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

let prismaClient = globalForPrisma.prisma;

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!prismaClient) {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is not configured.");
      }
      prismaClient = createPrismaClient();
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = prismaClient;
      }
    }

    const value = (prismaClient as unknown as Record<string, unknown>)[String(prop)];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(prismaClient) : value;
  },
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prismaClient;
}
