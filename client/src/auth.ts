import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Auth.js (next-auth v5) — Google OAuth のみ。
 * 共有操作の所有者識別用。未ログインでもローカル編集は可能。
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: {
    strategy: "jwt",
  },
  pages: {
    // プロバイダ生エラーを出さず固定日本語ページへ（設計§4.1）
    error: "/auth/error",
  },
  callbacks: {
    jwt({ token, profile }) {
      // Google の sub を安定した userId として保持する
      const googleSub =
        typeof profile === "object" && profile !== null && "sub" in profile
          ? profile.sub
          : undefined;
      if (typeof googleSub === "string" && googleSub.length > 0) {
        token.sub = googleSub;
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.sub === "string" && token.sub.length > 0 && session.user) {
        session.user.id = token.sub;
        return session;
      }
      // id 欠落時は session.user を無効化（未ログイン扱い）
      return { ...session, user: undefined };
    },
  },
});
