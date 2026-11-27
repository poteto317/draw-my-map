"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import {
  listFocusableElements,
  useDialogFocusTrap,
} from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { ShareCommentComposer } from "@/components/share/ShareCommentComposer";
import { ShareCommentThreadList } from "@/components/share/ShareCommentThreadList";
import {
  toShareCommentThreadSections,
  toShareCommentThreadSectionsForNode,
} from "@/components/share/shareCommentThreadSections";
import { useNodeKeyedDrafts } from "@/components/share/useNodeKeyedDrafts";
import { normalizeShareCommentNodeLabel } from "@/domain/share/normalizeShareCommentNodeLabel";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { ShareSession } from "@/domain/share/shareSession";
import type { MapEditorComments } from "@/hooks/useMapEditorComments";

export type MapCommentsDialogFilter = "selected" | "all";

export type MapCommentsDialogProps = {
  comments: MapEditorComments;
  /** ローカル文書のノードのラベル（スレッド見出しと投稿欄の名前に使う） */
  nodeLabelById: ReadonlyMap<number, string>;
  selectedNodeId: number | null;
  /** ヘッダーから開いたら all、右パネルから開いたら selected */
  initialFilter: MapCommentsDialogFilter;
  shareSession: ShareSession;
  /** loading 中はログイン導線を出さない（session null と混同しない・L-463） */
  shareSessionStatus: "loading" | "ready";
  onLogin: () => void;
  onClose: () => void;
  dialogMouseClickedAtRef: RefObject<number | null>;
};

const EMPTY_SECTIONS = { open: [], resolved: [], orphaned: [] } as const;

/**
 * 所有者のコメントダイアログ（ShareDialog と同じダイアログ部品の構成）。
 * スレッドの描画は閲覧シェルと共用の ShareCommentThreadList。ノードへ移動のボタンは置かない（設計の非目標）。
 * 新規スレッドの下書きはノード ID キーで持ち、ノードの切替・一覧の差し替えで消さない（L-859 / L-775）
 */
