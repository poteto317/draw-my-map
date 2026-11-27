"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { ShareCommentComposer } from "@/components/share/ShareCommentComposer";
import type { ShareCommentThreadSections } from "@/components/share/shareCommentThreadSections";
import { useCommentThreadFocus } from "@/components/share/useCommentThreadFocus";
import { normalizeShareCommentNodeLabel } from "@/domain/share/normalizeShareCommentNodeLabel";
import type {
  ShareCommentDeleteValue,
  ShareCommentThreadView,
  ShareCommentView,
} from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import type { ShareResult } from "@/domain/share/shareResult";

export type ShareCommentThreadListProps = {
  sections: ShareCommentThreadSections;
  /** 見出しに出すラベル。無いノード（orphaned）は nodeLabelSnapshot を「削除されたノード: 」付きで出す */
  nodeLabelById: ReadonlyMap<number, string>;
  canPost: boolean;
  busy: boolean;
  /** フォーカスの最後の戻り先（一覧の見出し「コメント」） */
  listHeadingRef: RefObject<HTMLElement | null>;
  /** 閲覧シェルの選択強調用。所有者は null */
  onSelectThreadNode: ((nodeId: number) => void) | null;
  /**
   * 書込み系はどれも、成功時は一覧（sections）の差し替えを済ませてから解決する。
   * 操作後のフォーカスは差し替え後の描画で移す（L-397）
   */
  onReply: (threadId: string, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  onResolve: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  onReopen: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  onDeleteComment: (threadId: string, commentId: string) => Promise<ShareResult<ShareCommentDeleteValue>>;
};

const dateTimeFormat = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

const actionButtonClassName = "shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";
const cancelButtonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";
const dangerButtonClassName = "shrink-0 rounded-md border border-red-600 px-3 py-1 text-sm text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60 dark:border-red-400 dark:text-red-400 dark:hover:bg-zinc-700";

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormat.format(date);
}

/** 描画順（未解決 → 解決済み → 削除されたノード）のスレッド ID */
function listThreadIds(sections: ShareCommentThreadSections): string[] {
  return [...sections.open, ...sections.resolved, ...sections.orphaned].map((item) => item.id);
}

/** どの節にも無くなったスレッドの下書きだけ捨てる（L-859 / L-775）。変化が無ければ同じ Map を返す */
function pruneDrafts(
  drafts: ReadonlyMap<string, string>,
  sections: ShareCommentThreadSections,
): ReadonlyMap<string, string> {
  const ids = new Set(listThreadIds(sections));
  const next = new Map<string, string>();
  for (const [threadId, draft] of drafts) {
    if (ids.has(threadId)) next.set(threadId, draft);
  }
  return next.size === drafts.size ? drafts : next;
}

/**
 * コメントスレッドの一覧（所有者ダイアログと閲覧パネルで共用）。
 * 本文・表示名・ラベルは React のテキストとして描く（HTML として解釈しない）。
 */
