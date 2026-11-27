"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { collabOperationFailureMessage } from "@/domain/collab/collabOperationMessages";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import {
  collabStartBlockedMessage,
  resolveCollabStartBlocked,
  type CollabStartGuardInput,
} from "@/domain/collab/collabGuards";
import type {
  CollabParticipant,
  CollabParticipantsState,
  CollabSessionUi,
} from "@/domain/collab/collabSessionUi";
import {
  COLLAB_RECONNECT_GRACE_MS,
  type CollabConnectionState,
} from "@/domain/collab/collabConnectionTypes";
import {
  nextCollabSessionAfterClosed,
  planCollabConnectionTransition,
} from "@/domain/collab/planCollabConnectionTransition";
import {
  planCollabNoticeClear,
  shouldClearNonStatusNotice,
} from "@/domain/collab/planCollabNoticeClear";
import {
  planCollabUiResetDroppedGrace,
  planCollabUiResetToIdle,
  type PlanCollabUiResetResult,
} from "@/domain/collab/planCollabUiReset";
import {
  clearShareNotice,
  createEmptyShareNotice,
  publishShareError,
  publishShareSuccess,
  type ShareNoticeState,
} from "@/domain/share/shareNotice";
import type { ShareResult } from "@/domain/share/shareResult";
import type { ShareSession } from "@/domain/share/shareSession";
import { parseMapDocumentJson } from "@/domain/persistence/mapDocumentCodec";
import type { MapDocumentV3 } from "@/types/mapDocument";
import { useLatestRef } from "@/hooks/useLatestRef";
import {
  createCollabApiClient,
  type CollabApiClient,
} from "@/services/collab/collabApiClient";
import { createBrowserCollabWsTransport } from "@/services/collab/browserCollabWsTransport";
import {
  EMPTY_REMOTE_SELECTIONS,
  EMPTY_REMOTE_VIEWPORTS,
} from "@/domain/collab/collabRemotePresence";
import {
  createCollabDocumentSession,
  type CollabDocumentSession,
  type CollabLocalAwarenessInput,
} from "@/services/collab/collabDocumentSession";
import {
  createCollabWsSession,
  type CollabWsSession,
  type CollabWsTransport,
} from "@/services/collab/collabWsSession";

export type UseMapEditorCollabOptions = {
  mapId: string;
  shareSession: ShareSession;
  getDocumentJson: () => string;
  getSharedMapId: () => string | null;
  getStartGuard: () => Omit<CollabStartGuardInput, "shareSession" | "collabSession">;
  onApplyEndedDocument?: (documentJson: string) => void;
  onAskPublishAfterEnd?: () => void;
  /** Yjs 投影（リモート／Undo）。active 中の正本反映 */
  onYjsDocument?: (document: MapDocumentV3) => void;
  /** awareness 用の表示名（Google name）。欠落は null（email フォールバックなし） */
  getAwarenessProfile?: () => { userId: string; displayName: string } | null;
  /**
   * 選択・ビューポート中心。viewport 未準備なら null（{0,0} 捏造禁止・L-002）。
   * null の間は local awareness を publish しない。
   */
  getAwarenessSelection?: () => {
    selectedNodeIds: readonly number[];
    viewportCenter: { x: number; y: number };
  } | null;
  /** 選択・ビューポート変化で変えると awareness を再送する（rAF で束ねる） */
  awarenessRevision?: string | number;
  api?: CollabApiClient;
  createTransport?: () => CollabWsTransport;
  nowMs?: () => number;
  joinToken?: string | null;
};

export type UseMapEditorCollabResult = {
  collabSession: CollabSessionUi;
  participants: readonly CollabParticipant[];
  participantsState: CollabParticipantsState;
  /** 他者選択。キーあり + [] = 明示未選択。空 Map = 誰もいない／未共有 */
  remoteSelections: ReadonlyMap<string, readonly number[]>;
  /** 他者ビューポート中心。キー無し = 未取得／非共有 */
  remoteViewports: ReadonlyMap<string, { x: number; y: number }>;
  notice: ShareNoticeState["notice"];
  noticeSequence: number;
  startDisabledReason: string | null;
  /** active 中は Yjs UndoManager。それ以外は false */
  canYjsUndo: boolean;
  canYjsRedo: boolean;
  yjsUndo: () => boolean;
  yjsRedo: () => boolean;
  /** active 中にローカル文書を Yjs へ押し込む */
  pushLocalDocumentJson: (documentJson: string) => boolean;
  onStartCollab: () => Promise<ShareResult<{ sessionId: string }>>;
  onLeaveCollab: () => Promise<ShareResult<void>>;
  onEndCollab: () => Promise<ShareResult<void>>;
  onRetryCollab: () => Promise<ShareResult<{ sessionId: string }>>;
  clearNotice: () => void;
};

