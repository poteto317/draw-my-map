"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  classifyShareCommentThreads,
  countOpenThreadsByNode,
  type ClassifiedShareCommentThreads,
} from "@/domain/share/classifyShareCommentThreads";
import type { ShareCommentsScope } from "@/domain/share/shareComment";
import type { ShareSession } from "@/domain/share/shareSession";
import {
  useShareCommentsController,
  type ShareCommentsController,
} from "@/hooks/useShareCommentsController";
import type { ShareCommentsApiClient } from "@/services/share/shareCommentsApiClient";

export type UseMapEditorCommentsOptions = {
  mapId: string;
  /** share.localMeta が present のときだけ非 null */
  sharedMapId: string | null;
  shareSession: ShareSession;
  shareSessionStatus: "loading" | "ready";
  dialogOpen: boolean;
  /** ローカル nodes の ID（削除されたノードの振り分けに使う） */
  nodeIds: ReadonlySet<number>;
  api?: ShareCommentsApiClient;
};

export type ShareCommentNodeSummary = { open: number; resolved: number };

export type MapEditorComments = ShareCommentsController & {
  /** ready のときだけ非 null */
  classified: ClassifiedShareCommentThreads | null;
  /** ready 以外は空 Map（前回の値・error でバッジを出さない・L-002） */
  openCountByNode: ReadonlyMap<number, number>;
  /** ready 以外は null。ready なら 0 件でも { open: 0, resolved: 0 } */
  summaryForNode: (nodeId: number) => ShareCommentNodeSummary | null;
};

const EMPTY_OPEN_COUNTS: ReadonlyMap<number, number> = new Map();

function generationKeyOf(mapId: string, sharedMapId: string | null, userId: string | null): string {
  return JSON.stringify([mapId, sharedMapId, userId]);
}

/**
 * 編集シェル（所有者）のコメント一覧と書込み。経路は所有者セッション＋sharedMapId（設計 §7.6）。
 * 未共有・未ログイン・セッション確認中は idle で API を呼ばない。
 * 取得の契機は (mapId, sharedMapId, userId) が揃ったとき、ダイアログを開いたとき（false → true）、reload
 */
export function useMapEditorComments({
  mapId,
  sharedMapId,
  shareSession,
  shareSessionStatus,
  dialogOpen,
  nodeIds,
  api,
}: UseMapEditorCommentsOptions): MapEditorComments {
  // セッション確認中は主体が分からないので未ログインと同じく取得しない（L-463）
  const userId = shareSessionStatus === "ready" && shareSession !== null ? shareSession.userId : null;
  const scope = useMemo(
    (): ShareCommentsScope | null => (sharedMapId !== null && userId !== null
      ? { kind: "owner", sharedMapId }
      : null),
    [sharedMapId, userId],
  );
  const controller = useShareCommentsController({
    generationKey: generationKeyOf(mapId, sharedMapId, userId),
    scope,
    api,
  });
  const { reload, value, clearNotice } = controller;

  const previousDialogOpenRef = useRef(dialogOpen);
  useEffect(() => {
    const wasOpen = previousDialogOpenRef.current;
    previousDialogOpenRef.current = dialogOpen;
    if (!wasOpen && dialogOpen) {
      // 閉じた後に届いた書込み応答の通知を、開き直したダイアログに持ち込まない（L-166）
      clearNotice();
      void reload();
    }
  }, [dialogOpen, reload, clearNotice]);

  const threads = value?.threads ?? null;
  const classified = useMemo(
    () => (threads === null ? null : classifyShareCommentThreads(threads, nodeIds)),
    [threads, nodeIds],
  );
  const openCountByNode = useMemo(
    () => (classified === null ? EMPTY_OPEN_COUNTS : countOpenThreadsByNode(classified.attached)),
    [classified],
  );
  const summaryForNode = useCallback(
    (nodeId: number): ShareCommentNodeSummary | null => {
      if (classified === null) return null;
      const nodeThreads = classified.attached.get(nodeId) ?? [];
      const open = nodeThreads.filter((item) => item.status === "open").length;
      return { open, resolved: nodeThreads.length - open };
    },
    [classified],
  );

  return { ...controller, classified, openCountByNode, summaryForNode };
}
