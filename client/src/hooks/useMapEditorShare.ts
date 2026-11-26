"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CreateShareValue, ShareLinkIssued } from "@/domain/share/shareLink";
import type { ShareLocalMetaRead, ShareLocalMetaValue } from "@/domain/share/shareLocalMeta";
import {
  planShareLocalMetaClear,
  planShareLocalMetaPersist,
  type ShareLocalMetaPersistResult,
} from "@/domain/share/shareLocalMetaPersist";
import {
  shareLocalMetaAfterPublish,
  shareLocalMetaAfterRevoke,
  shareLocalMetaFromCreate,
  shareLocalMetaFromListItem,
  shareLocalMetaWithActiveLink,
} from "@/domain/share/shareLocalMetaProjection";
import {
  applyReissueToShareList,
  applyRevokeToShareList,
  shareListHasActiveLink,
} from "@/domain/share/shareListMutations";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import {
  clearShareNotice,
  clearShareSuccessOnRevisionChange,
  createEmptyShareNotice,
  publishShareError,
  publishShareSuccess,
  type ShareNoticeState,
} from "@/domain/share/shareNotice";
import { shareOperationFailureMessage } from "@/domain/share/shareOperationMessages";
import type { ShareResult } from "@/domain/share/shareResult";
import type { ShareSession } from "@/domain/share/shareSession";
import {
  clearShareLocalMetaForMap,
  readShareLocalMeta,
  writeShareLocalMetaForMap,
} from "@/services/persistence/shareLocalMetaStorage";
import {
  getBrowserMapLibraryStorage,
  type MapLibraryStorage,
} from "@/services/persistence/mapLibraryStorage";
import {
  createShareApiClient,
  type ShareApiClient,
  type ShareListItemClient,
} from "@/services/share/shareApiClient";

export type UseMapEditorShareOptions = {
  mapId: string;
  mapTitle: string;
  shareSession: ShareSession;
  documentRevision: number;
  shareDialogOpen: boolean;
  getDocumentJson: () => string;
  /** 省略時はモジュール内で1回だけ createShareApiClient する */
  api?: ShareApiClient;
  getStorage?: () => MapLibraryStorage | null;
};

function presentMetaValue(localMeta: ShareLocalMetaRead): ShareLocalMetaValue | null {
  return localMeta.status === "present" ? localMeta.value : null;
}

const STORAGE_UNAVAILABLE_PERSIST: ShareLocalMetaPersistResult = {
  ok: false,
  kind: "read-error",
  error: "storage-unavailable",
};

/** storage === null のときの読取／書込失敗写像を 1 箇所に閉じる */
function withShareStorage<T>(
  getStorage: () => MapLibraryStorage | null,
  onUnavailable: T,
  op: (storage: MapLibraryStorage) => T,
): T {
  const storage = getStorage();
  if (storage === null) return onUnavailable;
  return op(storage);
}

function mapLocalMetaWriteResult(
  result: ReturnType<typeof writeShareLocalMetaForMap>,
): ShareLocalMetaPersistResult {
  if (result.status === "ok") return { ok: true };
  if (result.status === "skipped-read-error") {
    return { ok: false, kind: "read-error", error: result.error };
  }
  return {
    ok: false,
    kind: "write-error",
    error: result.status === "quota-exceeded" ? "quota-exceeded" : result.error,
  };
}

function readMeta(getStorage: () => MapLibraryStorage | null, mapId: string): ShareLocalMetaRead {
  return withShareStorage(
    getStorage,
    { status: "read-error", error: "storage-unavailable" },
    (storage) => readShareLocalMeta(storage, mapId),
  );
}

function writeMeta(
  getStorage: () => MapLibraryStorage | null,
  mapId: string,
  value: ShareLocalMetaValue,
): ShareLocalMetaPersistResult {
  return withShareStorage(getStorage, STORAGE_UNAVAILABLE_PERSIST, (storage) =>
    mapLocalMetaWriteResult(writeShareLocalMetaForMap(storage, mapId, value)),
  );
}