type SessionRuntime = {
  sessionId: string;
  role: "owner" | "editor";
  ws: CollabWsSession;
  document: CollabDocumentSession;
  reconnectingSince: number | null;
};

function tearDownRuntime(runtime: SessionRuntime | null): void {
  if (!runtime) return;
  runtime.document.destroy();
  runtime.ws.disconnect();
}

/**
 * 所有者／参加者の共同編集セッション配線。
 * Y.Doc 正本・awareness 参加者・Yjs Undo・L-166 notice・2 分脱落。
 */
export function useMapEditorCollab(
  options: UseMapEditorCollabOptions,
): UseMapEditorCollabResult {
  const {
    mapId,
    shareSession,
    getDocumentJson,
    getSharedMapId,
    getStartGuard,
    onApplyEndedDocument,
    onAskPublishAfterEnd,
    onYjsDocument,
    getAwarenessProfile,
    getAwarenessSelection,
    awarenessRevision = 0,
    joinToken = null,
  } = options;
  const nowMs = options.nowMs ?? Date.now;
  const injectedApi = options.api;
  const lazyApiRef = useRef<CollabApiClient | null>(null);
  const resolveApi = useCallback((): CollabApiClient => {
    if (injectedApi) return injectedApi;
    if (lazyApiRef.current) return lazyApiRef.current;
    const created = createCollabApiClient();
    lazyApiRef.current = created;
    return created;
  }, [injectedApi]);
  const createTransport = options.createTransport ?? createBrowserCollabWsTransport;

  const [collabSession, setCollabSession] = useState<CollabSessionUi>({ status: "idle" });
  const [participants, setParticipants] = useState<readonly CollabParticipant[]>([]);
  const [participantsState, setParticipantsState] = useState<CollabParticipantsState>("ready");
  const [remoteSelections, setRemoteSelections] =
    useState<ReadonlyMap<string, readonly number[]>>(EMPTY_REMOTE_SELECTIONS);
  const [remoteViewports, setRemoteViewports] =
    useState<ReadonlyMap<string, { x: number; y: number }>>(EMPTY_REMOTE_VIEWPORTS);
  const [noticeState, setNoticeState] = useState<ShareNoticeState>(createEmptyShareNotice);
  const [canYjsUndo, setCanYjsUndo] = useState(false);
  const [canYjsRedo, setCanYjsRedo] = useState(false);
  const runtimeRef = useRef<SessionRuntime | null>(null);
  const mapIdRef = useRef(mapId);
  const onYjsDocumentRef = useLatestRef(onYjsDocument);
  const getAwarenessProfileRef = useLatestRef(getAwarenessProfile);
  const getAwarenessSelectionRef = useLatestRef(getAwarenessSelection);

  const clearNotice = useCallback(() => {
    setNoticeState((prev) => clearShareNotice(prev));
  }, []);

  const syncYjsHistoryFlags = useCallback((document: CollabDocumentSession | null) => {
    if (!document) {
      setCanYjsUndo(false);
      setCanYjsRedo(false);
      return;
    }
    setCanYjsUndo(document.undo.canUndo());
    setCanYjsRedo(document.undo.canRedo());
  }, []);

  const clearPresenceMaps = useCallback(() => {
    setRemoteSelections(EMPTY_REMOTE_SELECTIONS);
    setRemoteViewports(EMPTY_REMOTE_VIEWPORTS);
  }, []);

  /** UI リセット計画を適用（tearDown と setState のみ） */
  const applyUiReset = useCallback(
    (plan: PlanCollabUiResetResult) => {
      if (plan.tearDownRuntime) {
        tearDownRuntime(runtimeRef.current);
        runtimeRef.current = null;
      }
      setCollabSession(plan.nextSession);
      if (plan.clearParticipantsAndPresence) {
        setParticipants([]);
        setParticipantsState(plan.participantsState);
        clearPresenceMaps();
      }
      if (plan.clearUndoFlags) {
        syncYjsHistoryFlags(null);
      }
    },
    [clearPresenceMaps, syncYjsHistoryFlags],
  );

  /** 参加者一覧 + remote presence Maps を awareness から同期 */
  const refreshAwarenessUi = useCallback((document: CollabDocumentSession) => {
    setParticipants(document.readParticipants());
    setParticipantsState("ready");
    const localUserId = getAwarenessProfileRef.current?.()?.userId;
    const maps = document.readPresenceMaps(localUserId);
    setRemoteSelections(maps.remoteSelections);
    setRemoteViewports(maps.remoteViewports);
  }, []);

  const publishLocalAwareness = useCallback((document: CollabDocumentSession) => {
    const profile = getAwarenessProfileRef.current?.() ?? null;
    if (!profile) return;
    // viewport 未準備・欠落は {0,0} に倒さず publish しない（L-002）
    const selection = getAwarenessSelectionRef.current?.() ?? null;
    if (selection === null) return;
    const input: CollabLocalAwarenessInput = {
      userId: profile.userId,
      displayName: profile.displayName,
      selectedNodeIds: selection.selectedNodeIds,
      viewportCenter: selection.viewportCenter,
    };
    document.setLocalAwareness(input);
    refreshAwarenessUi(document);
  }, [refreshAwarenessUi]);

  useEffect(() => {
    if (mapIdRef.current === mapId) return;
    mapIdRef.current = mapId;
    applyUiReset(planCollabUiResetToIdle());
    setNoticeState(createEmptyShareNotice());
  }, [mapId, applyUiReset]);

  // アンマウントで WS / Y.Doc を解放（リーク防止）
  useEffect(() => () => {
    tearDownRuntime(runtimeRef.current);
    runtimeRef.current = null;
  }, []);

  const startDisabledReason = (() => {
    const blocked = resolveCollabStartBlocked({
      ...getStartGuard(),
      shareSession,
      collabSession,
    });
    return blocked === null ? null : collabStartBlockedMessage(blocked);
  })();

  const attachWs = useCallback(
    (sessionId: string, ticket: string, wsUrl: string, role: "owner" | "editor") => {
      tearDownRuntime(runtimeRef.current);
      let reconnectingSince: number | null = null;

      const document = createCollabDocumentSession({
        send: (data) => {
          runtimeRef.current?.ws.send(data);
        },
      });
      document.onRemoteOrUndoDocument((projected) => {
        onYjsDocumentRef.current?.(projected);
        syncYjsHistoryFlags(document);
        refreshAwarenessUi(document);
      });

      const applyConnection = (state: CollabConnectionState) => {
        if (state === "closed") {
          // intentional disconnect / tearDown 後の実 WS 非同期 close。
          // error（connection-error / dropped-grace）を idle で潰さない（functional setState）。
          setCollabSession((prev) => nextCollabSessionAfterClosed(prev));
          setParticipants([]);
          setParticipantsState("ready");
          clearPresenceMaps();
          syncYjsHistoryFlags(null);
          return;
        }

        const plan = planCollabConnectionTransition({
          connection: state,
          sessionId,
          role,
          reconnectingSince,
          nowMs: nowMs(),
        });
        reconnectingSince = plan.nextReconnectingSince;
        if (runtimeRef.current) {
          runtimeRef.current.reconnectingSince = plan.nextReconnectingSince;
        }
        if (plan.tearDownRuntime) {
          tearDownRuntime(runtimeRef.current);
          runtimeRef.current = null;
        }
        setCollabSession(plan.nextSession);
        if (plan.participantsLoading) {
          setParticipantsState("loading");
        } else if (plan.clearParticipantsAndPresence) {
          setParticipantsState("ready");
        }
        if (plan.clearParticipantsAndPresence) {
          setParticipants([]);
          clearPresenceMaps();
        }
        if (plan.clearUndoFlags) {
          syncYjsHistoryFlags(null);
        }
        if (plan.publishConnectionError) {
          setNoticeState((prev) =>
            publishShareError(prev, collabOperationFailureMessage("connection-error")),
          );
        }
        if (plan.enterActive) {
          publishLocalAwareness(document);
          // 同期直後の投影（サーバー seed 反映）
          const initial = document.readDocument();
          if (initial) {
            onYjsDocumentRef.current?.(initial);
          }
          refreshAwarenessUi(document);
          syncYjsHistoryFlags(document);
        }
      };

      const ws = createCollabWsSession({
        wsUrl,
        ticket,
        transport: createTransport(),
        onStateChange: applyConnection,
        onMessage: (data) => {
          document.handleMessage(data, (out) => {
            ws.send(out);
          });
          // awareness 更新のたびに一覧・presence を更新
          refreshAwarenessUi(document);
        },
      });
      runtimeRef.current = { sessionId, role, ws, document, reconnectingSince: null };
      setCollabSession({ status: "connecting" });
      setParticipants([]);
      setParticipantsState("loading");
      clearPresenceMaps();
      ws.connect();
    },
    [
      clearPresenceMaps,
      createTransport,
      nowMs,
      publishLocalAwareness,
      refreshAwarenessUi,
      syncYjsHistoryFlags,
    ],
  );

  useEffect(() => {
    if (collabSession.status !== "reconnecting") return;
    const since = collabSession.since;
    const sessionId = collabSession.sessionId;
    const tick = () => {
      if (nowMs() - since < COLLAB_RECONNECT_GRACE_MS) return;
      // 脱落: D1 参加者行を消し枠を解放（再参加は edit join）
      void resolveApi().leaveSession(sessionId);
      applyUiReset(planCollabUiResetDroppedGrace());
      setNoticeState((prev) =>
        publishShareError(prev, collabOperationFailureMessage("dropped-grace")),
      );
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [applyUiReset, collabSession, nowMs, resolveApi]);

  // reconnecting 中は ticket 再発行 API で短命 ticket を取り直してから WS 再接続
  useEffect(() => {
    if (collabSession.status !== "reconnecting") return;
    const sessionId = collabSession.sessionId;
    let cancelled = false;
    let retryTimer: number | undefined;

    const attempt = async () => {
      const result = await resolveApi().reissueTicket(sessionId);
      if (cancelled) return;
      if (!result.ok) {
        retryTimer = window.setTimeout(() => {
          void attempt();
        }, 2000);
        return;
      }
      const runtime = runtimeRef.current;
      if (!runtime || runtime.sessionId !== sessionId) return;
      runtime.ws.connect(result.value.ticket);
    };

    void attempt();
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [collabSession, resolveApi]);

  const prevStatusRef = useRef(collabSession.status);
  /* eslint-disable react-hooks/set-state-in-effect -- セッション状態変化での通知クリア（L-166） */
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = collabSession.status;
    const plan = planCollabNoticeClear({
      previousStatus: prev,
      nextStatus: collabSession.status,
    });
    if (plan.action === "noop") return;
    if (plan.action === "clear") {
      setNoticeState((n) => clearShareNotice(n));
      return;
    }
    setNoticeState((n) => {
      if (!shouldClearNonStatusNotice(n.notice)) return n;
      return clearShareNotice(n);
    });
  }, [collabSession.status]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // active 中は選択・ビューポート変化を awareness に載せる（pan 毎 frame は rAF で束ねる）
  useEffect(() => {
    if (collabSession.status !== "active") return;
    const document = runtimeRef.current?.document;
    if (!document) return;
    let cancelled = false;
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return;
      publishLocalAwareness(document);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [awarenessRevision, collabSession.status, publishLocalAwareness]);

  const onStartCollab = useCallback(async (): Promise<ShareResult<{ sessionId: string }>> => {
    const blocked = resolveCollabStartBlocked({
      ...getStartGuard(),
      shareSession,
      collabSession,
    });
    if (blocked !== null) {
      return { ok: false, reason: blocked };
    }
    setNoticeState((prev) => clearShareNotice(prev));
    setCollabSession({ status: "connecting" });
    const result = await resolveApi().startSession({
      localMapId: mapId,
      documentJson: getDocumentJson(),
      sharedMapId: getSharedMapId() ?? undefined,
    });
    if (!result.ok) {
      setCollabSession({ status: "error", error: result.reason });
      setNoticeState((prev) =>
        publishShareError(prev, collabOperationFailureMessage(result.reason)),
      );
      return result;
    }
    attachWs(result.value.sessionId, result.value.ticket, result.value.wsUrl, "owner");
    setNoticeState((prev) => publishShareSuccess(prev, COLLAB_MESSAGES.startSuccess));
    return { ok: true, value: { sessionId: result.value.sessionId } };
  }, [attachWs, collabSession, getDocumentJson, getSharedMapId, getStartGuard, mapId, resolveApi, shareSession]);

  const onLeaveCollab = useCallback(async (): Promise<ShareResult<void>> => {
    if (
      collabSession.status !== "active" &&
      collabSession.status !== "reconnecting" &&
      collabSession.status !== "error"
    ) {
      return { ok: false, reason: "busy" };
    }
    const sessionId =
      collabSession.status === "active" || collabSession.status === "reconnecting"
        ? collabSession.sessionId
        : runtimeRef.current?.sessionId;
    setNoticeState((prev) => clearShareNotice(prev));
    if (sessionId) {
      const leaveResult = await resolveApi().leaveSession(sessionId);
      if (!leaveResult.ok && leaveResult.reason !== "not-found") {
        setNoticeState((prev) =>
          publishShareError(prev, collabOperationFailureMessage(leaveResult.reason)),
        );
        return leaveResult;
      }
    }
    applyUiReset(planCollabUiResetToIdle());
    setNoticeState((prev) => publishShareSuccess(prev, COLLAB_MESSAGES.leaveSuccess));
    return { ok: true, value: undefined };
  }, [applyUiReset, collabSession, resolveApi]);

  const onEndCollab = useCallback(async (): Promise<ShareResult<void>> => {
    if (collabSession.status !== "active" || collabSession.role !== "owner") {
      return { ok: false, reason: "busy" };
    }
    const sessionId = collabSession.sessionId;
    setNoticeState((prev) => clearShareNotice(prev));
    const result = await resolveApi().endSession(sessionId);
    if (!result.ok) {
      setNoticeState((prev) =>
        publishShareError(prev, collabOperationFailureMessage(result.reason)),
      );
      return result;
    }
    if (result.value.documentJson.length > 0) {
      onApplyEndedDocument?.(result.value.documentJson);
    }
    applyUiReset(planCollabUiResetToIdle());
    setNoticeState((prev) => publishShareSuccess(prev, COLLAB_MESSAGES.endSuccess));
    if (getSharedMapId() !== null) {
      onAskPublishAfterEnd?.();
    }
    return { ok: true, value: undefined };
  }, [
    applyUiReset,
    collabSession,
    getSharedMapId,
    onApplyEndedDocument,
    onAskPublishAfterEnd,
    resolveApi,
  ]);

  const onRetryCollab = useCallback(async (): Promise<ShareResult<{ sessionId: string }>> => {
    if (joinToken) {
      setNoticeState((prev) => clearShareNotice(prev));
      setCollabSession({ status: "connecting" });
      const result = await resolveApi().joinSession({ token: joinToken });
      if (!result.ok) {
        setCollabSession({ status: "error", error: result.reason });
        setNoticeState((prev) =>
          publishShareError(prev, collabOperationFailureMessage(result.reason)),
        );
        return result;
      }
      attachWs(result.value.sessionId, result.value.ticket, result.value.wsUrl, "editor");
      setNoticeState((prev) => publishShareSuccess(prev, COLLAB_MESSAGES.joinSuccess));
      return { ok: true, value: { sessionId: result.value.sessionId } };
    }
    return onStartCollab();
  }, [attachWs, joinToken, onStartCollab, resolveApi]);

  const joinedTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!joinToken || shareSession === null) return;
    if (joinedTokenRef.current === joinToken) return;
    if (collabSession.status !== "idle" && collabSession.status !== "error") return;
    joinedTokenRef.current = joinToken;
    void (async () => {
      setCollabSession({ status: "connecting" });
      const result = await resolveApi().joinSession({ token: joinToken });
      if (!result.ok) {
        setCollabSession({ status: "error", error: result.reason });
        setNoticeState((prev) =>
          publishShareError(prev, collabOperationFailureMessage(result.reason)),
        );
        return;
      }
      attachWs(result.value.sessionId, result.value.ticket, result.value.wsUrl, "editor");
      setNoticeState((prev) => publishShareSuccess(prev, COLLAB_MESSAGES.joinSuccess));
    })();
  }, [attachWs, collabSession.status, joinToken, resolveApi, shareSession]);

  const pushLocalDocumentJson = useCallback((documentJson: string): boolean => {
    const document = runtimeRef.current?.document;
    if (!document || collabSession.status !== "active") return false;
    const parsed = parseMapDocumentJson(documentJson);
    if (!parsed.ok) return false;
    const ok = document.pushLocalDocument(parsed.value);
    if (ok) syncYjsHistoryFlags(document);
    return ok;
  }, [collabSession.status, syncYjsHistoryFlags]);

  const yjsUndo = useCallback(() => {
    const document = runtimeRef.current?.document;
    if (!document || collabSession.status !== "active") return false;
    const ok = document.undo.undo();
    if (ok) syncYjsHistoryFlags(document);
    return ok;
  }, [collabSession.status, syncYjsHistoryFlags]);

  const yjsRedo = useCallback(() => {
    const document = runtimeRef.current?.document;
    if (!document || collabSession.status !== "active") return false;
    const ok = document.undo.redo();
    if (ok) syncYjsHistoryFlags(document);
    return ok;
  }, [collabSession.status, syncYjsHistoryFlags]);

  return {
    collabSession,
    participants,
    participantsState,
    remoteSelections,
    remoteViewports,
    notice: noticeState.notice,
    noticeSequence: noticeState.sequence,
    startDisabledReason,
    canYjsUndo,
    canYjsRedo,
    yjsUndo,
    yjsRedo,
    pushLocalDocumentJson,
    onStartCollab,
    onLeaveCollab,
    onEndCollab,
    onRetryCollab,
    clearNotice,
  };
}