export function ShareCommentThreadList({
  sections,
  nodeLabelById,
  canPost,
  busy,
  listHeadingRef,
  onSelectThreadNode,
  onReply,
  onResolve,
  onReopen,
  onDeleteComment,
}: ShareCommentThreadListProps) {
  const orphanedHeadingId = useId();
  const [drafts, setDrafts] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [draftsSections, setDraftsSections] = useState(sections);
  if (draftsSections !== sections) {
    // 一覧の差し替え（書込み応答・再読み込み）では、残ったスレッドの下書きを消さない
    setDraftsSections(sections);
    setDrafts((prev) => pruneDrafts(prev, sections));
  }
  const [confirmingCommentId, setConfirmingCommentId] = useState<string | null>(null);
  const actionInFlightRef = useRef(false);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const { registerHeading, registerDeleteButton, requestFocus } = useCommentThreadFocus({
    busy,
    listHeadingRef,
  });

  useLayoutEffect(() => {
    if (confirmingCommentId !== null) cancelButtonRef.current?.focus();
  }, [confirmingCommentId]);

  /** 解決・再開・削除の二重実行を同期フラグで止める（L-653） */
  const runAction = async <T,>(
    action: () => Promise<ShareResult<T>>,
    onSuccess: () => void,
    trigger: HTMLButtonElement,
  ): Promise<void> => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const result = await action();
      if (result.ok) onSuccess();
      else requestFocus({ kind: "element", element: trigger });
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const threadIdsAround = (threadId: string) => {
    const ids = listThreadIds(sections);
    const index = ids.indexOf(threadId);
    return { after: ids.slice(index + 1), before: ids.slice(0, Math.max(index, 0)).reverse() };
  };

  const handleResolve = (event: MouseEvent<HTMLButtonElement>, threadId: string) => {
    // 「削除されたノード」節のスレッドは解決しても同じ節に留まるので、そのスレッドの見出しへ
    const staysInPlace = sections.orphaned.some((item) => item.id === threadId);
    const candidates = staysInPlace ? [threadId] : threadIdsAround(threadId).after;
    void runAction(
      () => onResolve(threadId),
      () => requestFocus({ kind: "thread", candidates }),
      event.currentTarget,
    );
  };

  const handleReopen = (event: MouseEvent<HTMLButtonElement>, threadId: string) => {
    void runAction(
      () => onReopen(threadId),
      () => requestFocus({ kind: "thread", candidates: [threadId] }),
      event.currentTarget,
    );
  };

  const handleConfirmDelete = (event: MouseEvent<HTMLButtonElement>, threadId: string, commentId: string) => {
    // ダブルクリックの続きで確認を飛ばさない（L-408）
    if (event.detail > 1) return;
    const { after, before } = threadIdsAround(threadId);
    void runAction(
      () => onDeleteComment(threadId, commentId),
      () => {
        setConfirmingCommentId(null);
        // スレッドが残ればその見出し、消えたら次 → 前 → 一覧の見出し
        requestFocus({ kind: "thread", candidates: [threadId, ...after, ...before] });
      },
      event.currentTarget,
    );
  };

  const handleCancelDelete = (commentId: string) => {
    setConfirmingCommentId(null);
    requestFocus({ kind: "delete-button", commentId });
  };

  const handleReply = async (threadId: string, body: string) => {
    const result = await onReply(threadId, body);
    if (result.ok) {
      setDrafts((prev) => {
        const next = new Map(prev);
        next.delete(threadId);
        return next;
      });
    }
    return result;
  };

  const renderComment = (item: ShareCommentThreadView, entry: ShareCommentView) => {
    const createdAt = formatDateTime(entry.createdAt);
    const confirming = confirmingCommentId === entry.id;
    return (
      <li key={entry.id} className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="font-medium break-words text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-200">
            {entry.authorName}
          </span>
          <time dateTime={entry.createdAt}>{createdAt}</time>
          {entry.canDelete && (
            <button
              ref={registerDeleteButton(entry.id)}
              type="button"
              className={actionButtonClassName}
              disabled={busy}
              aria-label={`${SHARE_COMMENT_MESSAGES.delete}（${entry.authorName}・${createdAt}）`}
              onClick={() => setConfirmingCommentId(entry.id)}
            >
              {SHARE_COMMENT_MESSAGES.delete}
            </button>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100">{entry.body}</p>
        {entry.canDelete && confirming && (
          <div
            role="group"
            aria-label={SHARE_COMMENT_MESSAGES.deleteConfirm}
            className="flex flex-col gap-2 rounded border border-red-200 p-2 dark:border-red-800"
          >
            <p className="text-sm text-zinc-800 dark:text-zinc-100">{SHARE_COMMENT_MESSAGES.deleteConfirm}</p>
            {/* 安全側の「キャンセル」を先に置き、確認を開いた直後のフォーカス先にする */}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                ref={cancelButtonRef}
                type="button"
                className={cancelButtonClassName}
                onKeyDown={preventRepeatedActivationClick}
                onClick={() => handleCancelDelete(entry.id)}
              >
                {SHARE_COMMENT_MESSAGES.deleteConfirmNo}
              </button>
              <button
                type="button"
                className={dangerButtonClassName}
                disabled={busy}
                onKeyDown={preventRepeatedActivationClick}
                onClick={(event) => handleConfirmDelete(event, item.id, entry.id)}
              >
                {SHARE_COMMENT_MESSAGES.deleteConfirmYes}
              </button>
            </div>
          </div>
        )}
      </li>
    );
  };

  const renderThread = (item: ShareCommentThreadView, orphaned: boolean) => {
    // 現ラベルは snapshot と同じ正規化をかけて表示・比較する（空なら「（無題）」）
    const currentLabel = orphaned
      ? null
      : normalizeShareCommentNodeLabel(nodeLabelById.get(item.nodeId) ?? item.nodeLabelSnapshot);
    const showSnapshot = currentLabel !== null && currentLabel !== item.nodeLabelSnapshot;
    const labelText = currentLabel ?? `${SHARE_COMMENT_MESSAGES.orphanedPrefix}${item.nodeLabelSnapshot}`;
    // 「削除されたノード」節の中は節見出し（h3）の下になる
    const ThreadHeading = orphaned ? "h4" : "h3";
    const resolved = item.status === "resolved";
    return (
      <article
        key={item.id}
        className="flex flex-col gap-2 rounded border border-zinc-200 p-2 text-sm dark:border-zinc-600"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <ThreadHeading
            ref={registerHeading(item.id)}
            tabIndex={-1}
            data-thread-id={item.id}
            className="min-w-0 font-semibold break-words text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-100"
          >
            <span>{labelText}</span>
            {showSnapshot && (
              <span className="ml-2 text-xs font-normal text-zinc-600 dark:text-zinc-400">
                {`${SHARE_COMMENT_MESSAGES.snapshotPrefix}${item.nodeLabelSnapshot}`}
              </span>
            )}
          </ThreadHeading>
          {onSelectThreadNode !== null && !orphaned && (
            <button
              type="button"
              className={actionButtonClassName}
              aria-label={`${SHARE_COMMENT_MESSAGES.selectThreadNode}（${labelText}）`}
              onClick={() => onSelectThreadNode(item.nodeId)}
            >
              {SHARE_COMMENT_MESSAGES.selectThreadNode}
            </button>
          )}
        </div>
        <p className="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
          <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100">
            {resolved ? SHARE_COMMENT_MESSAGES.statusResolved : SHARE_COMMENT_MESSAGES.statusOpen}
          </span>
          {resolved && item.resolvedByName !== null && (
            <span className="break-words [overflow-wrap:anywhere]">
              {`${SHARE_COMMENT_MESSAGES.resolvedBy}${item.resolvedByName}`}
            </span>
          )}
          {resolved && item.resolvedAt !== null && (
            <time dateTime={item.resolvedAt}>{formatDateTime(item.resolvedAt)}</time>
          )}
        </p>
        <ul className="flex flex-col gap-2">{item.comments.map((entry) => renderComment(item, entry))}</ul>
        {item.canResolve && (
          <div className="flex justify-end">
            <button
              type="button"
              className={actionButtonClassName}
              disabled={busy}
              aria-label={`${resolved ? SHARE_COMMENT_MESSAGES.reopen : SHARE_COMMENT_MESSAGES.resolve}（${labelText}）`}
              onClick={(event) => (resolved ? handleReopen(event, item.id) : handleResolve(event, item.id))}
            >
              {resolved ? SHARE_COMMENT_MESSAGES.reopen : SHARE_COMMENT_MESSAGES.resolve}
            </button>
          </div>
        )}
        {!resolved && canPost && (
          <ShareCommentComposer
            value={drafts.get(item.id) ?? ""}
            onChange={(value) =>
              setDrafts((prev) => {
                const next = new Map(prev);
                next.set(item.id, value);
                return next;
              })
            }
            onSubmit={(body) => handleReply(item.id, body)}
            submitLabel={SHARE_COMMENT_MESSAGES.reply}
            disabled={busy}
            ariaLabel={`${SHARE_COMMENT_MESSAGES.reply}（${labelText}）`}
          />
        )}
      </article>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {sections.open.length > 0 && (
        <div className="flex flex-col gap-2">{sections.open.map((item) => renderThread(item, false))}</div>
      )}
      {sections.resolved.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {`${SHARE_COMMENT_MESSAGES.resolvedSection}（${sections.resolved.length}）`}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {sections.resolved.map((item) => renderThread(item, false))}
          </div>
        </details>
      )}
      {sections.orphaned.length > 0 && (
        <section aria-labelledby={orphanedHeadingId} className="flex flex-col gap-2">
          <h3 id={orphanedHeadingId} className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {`${SHARE_COMMENT_MESSAGES.orphanedSection}（${sections.orphaned.length}）`}
          </h3>
          {sections.orphaned.map((item) => renderThread(item, true))}
        </section>
      )}
    </div>
  );
}
