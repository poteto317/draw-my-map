"use client";

import { signIn } from "next-auth/react";
import { useId, useMemo, useRef } from "react";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import { ShareCommentComposer } from "@/components/share/ShareCommentComposer";
import { ShareCommentThreadList } from "@/components/share/ShareCommentThreadList";
import { toShareCommentThreadSections } from "@/components/share/shareCommentThreadSections";
import { useNodeKeyedDrafts } from "@/components/share/useNodeKeyedDrafts";
import type { ClassifiedShareCommentThreads } from "@/domain/share/classifyShareCommentThreads";
import { normalizeShareCommentNodeLabel } from "@/domain/share/normalizeShareCommentNodeLabel";
import type {
  ShareCommentDeleteValue,
  ShareCommentListValue,
  ShareCommentsListState,
  ShareCommentThreadView,
} from "@/domain/share/shareComment";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import type { ShareResult } from "@/domain/share/shareResult";
import type { OperationNotice } from "@/types/operationNotice";

/**
 * パネルが使うコメントの状態と操作（閲覧シェルの useShareViewerComments の戻り値が構造的に満たす）。
 * 書込みは成功時に一覧を差し替えてから解決する
 */
export type ShareCommentsPanelComments = {
  readonly listState: ShareCommentsListState;
  /** ready のときだけ非 null */
  readonly value: ShareCommentListValue | null;
  readonly reload: () => Promise<void>;
  readonly createThread: (nodeId: number, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  readonly reply: (threadId: string, body: string) => Promise<ShareResult<ShareCommentThreadView>>;
  readonly resolve: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  readonly reopen: (threadId: string) => Promise<ShareResult<ShareCommentThreadView>>;
  readonly deleteComment: (threadId: string, commentId: string) => Promise<ShareResult<ShareCommentDeleteValue>>;
  readonly notice: OperationNotice | null;
  readonly noticeSequence: number;
  readonly busy: boolean;
};

export type ShareCommentsPanelProps = {
  comments: ShareCommentsPanelComments;
  sessionStatus: "loading" | "ready";
  signedIn: boolean;
  /** 公開スナップショットのノードで振り分けた一覧（一覧が ready でないときは空） */
  classified: ClassifiedShareCommentThreads;
  nodeLabelById: ReadonlyMap<number, string>;
  selectedNodeId: number | null;
  onSelectNode: (nodeId: number) => void;
};

const reloadButtonClassName = "shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-60";
const loginButtonClassName = "self-start rounded-md bg-blue-600 px-3 py-1 text-sm text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

/**
 * 閲覧シェル（comment リンク）のコメントパネル。所有者用の部品・編集系は import しない（L-061）。
 * 新規スレッドの下書きはノード ID キーで持ち、ノードを切り替えても一覧を差し替えても消さない（L-859 / L-775）。
 */
export function ShareCommentsPanel({
  comments,
  sessionStatus,
  signedIn,
  classified,
  nodeLabelById,
  selectedNodeId,
  onSelectNode,
}: ShareCommentsPanelProps) {
  const headingId = useId();
  const listHeadingRef = useRef<HTMLHeadingElement>(null);
  const newThreadDrafts = useNodeKeyedDrafts();
  const sections = useMemo(() => toShareCommentThreadSections(classified), [classified]);
  const shownNotice = useReannouncedNotice(comments.noticeSequence, comments.notice);

  const { listState, value, busy } = comments;
  const canPost = sessionStatus === "ready" && signedIn && value !== null && value.viewer.canPost;
  const selectedLabel = selectedNodeId !== null && nodeLabelById.has(selectedNodeId)
    ? normalizeShareCommentNodeLabel(nodeLabelById.get(selectedNodeId) ?? "")
    : null;
  const threadCount = sections.open.length + sections.resolved.length + sections.orphaned.length;

  const submitNewThread = async (nodeId: number, body: string) => {
    const result = await comments.createThread(nodeId, body);
    if (result.ok) newThreadDrafts.setDraft(nodeId, "");
    return result;
  };

  const renderPostingArea = () => {
    if (sessionStatus === "loading") {
      return (
        <p role="status" className="text-sm text-zinc-700">
          {SHARE_COMMENT_MESSAGES.sessionLoading}
        </p>
      );
    }
    if (!signedIn) {
      return (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-700">{SHARE_COMMENT_MESSAGES.loginRequired}</p>
          <button
            type="button"
            className={loginButtonClassName}
            onClick={() => {
              void signIn("google", { redirectTo: window.location.pathname });
            }}
          >
            {SHARE_COMMENT_MESSAGES.loginButton}
          </button>
        </div>
      );
    }
    if (!canPost || selectedNodeId === null || selectedLabel === null) return null;
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
        <p role="alert" className="text-sm text-red-700">
          {SHARE_COMMENT_MESSAGES.loadFailed}
        </p>
      );
    }
    if (listState !== "ready") {
      return (
        <p role="status" className="text-sm text-zinc-600">
          {SHARE_COMMENT_MESSAGES.loading}
        </p>
      );
    }
    // 最後のスレッドを消した後も一覧の見出しへフォーカスを戻せるよう、0 件でも一覧部品は残す
    return (
      <>
        {threadCount === 0 && <p className="text-sm text-zinc-600">{SHARE_COMMENT_MESSAGES.empty}</p>}
        <ShareCommentThreadList
          sections={sections}
          nodeLabelById={nodeLabelById}
          canPost={canPost}
          busy={busy}
          listHeadingRef={listHeadingRef}
          onSelectThreadNode={onSelectNode}
          onReply={comments.reply}
          onResolve={comments.resolve}
          onReopen={comments.reopen}
          onDeleteComment={comments.deleteComment}
        />
      </>
    );
  };

  return (
    <section
      data-testid="share-comments-panel"
      aria-labelledby={headingId}
      className="flex flex-col gap-3 p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h2
          id={headingId}
          ref={listHeadingRef}
          tabIndex={-1}
          className="text-base font-semibold text-zinc-900"
        >
          {SHARE_COMMENT_MESSAGES.title}
        </h2>
        <button
          type="button"
          className={reloadButtonClassName}
          disabled={sessionStatus === "loading" || listState === "loading"}
          onClick={() => {
            void comments.reload();
          }}
        >
          {SHARE_COMMENT_MESSAGES.reload}
        </button>
      </div>

      {shownNotice !== null && (
        <p
          role={shownNotice.kind === "status" ? "status" : "alert"}
          aria-live={shownNotice.kind === "status" ? "polite" : "assertive"}
          className={shownNotice.kind === "error" ? "text-sm text-red-700" : "text-sm text-zinc-600"}
          data-testid="share-comments-notice"
        >
          {shownNotice.message}
        </p>
      )}

      <p data-testid="share-comments-selected-node" className="text-sm break-words text-zinc-800 [overflow-wrap:anywhere]">
        {selectedLabel ?? SHARE_COMMENT_MESSAGES.selectNodeHint}
      </p>

      <p className="text-xs text-zinc-600">{SHARE_COMMENT_MESSAGES.nameVisibilityNotice}</p>
      {renderPostingArea()}

      {renderList()}
    </section>
  );
}
