import type { DefaultSession } from "next-auth";

// The session carries the user id and how it was opened (auth.ts); status and site role are read from the database (lib/server/dal.ts).
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    method?: string;
  }
}
declare module "@auth/core/jwt" {
  interface JWT {
    method?: string;
  }
}