function clearMeta(
  getStorage: () => MapLibraryStorage | null,
  mapId: string,
): ShareLocalMetaPersistResult {
  return withShareStorage(getStorage, STORAGE_UNAVAILABLE_PERSIST, (storage) =>
    mapLocalMetaWriteResult(clearShareLocalMetaForMap(storage, mapId)),
  );
}

/** 純関数の PersistPlan を state へ適用し、操作結果の notice 形へ写す */
function applyLocalMetaPersistPlan(
  plan: ReturnType<typeof planShareLocalMetaPersist>,
  setLocalMeta: (next: ShareLocalMetaRead) => void,
): { notice: "success" } | { notice: "error"; message: string } {
  if (plan.localMeta !== null) {
    setLocalMeta(plan.localMeta);
  }
  if (plan.notice === "success") {
    return { notice: "success" };
  }
  return { notice: "error", message: plan.message };
}

export function useMapEditorShare({
  mapId,
  mapTitle,
  shareSession,
  documentRevision,
  shareDialogOpen,
  getDocumentJson,
  api,
  getStorage = getBrowserMapLibraryStorage,
}: UseMapEditorShareOptions) {
  const apiRef = useRef(api);
  const defaultApiRef = useRef<ShareApiClient | null>(null);
  const getStorageRef = useRef(getStorage);
  const getDocumentJsonRef = useRef(getDocumentJson);

  useLayoutEffect(() => {
    apiRef.current = api;
    getStorageRef.current = getStorage;
    getDocumentJsonRef.current = getDocumentJson;
  }, [api, getStorage, getDocumentJson]);

  /** 操作時までデフォルト client を作らない（テスト環境の fetch 欠落を避ける） */
  const resolveApi = useCallback(() => {
    if (apiRef.current !== undefined) return apiRef.current;
    if (defaultApiRef.current === null) {
      defaultApiRef.current = createShareApiClient();
    }
    return defaultApiRef.current;
  }, []);

  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const [shareList, setShareList] = useState<readonly ShareListItemClient[]>([]);
  const [localMeta, setLocalMeta] = useState<ShareLocalMetaRead>(() =>
    readMeta(getStorage, mapId),
  );
  const [lastIssuedLink, setLastIssuedLink] = useState<ShareLinkIssued | null>(null);
  const [noticeState, setNoticeState] = useState<ShareNoticeState>(createEmptyShareNotice);
  const [busy, setBusy] = useState(false);
  const documentRevisionRef = useRef(documentRevision);
  const openRef = useRef(shareDialogOpen);

  /* eslint-disable react-hooks/set-state-in-effect -- mapId 変更・ダイアログ開閉・revision 変化・一覧取得の外部同期（L-166 / L-002） */
  // mapId 変更: メタ再読込・通知クリア・発行リンク破棄（L-166）
  useEffect(() => {
    setLocalMeta(readMeta(getStorageRef.current, mapId));
    setLastIssuedLink(null);
    setNoticeState(createEmptyShareNotice());
    setShareList([]);
    setListState("loading");
  }, [mapId]);

  // ダイアログ閉鎖: 通知クリア（L-166）
  useEffect(() => {
    const wasOpen = openRef.current;
    openRef.current = shareDialogOpen;
    if (wasOpen && !shareDialogOpen) {
      setNoticeState((prev) => clearShareNotice(prev));
      setLastIssuedLink(null);
    }
  }, [shareDialogOpen]);

  // documentRevision 変化: 成功 status だけ消す（L-166）
  useEffect(() => {
    if (documentRevisionRef.current === documentRevision) return;
    documentRevisionRef.current = documentRevision;
    setNoticeState((prev) => clearShareSuccessOnRevisionChange(prev));
  }, [documentRevision]);

  // 開いている間だけ一覧取得。失敗時は error にしローカルメタを壊さない（L-002）
  // shareSession オブジェクト参照ではなく userId で依存し、再レンダー無限取得を防ぐ
  const shareUserId = shareSession?.userId ?? null;
  useEffect(() => {
    if (!shareDialogOpen || shareUserId === null) {
      return;
    }
    let cancelled = false;
    setListState("loading");
    void (async () => {
      const result = await resolveApi().listMaps();
      if (cancelled) return;
      if (!result.ok) {
        setListState("error");
        return;
      }
      setShareList(result.value);
      setListState("ready");
      const mine = result.value.find((item) => item.localMapId === mapId);
      if (!mine) return;
      const next = shareLocalMetaFromListItem(mine);
      const persist = writeMeta(getStorageRef.current, mapId, next);
      if (persist.ok) {
        setLocalMeta({ status: "present", value: next });
        return;
      }
      if (persist.kind === "read-error") {
        setLocalMeta({ status: "read-error", error: persist.error });
      }
      // write-error: 既存表示を present へ偽倒ししない
    })();
    return () => {
      cancelled = true;
    };
  }, [mapId, resolveApi, shareDialogOpen, shareUserId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const runOperation = useCallback(
    async <T,>(
      operation: () => Promise<ShareResult<T>>,
      onOk: (value: T) => { notice: "success" } | { notice: "error"; message: string },
      successMessage: string,
    ): Promise<ShareResult<T>> => {
      if (shareSession === null) {
        const failed = { ok: false as const, reason: "unauthenticated" };
        setNoticeState((prev) => publishShareError(prev, SHARE_MESSAGES.unauthenticated));
        return failed;
      }
      setNoticeState((prev) => clearShareNotice(prev)); // 再試行開始でクリア（L-166）
      setBusy(true);
      try {
        const result = await operation();
        if (!result.ok) {
          setNoticeState((prev) => publishShareError(prev, shareOperationFailureMessage(result.reason)));
          return result;
        }
        const applied = onOk(result.value);
        if (applied.notice === "error") {
          setNoticeState((prev) => publishShareError(prev, applied.message));
        } else {
          setNoticeState((prev) => publishShareSuccess(prev, successMessage));
        }
        return result;
      } finally {
        setBusy(false);
      }
    },
    [shareSession],
  );

  const onCreateShare = useCallback(async () => {
    return runOperation(
      () => resolveApi().createShare({
        localMapId: mapId,
        title: mapTitle,
        documentJson: getDocumentJsonRef.current(),
      }),
      (value: CreateShareValue) => {
        const publishedAt = new Date().toISOString();
        const next = shareLocalMetaFromCreate(value, publishedAt);
        const plan = planShareLocalMetaPersist(writeMeta(getStorageRef.current, mapId, next), next);
        const applied = applyLocalMetaPersistPlan(plan, setLocalMeta);
        // 発行リンクはメモリのみ（localStorage に token/url を書かない）
        setLastIssuedLink(value.link);
        return applied;
      },
      SHARE_MESSAGES.createShareSuccess,
    );
  }, [mapId, mapTitle, resolveApi, runOperation]);

  const sharedMapId =
    localMeta.status === "present" ? localMeta.value.sharedMapId : null;

  const onPublish = useCallback(async () => {
    if (sharedMapId === null) {
      const failed = { ok: false as const, reason: "not-shared" };
      setNoticeState((prev) => publishShareError(prev, SHARE_MESSAGES.notShared));
      return failed;
    }
    return runOperation(
      () => resolveApi().publish(sharedMapId, { documentJson: getDocumentJsonRef.current() }),
      () => {
        const next = shareLocalMetaAfterPublish(
          sharedMapId,
          new Date().toISOString(),
          presentMetaValue(localMeta),
        );
        const plan = planShareLocalMetaPersist(writeMeta(getStorageRef.current, mapId, next), next);
        return applyLocalMetaPersistPlan(plan, setLocalMeta);
      },
      SHARE_MESSAGES.publishSuccess,
    );
  }, [localMeta, mapId, resolveApi, runOperation, sharedMapId]);

  const onCreateLink = useCallback(async () => {
    if (sharedMapId === null) {
      const failed = { ok: false as const, reason: "not-shared" };
      setNoticeState((prev) => publishShareError(prev, SHARE_MESSAGES.notShared));
      return failed;
    }
    return runOperation(
      () => resolveApi().createLink(sharedMapId),
      (link) => {
        const next = shareLocalMetaWithActiveLink(sharedMapId, presentMetaValue(localMeta));
        const plan = planShareLocalMetaPersist(writeMeta(getStorageRef.current, mapId, next), next);
        const applied = applyLocalMetaPersistPlan(plan, setLocalMeta);
        setLastIssuedLink(link);
        return applied;
      },
      SHARE_MESSAGES.createLinkSuccess,
    );
  }, [localMeta, mapId, resolveApi, runOperation, sharedMapId]);

  const onRevokeLink = useCallback(async (linkId: string) => {
    return runOperation(
      () => resolveApi().revokeLink(linkId),
      () => {
        if (sharedMapId === null) {
          return { notice: "success" as const };
        }
        const revokedAt = new Date().toISOString();
        const nextList = applyRevokeToShareList(shareList, sharedMapId, linkId, revokedAt);
        setShareList(nextList);
        const next = shareLocalMetaAfterRevoke(
          sharedMapId,
          presentMetaValue(localMeta),
          shareListHasActiveLink(nextList, sharedMapId),
        );
        const plan = planShareLocalMetaPersist(writeMeta(getStorageRef.current, mapId, next), next);
        return applyLocalMetaPersistPlan(plan, setLocalMeta);
      },
      SHARE_MESSAGES.revokeSuccess,
    );
  }, [localMeta, mapId, resolveApi, runOperation, shareList, sharedMapId]);

  const onReissueLink = useCallback(async (linkId: string) => {
    return runOperation(
      () => resolveApi().reissueLink(linkId),
      (link) => {
        const createdAt = new Date().toISOString();
        if (sharedMapId !== null) {
          setShareList((prev) => applyReissueToShareList(
            prev,
            sharedMapId,
            linkId,
            {
              id: link.linkId,
              permission: "view",
              createdAt,
              revokedAt: null,
              expiresAt: null,
            },
            createdAt,
          ));
          const next = shareLocalMetaWithActiveLink(sharedMapId, presentMetaValue(localMeta));
          const plan = planShareLocalMetaPersist(writeMeta(getStorageRef.current, mapId, next), next);
          const applied = applyLocalMetaPersistPlan(plan, setLocalMeta);
          setLastIssuedLink(link);
          return applied;
        }
        setLastIssuedLink(link);
        return { notice: "success" as const };
      },
      SHARE_MESSAGES.reissueSuccess,
    );
  }, [localMeta, mapId, resolveApi, runOperation, sharedMapId]);

  const onDeleteShare = useCallback(async () => {
    if (sharedMapId === null) {
      const failed = { ok: false as const, reason: "not-shared" };
      setNoticeState((prev) => publishShareError(prev, SHARE_MESSAGES.notShared));
      return failed;
    }
    return runOperation(
      () => resolveApi().deleteShare(sharedMapId),
      () => {
        const plan = planShareLocalMetaClear(clearMeta(getStorageRef.current, mapId));
        if (plan.localMeta !== null) {
          setLocalMeta(plan.localMeta);
        }
        if (plan.notice === "success") {
          setLastIssuedLink(null);
          setShareList((prev) => prev.filter((item) => item.id !== sharedMapId));
          return { notice: "success" as const };
        }
        return { notice: "error" as const, message: plan.message };
      },
      SHARE_MESSAGES.deleteSuccess,
    );
  }, [mapId, resolveApi, runOperation, sharedMapId]);

  const clearNotice = useCallback(() => {
    setNoticeState((prev) => clearShareNotice(prev));
  }, []);

  return {
    localMeta,
    listState,
    shareList,
    lastIssuedLink,
    notice: noticeState.notice,
    noticeSequence: noticeState.sequence,
    busy,
    onCreateShare,
    onPublish,
    onCreateLink,
    onRevokeLink,
    onReissueLink,
    onDeleteShare,
    clearNotice,
  };
}
