"use client";

import { useMemo } from "react";
import type { ShareCommentsScope } from "@/domain/share/shareComment";
import {
  useShareCommentsController,
  type ShareCommentsController,
} from "@/hooks/useShareCommentsController";
import type { ShareCommentsApiClient } from "@/services/share/shareCommentsApiClient";

export type UseShareViewerCommentsOptions = {
  token: string;
  /** permission === "comment" のときだけ true。false では API を一切呼ばない */
  enabled: boolean;
  commenterUserId: string | null;
  sessionStatus: "loading" | "ready";
  api?: ShareCommentsApiClient;
};

export type ShareViewerComments = Omit<ShareCommentsController, "clearNotice">;

function generationKeyOf(token: string, commenterUserId: string | null): string {
  return JSON.stringify([token, commenterUserId]);
}

/**
 * 閲覧シェル（comment リンク）のコメント一覧と書込み。経路は token のみ（V-C-UM3）。
 * 世代のキーは token と投稿者の userId。古い応答の破棄は useShareCommentsController が持つ（設計 §7.6）
 */
export function useShareViewerComments({
  token,
  enabled,
  commenterUserId,
  sessionStatus,
  api,
}: UseShareViewerCommentsOptions): ShareViewerComments {
  const scope = useMemo(
    (): ShareCommentsScope | null => (enabled && sessionStatus === "ready" ? { kind: "token", token } : null),
    [enabled, sessionStatus, token],
  );
  return useShareCommentsController({
    generationKey: generationKeyOf(token, commenterUserId),
    scope,
    api,
  });
}
