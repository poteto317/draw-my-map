"use client";

import { useSession } from "next-auth/react";
import { toShareCommenter, type ShareCommenter } from "@/domain/share/shareSession";

/** loading と未ログインを混同しないための戻り値（L-463） */
export type ShareCommenterSessionState = {
  status: "loading" | "ready";
  commenter: ShareCommenter | null;
};

/** Auth.js セッションをコメント投稿者に正規化する（I/O は useSession のみ。email は使わない） */
export function useShareCommenterSession(): ShareCommenterSessionState {
  const { data, status } = useSession();
  if (status === "loading") {
    return { status: "loading", commenter: null };
  }
  return { status: "ready", commenter: toShareCommenter(data?.user) };
}
