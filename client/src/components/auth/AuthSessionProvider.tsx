"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

/** useShareSession / next-auth/react 用の薄い SessionProvider 配線 */
export function AuthSessionProvider({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
