import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    /** id 欠落時は undefined（未ログイン扱い） */
    user?: {
      id: string;
    } & DefaultSession["user"];
  }
}
