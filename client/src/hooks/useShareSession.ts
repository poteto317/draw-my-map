"use client";

import { useSession } from "next-auth/react";
import { toShareSession, type ShareSession } from "@/domain/share/shareSession";

/** loading と未ログインを混同しないための戻り値 */
export type ShareSessionState = {
  status: "loading" | "ready";
  session: ShareSession;
};

/** Auth.js セッションを共有用 ShareSession に正規化する（I/O は useSession のみ） */
export function useShareSession(): ShareSessionState {
  const { data, status } = useSession();
  if (status === "loading") {
    return { status: "loading", session: null };
  }
  return { status: "ready", session: toShareSession(data?.user) };
}
