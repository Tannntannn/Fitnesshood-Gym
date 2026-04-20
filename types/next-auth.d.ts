import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    admin: {
      id: string;
      email: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    email: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    adminId?: string;
    adminEmail?: string;
  }
}
