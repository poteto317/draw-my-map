"use client";

import {
  collabSessionStatusLabel,
  resolveCollabControlVisibility,
} from "@/domain/collab/collabControlModel";
import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";
import type {
  CollabParticipant,
  CollabParticipantsState,
  CollabSessionUi,
} from "@/domain/collab/collabSessionUi";
import type { ShareResult } from "@/domain/share/shareResult";
import type { ShareSession } from "@/domain/share/shareSession";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";

/**
 * 共同編集コントロール必須 props（L-060）。省略不可。
 * presence 描画は別正本。ここはヘッダー制御のみ。
 * （dialogMouseClickedAtRef は本コントロール未使用のため含めない）
 */
export type CollabControlProps = {
  collabSession: CollabSessionUi;
  participants: readonly CollabParticipant[];
  participantsState: CollabParticipantsState;
  onStartCollab: () => Promise<ShareResult<{ sessionId: string }>>;
  /** 参加者の退出（session は他人がいれば active のまま） */
  onLeaveCollab: () => Promise<ShareResult<void>>;
  /** 所有者のみ。export + session end */
  onEndCollab: () => Promise<ShareResult<void>>;
  shareSession: ShareSession;
  /** 開始が塞がれている理由（表示用）。null なら押せる */
  startDisabledReason?: string | null;
  /** 再試行（error 時） */
  onRetryCollab?: () => Promise<ShareResult<{ sessionId: string }>>;
};

const buttonClassName =
  "rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

/**
 * ヘッダーの共同編集入口（L-060）。
 * 接続状態・参加者一覧（名前・色）・開始／退出／終了を分離して渡す。
 */
export function CollabControl({
  collabSession,
  participants,
  participantsState,
  onStartCollab,
  onLeaveCollab,
  onEndCollab,
  shareSession,
  startDisabledReason = null,
  onRetryCollab,
}: CollabControlProps) {
  const status = collabSession.status;
  const role = status === "active" ? collabSession.role : null;
  const visibility = resolveCollabControlVisibility({
    collabSession,
    shareSession,
    startDisabledReason,
  });

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="collab-control"
      data-collab-status={status}
      data-collab-role={role ?? undefined}
    >
      <span className="text-sm text-zinc-600 dark:text-zinc-300" data-testid="collab-status">
        {COLLAB_MESSAGES.controlLabel}: {collabSessionStatusLabel(collabSession)}
      </span>

      <div data-testid="collab-participants" data-participants-state={participantsState}>
        {participantsState === "loading" ? (
          <span className="text-xs text-zinc-500">{COLLAB_MESSAGES.participantsLoading}</span>
        ) : null}
        {participantsState === "error" ? (
          <span className="text-xs text-red-600">{COLLAB_MESSAGES.participantsError}</span>
        ) : null}
        {participantsState === "ready" && participants.length === 0 ? (
          <span className="text-xs text-zinc-500">{COLLAB_MESSAGES.participantsEmpty}</span>
        ) : null}
        {participantsState === "ready" && participants.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="共同編集の参加者">
            {participants.map((p) => (
              <li
                key={p.userId}
                className="flex items-center gap-1 rounded-full border border-zinc-200 px-2 py-0.5 text-xs dark:border-zinc-600"
                data-testid={`collab-participant-${p.userId}`}
                data-user-id={p.userId}
                data-color={p.color}
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: p.color }}
                />
                <span>{p.displayName}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {visibility.showStart ? (
        <button
          type="button"
          className={buttonClassName}
          aria-label={
            startDisabledReason
              ? `${COLLAB_MESSAGES.start}（${startDisabledReason}）`
              : COLLAB_MESSAGES.start
          }
          title={startDisabledReason ?? undefined}
          disabled={visibility.startDisabled}
          onClick={() => {
            void onStartCollab();
          }}
          onKeyDown={preventRepeatedActivationClick}
        >
          {COLLAB_MESSAGES.start}
        </button>
      ) : null}

      {visibility.showRetry ? (
        <button
          type="button"
          className={buttonClassName}
          aria-label={COLLAB_MESSAGES.retry}
          onClick={() => {
            void (onRetryCollab ?? onStartCollab)();
          }}
          onKeyDown={preventRepeatedActivationClick}
        >
          {COLLAB_MESSAGES.retry}
        </button>
      ) : null}

      {visibility.showLeave ? (
        <button
          type="button"
          className={buttonClassName}
          aria-label={COLLAB_MESSAGES.leave}
          onClick={() => {
            void onLeaveCollab();
          }}
          onKeyDown={preventRepeatedActivationClick}
        >
          {COLLAB_MESSAGES.leave}
        </button>
      ) : null}

      {visibility.showEnd ? (
        <button
          type="button"
          className={buttonClassName}
          aria-label={COLLAB_MESSAGES.end}
          onClick={() => {
            void onEndCollab();
          }}
          onKeyDown={preventRepeatedActivationClick}
        >
          {COLLAB_MESSAGES.end}
        </button>
      ) : null}

      {visibility.showDroppedGraceHint ? (
        <span className="text-xs text-amber-700 dark:text-amber-400" data-testid="collab-rejoin-hint">
          {COLLAB_MESSAGES.droppedGrace}
        </span>
      ) : null}
    </div>
  );
}
