"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizeShareCommentBody } from "@/domain/share/normalizeShareCommentBody";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentsListState,
  ShareCommentsScope,
  ShareCommentThreadView,
} from "@/domain/share/shareComment";
import { removeCommentFromList, replaceThreadInList } from "@/domain/share/shareCommentListMutations";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { shareCommentOperationFailureMessage } from "@/domain/share/shareCommentOperationMessages";
import {
  clearShareNotice,
  createEmptyShareNotice,
  publishShareError,
  publishShareSuccess,
  type ShareNoticeState,
} from "@/domain/share/shareNotice";
import type { ShareResult } from "@/domain/share/shareResult";
import {
  createShareCommentsApiClient,
  type ShareCommentsApiClient,
} from "@/services/share/shareCommentsApiClient";
import type { OperationNotice } from "@/types/operationNotice";

export type UseShareCommentsControllerOptions = {
  /** 世代のキー（閲覧: token と投稿者、所有者: mapId・sharedMapId・userId）。変わると一覧・通知・busy を捨てる */
  generationKey: string;
  /** null の間は取得も書込みもしない（一覧は idle）。呼び出し側で useMemo して同じ参照を保つ */
  scope: ShareCommentsScope | null;
  api?: ShareCommentsApiClient;
};

/** コメント一覧の状態と操作（閲覧シェル・所有者の hook が共用） */
export type ShareCommentsController = {
  listState: ShareCommentsListState;
  /** ready のときだけ非 null */
  value: ShareCommentListValue | null;
  reload: () => Promise<void>;
  createThread: (nodeId: number, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  reply: (threadId: string, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  resolve: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  reopen: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  deleteComment: (threadId: string, commentId: string) => Promise<ShareResult<ShareCommentDeleteValue>>;
  notice: OperationNotice | null;
  noticeSequence: number;
  busy: boolean;
  clearNotice: () => void;
};

type ListSnapshot = {
  readonly key: string;
  readonly listState: ShareCommentsListState;
  readonly value: ShareCommentListValue | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** parseShareResult は value の無い { ok: true } も通すため、使う前に形を確かめる（L-002） */
function isListValue(value: unknown): value is ShareCommentListValue {
  return isRecord(value)
    && Array.isArray(value.threads)
    && isRecord(value.viewer)
    && typeof value.viewer.canPost === "boolean"
    && typeof value.viewer.signedIn === "boolean";
}

function isThreadView(value: unknown): value is ShareCommentThreadView {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.nodeId === "number"
    && (value.status === "open" || value.status === "resolved")
    && Array.isArray(value.comments);
}

function isDeleteValue(value: unknown): value is ShareCommentDeleteValue {
  return isRecord(value)
    && typeof value.commentId === "string"
    && typeof value.threadDeleted === "boolean";
}

type WritePlan<T> = {
  call: (api: ShareCommentsApiClient, scope: ShareCommentsScope) => Promise<ShareResult<T>>;
  isValid: (value: unknown) => value is T;
  apply: (threads: readonly ShareCommentThreadView[], value: T) => ShareCommentThreadView[];
  successMessage: string;
};

/**
 * コメント一覧の取得と書込み。
 * 世代（generationKey）と一覧の要求番号の両方で古い応答を捨てる（設計 §7.6・L-037 / L-040 / L-883 / L-571）。
 * 書込みは成功時に一覧を差し替えてから解決する（ShareCommentThreadList のフォーカス移動の前提）
 */
export function useShareCommentsController({
  generationKey,
  scope,
  api,
}: UseShareCommentsControllerOptions): ShareCommentsController {
  const defaultClientRef = useRef<ShareCommentsApiClient | null>(null);
  /** 呼ぶ時までデフォルト client を作らない（idle のまま描画する編集シェルのテスト環境の fetch 欠落を避ける。useMapEditorShare と同じ） */
  const resolveClient = useCallback((): ShareCommentsApiClient => {
    if (api !== undefined) return api;
    if (defaultClientRef.current === null) {
      defaultClientRef.current = createShareCommentsApiClient();
    }
    return defaultClientRef.current;
  }, [api]);

  const [snapshot, setSnapshot] = useState<ListSnapshot>(() => ({
    key: generationKey,
    listState: "idle",
    value: null,
  }));
  const [noticeState, setNoticeState] = useState<ShareNoticeState>(createEmptyShareNotice);
  /** 書込み中の世代番号（null = 無し）。世代番号はキーが A → B → A と戻っても進むので、前の A の書込みで busy が残らない */
  const [busyGeneration, setBusyGeneration] = useState<number | null>(null);
  /** 描画に使う現在の世代（generationRef と同じ番号を、そのキーと組で state にも持つ） */
  const [currentGeneration, setCurrentGeneration] = useState<{ key: string; generation: number } | null>(null);

  // 世代が変わった描画で一覧と通知を捨てる（前の主体の一覧を見せない・L-1037）
  if (snapshot.key !== generationKey) {
    setSnapshot({ key: generationKey, listState: "idle", value: null });
    setNoticeState(clearShareNotice);
  }

  const generationRef = useRef(0);
  const listRequestSeqRef = useRef(0);
  /** 書込み中の世代番号（null = 無し）。前の主体の書込みで新しい主体を拒否しない */
  const writeInFlightGenerationRef = useRef<number | null>(null);

  // キーが A → B → A と戻っても番号は進み続けるので、戻った後に前の A の応答を通さない（L-571）
  useLayoutEffect(() => {
    generationRef.current += 1;
    listRequestSeqRef.current += 1;
    setCurrentGeneration({ key: generationKey, generation: generationRef.current });
  }, [generationKey]);

  /**
   * 一覧を取りに行き、適用する内容を返す。開始時の世代と要求番号が今と違えば null（捨てる）。
   * setState は呼び出し側が await の後で行う
   */
  const fetchList = useCallback(
    async (target: ShareCommentsScope): Promise<Pick<ListSnapshot, "listState" | "value"> | null> => {
      const generation = generationRef.current;
      listRequestSeqRef.current += 1;
      const requestSeq = listRequestSeqRef.current;
      const result = await resolveClient().list(target);
      if (generation !== generationRef.current || requestSeq !== listRequestSeqRef.current) return null;
      if (result.ok && isListValue(result.value)) return { listState: "ready", value: result.value };
      // error では前回の一覧を残さない（L-002）
      return { listState: "error", value: null };
    },
    [resolveClient],
  );

  // 初回は idle のまま取りに行き、戻り値の listState で loading と見せる（effect 内で同期 setState しない）
  useEffect(() => {
    if (scope === null) return;
    void (async () => {
      const next = await fetchList(scope);
      if (next !== null) setSnapshot((prev) => ({ ...prev, ...next }));
    })();
  }, [scope, generationKey, fetchList]);

  const reload = useCallback(async (): Promise<void> => {
    if (scope === null) return;
    // ready の間は一覧を出したまま取り直す（返信の下書きを持つ一覧部品を外さない）
    setSnapshot((prev) => (prev.listState === "ready" ? prev : { ...prev, listState: "loading", value: null }));
    const next = await fetchList(scope);
    if (next !== null) setSnapshot((prev) => ({ ...prev, ...next }));
  }, [scope, fetchList]);

  const runWrite = useCallback(
    async <T,>(plan: WritePlan<T>): Promise<ShareResult<T>> => {
      // 送信前の拒否では前の通知を消さない（L-931）
      if (scope === null) return { ok: false, reason: "not-found" };
      const generation = generationRef.current;
      if (writeInFlightGenerationRef.current === generation) return { ok: false, reason: "busy" };
      writeInFlightGenerationRef.current = generation;
      setBusyGeneration(generation);
      setNoticeState(clearShareNotice);
      let result: ShareResult<T>;
      try {
        result = await plan.call(resolveClient(), scope);
      } finally {
        if (writeInFlightGenerationRef.current === generation) writeInFlightGenerationRef.current = null;
        setBusyGeneration((prev) => (prev === generation ? null : prev));
      }
      if (generation !== generationRef.current) return { ok: false, reason: "stale" };
      if (!result.ok) {
        const reason = result.reason;
        setNoticeState((prev) => publishShareError(prev, shareCommentOperationFailureMessage(reason)));
        return result;
      }
      const value = result.value;
      if (!plan.isValid(value)) {
        setNoticeState((prev) => publishShareError(prev, shareCommentOperationFailureMessage("invalid-response")));
        return { ok: false, reason: "invalid-response" };
      }
      // 書込み前に始まった一覧取得の応答で、この結果を上書きさせない（L-040）
      listRequestSeqRef.current += 1;
      setSnapshot((prev) => (prev.value === null
        ? prev
        : { ...prev, value: { ...prev.value, threads: plan.apply(prev.value.threads, value) } }));
      setNoticeState((prev) => publishShareSuccess(prev, plan.successMessage));
      return result;
    },
    [resolveClient, scope],
  );

  const createThread = useCallback(
    async (nodeId: number, body: string): Promise<ShareResult<ShareCommentThreadView>> => {
      const normalized = normalizeShareCommentBody(body);
      if (!normalized.ok) return { ok: false, reason: "invalid-comment" };
      return runWrite({
        call: (target, writeScope) => target.createThread(writeScope, { nodeId, body: normalized.value }),
        isValid: isThreadView,
        apply: replaceThreadInList,
        successMessage: SHARE_COMMENT_MESSAGES.createSuccess,
      });
    },
    [runWrite],
  );

  const reply = useCallback(
    async (threadId: string, body: string): Promise<ShareResult<ShareCommentThreadView>> => {
      const normalized = normalizeShareCommentBody(body);
      if (!normalized.ok) return { ok: false, reason: "invalid-comment" };
      return runWrite({
        call: (target, writeScope) => target.reply(writeScope, threadId, { body: normalized.value }),
        isValid: isThreadView,
        apply: replaceThreadInList,
        successMessage: SHARE_COMMENT_MESSAGES.replySuccess,
      });
    },
    [runWrite],
  );

  const resolve = useCallback(
    (threadId: string) => runWrite({
      call: (target, writeScope) => target.resolve(writeScope, threadId),
      isValid: isThreadView,
      apply: replaceThreadInList,
      successMessage: SHARE_COMMENT_MESSAGES.resolveSuccess,
    }),
    [runWrite],
  );

  const reopen = useCallback(
    (threadId: string) => runWrite({
      call: (target, writeScope) => target.reopen(writeScope, threadId),
      isValid: isThreadView,
      apply: replaceThreadInList,
      successMessage: SHARE_COMMENT_MESSAGES.reopenSuccess,
    }),
    [runWrite],
  );

  const deleteComment = useCallback(
    (threadId: string, commentId: string) => runWrite<ShareCommentDeleteValue>({
      call: (target, writeScope) => target.deleteComment(writeScope, commentId),
      isValid: isDeleteValue,
      apply: (threads, value) => removeCommentFromList(threads, threadId, value.commentId, value.threadDeleted),
      successMessage: SHARE_COMMENT_MESSAGES.deleteSuccess,
    }),
    [runWrite],
  );

  const clearNotice = useCallback(() => {
    setNoticeState(clearShareNotice);
  }, []);

  const current = snapshot.key === generationKey ? snapshot : null;
  const storedListState = current?.listState ?? "idle";
  // 取得の条件が揃っていて未着手（idle）なら、effect が取りに行っている最中
  const listState: ShareCommentsListState = storedListState === "idle" && scope !== null
    ? "loading"
    : storedListState;
  return {
    listState,
    value: current?.listState === "ready" ? current.value : null,
    reload,
    createThread,
    reply,
    resolve,
    reopen,
    deleteComment,
    notice: noticeState.notice,
    noticeSequence: noticeState.sequence,
    // 世代が変わった描画（layout effect の前）でも、キーの一致を見て前の世代の busy を出さない
    busy: busyGeneration !== null
      && currentGeneration !== null
      && currentGeneration.key === generationKey
      && busyGeneration === currentGeneration.generation,
    clearNotice,
  };
}