export function MapCommentsDialog({
  comments,
  nodeLabelById,
  selectedNodeId,
  initialFilter,
  shareSession,
  shareSessionStatus,
  onLogin,
  onClose,
  dialogMouseClickedAtRef,
}: MapCommentsDialogProps) {
  const headingId = useId();
  const filterName = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const [filter, setFilter] = useState<MapCommentsDialogFilter>(initialFilter);
  const newThreadDrafts = useNodeKeyedDrafts();
  const { clearNotice } = comments;

  // 閉じる経路（Escape・「閉じる」）はどれも通知を消してから閉じる（L-166）
  const close = () => {
    clearNotice();
    onClose();
  };
  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: close });
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const first = listFocusableElements(dialog)[0];
    (first ?? dialog).focus();
  }, []);
  const shownNotice = useReannouncedNotice(comments.noticeSequence, comments.notice);

  const { listState, value, classified, busy } = comments;
  const sessionPending = shareSessionStatus === "loading";
  const loggedIn = !sessionPending && shareSession !== null;
  const canPost = loggedIn && value !== null && value.viewer.canPost;
  const selectedLabel = selectedNodeId !== null && nodeLabelById.has(selectedNodeId)
    ? normalizeShareCommentNodeLabel(nodeLabelById.get(selectedNodeId) ?? "")
    : null;
  const sections = useMemo(() => {
    if (classified === null) return EMPTY_SECTIONS;
    return filter === "all"
      ? toShareCommentThreadSections(classified)
      : toShareCommentThreadSectionsForNode(classified, selectedNodeId);
  }, [classified, filter, selectedNodeId]);
  const threadCount = sections.open.length + sections.resolved.length + sections.orphaned.length;

  const submitNewThread = async (nodeId: number, body: string) => {
    const result = await comments.createThread(nodeId, body);
    if (result.ok) newThreadDrafts.setDraft(nodeId, "");
    return result;
  };

  const renderComposer = () => {
    if (!canPost || filter !== "selected" || selectedNodeId === null || selectedLabel === null) return null;
    return (
      <ShareCommentComposer
        value={newThreadDrafts.draftFor(selectedNodeId)}
        onChange={(draft) => newThreadDrafts.setDraft(selectedNodeId, draft)}
        onSubmit={(body) => submitNewThread(selectedNodeId, body)}
        submitLabel={SHARE_COMMENT_MESSAGES.submit}
        disabled={busy}
        ariaLabel={`${SHARE_COMMENT_MESSAGES.title}（${selectedLabel}）`}
      />
    );
  };

  const renderList = () => {
    if (listState === "error") {
      return (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {SHARE_COMMENT_MESSAGES.loadFailed}
        </p>
      );
    }
    if (listState === "idle") {
      // ログイン済みで idle なのは未共有のときだけ（入口は無効にしているが、届いても取得失敗と混同しない）
      return (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {SHARE_COMMENT_MESSAGES.notSharedDisabled}
        </p>
      );
    }
    if (listState === "loading") {
      return (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {SHARE_COMMENT_MESSAGES.loading}
        </p>
      );
    }
    // 最後のスレッドを消した後も見出しへフォーカスを戻せるよう、0 件でも一覧部品は残す
    return (
      <>
        {/* 絞り込みが選択中のノードで未選択なら、案内文だけを出す（0 件と取り違えない） */}
        {threadCount === 0 && !(filter === "selected" && selectedNodeId === null) && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{SHARE_COMMENT_MESSAGES.empty}</p>
        )}
        <ShareCommentThreadList
          sections={sections}
          nodeLabelById={nodeLabelById}
          canPost={canPost}
          busy={busy}
          listHeadingRef={listHeadingRef}
          onSelectThreadNode={null}
          onReply={comments.reply}
          onResolve={comments.resolve}
          onReopen={comments.reopen}
          onDeleteComment={comments.deleteComment}
        />
      </>
    );
  };

  const renderBody = () => {
    if (sessionPending) {
      return (
        <p role="status" className="text-sm text-zinc-700 dark:text-zinc-200">
          {SHARE_COMMENT_MESSAGES.sessionLoading}
        </p>
      );
    }
    if (!loggedIn) {
      return (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-zinc-700 dark:text-zinc-200">
            {SHARE_COMMENT_MESSAGES.loginRequired}
          </p>
          <button
            type="button"
            className="self-start rounded-md bg-blue-600 px-3 py-2 text-sm text-white"
            onClick={onLogin}
          >
            {SHARE_COMMENT_MESSAGES.loginButton}
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-3">
        {filter === "selected" && (
          <p
            data-testid="map-comments-selected-node"
            className="text-sm break-words text-zinc-800 [overflow-wrap:anywhere] dark:text-zinc-100"
          >
            {selectedLabel ?? SHARE_COMMENT_MESSAGES.selectNodeHint}
          </p>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-300">{SHARE_COMMENT_MESSAGES.nameVisibilityNotice}</p>
        {renderComposer()}
        {renderList()}
      </div>
    );
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClickCapture={(event) => {
        handleDialogClickCapture(event, () => {
          dialogMouseClickedAtRef.current = Date.now();
        });
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-4 shadow-lg dark:bg-zinc-800"
        data-testid="map-comments-dialog"
      >
        <div className="flex items-center justify-between gap-2">
          <h2
            id={headingId}
            ref={listHeadingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-zinc-900 dark:text-zinc-100"
          >
            {SHARE_COMMENT_MESSAGES.title}
          </h2>
          <button
            type="button"
            className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200"
            disabled={sessionPending || listState === "loading"}
            onClick={() => {
              void comments.reload();
            }}
          >
            {SHARE_COMMENT_MESSAGES.reload}
          </button>
        </div>

        <fieldset className="mt-3 flex gap-4 text-sm text-zinc-800 dark:text-zinc-100">
          <legend className="sr-only">{SHARE_COMMENT_MESSAGES.filterLegend}</legend>
          {(["selected", "all"] as const).map((option) => (
            <label key={option} className="flex items-center gap-1">
              <input
                type="radio"
                name={filterName}
                value={option}
                checked={filter === option}
                onChange={() => setFilter(option)}
              />
              {option === "selected" ? SHARE_COMMENT_MESSAGES.filterSelected : SHARE_COMMENT_MESSAGES.filterAll}
            </label>
          ))}
        </fieldset>

        {shownNotice !== null && (
          <p
            role={shownNotice.kind === "status" ? "status" : "alert"}
            aria-live={shownNotice.kind === "status" ? "polite" : "assertive"}
            className={
              shownNotice.kind === "error"
                ? "mt-3 text-sm text-red-700 dark:text-red-300"
                : "mt-3 text-sm text-zinc-600 dark:text-zinc-300"
            }
            data-testid="map-comments-notice"
          >
            {shownNotice.message}
          </p>
        )}

        <div className="mt-3">{renderBody()}</div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
            onClick={close}
          >
            {SHARE_MESSAGES.close}
          </button>
        </div>
      </div>
    </div>
  );
}
