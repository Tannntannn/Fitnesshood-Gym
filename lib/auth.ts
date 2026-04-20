import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET || "dev-only-secret-change-me",
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        const normalizedEmail = credentials.email.trim().toLowerCase();
        const admin = await prisma.admin.findUnique({ where: { email: normalizedEmail } });
        if (!admin) return null;
        const valid = await bcrypt.compare(credentials.password, admin.password);
        if (!valid) return null;
        return { id: admin.id, email: admin.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.adminId = user.id;
        token.adminEmail = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      session.admin = { id: token.adminId ?? "", email: token.adminEmail ?? "" };
      return session;
    },
  },
};
