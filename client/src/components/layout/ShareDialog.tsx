"use client";

import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import {
  listFocusableElements,
  useDialogFocusTrap,
} from "@/components/layout/useDialogFocusTrap";
import { useReannouncedNotice } from "@/components/layout/useReannouncedNotice";
import {
  formatShareLinkPermissionLabel,
  formatShareLocalMetaSummary,
  listActiveShareLinksForMap,
  type ShareDialogListItemRef,
} from "@/domain/share/shareDialogModel";
import type { CreateShareValue, ShareLinkIssued } from "@/domain/share/shareLink";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { ShareLocalMetaRead } from "@/domain/share/shareLocalMeta";
import type { ShareResult } from "@/domain/share/shareResult";
import type { ShareSession } from "@/domain/share/shareSession";
import type { OperationNotice } from "@/types/operationNotice";

export type ShareDialogProps = {
  mapId: string;
  mapTitle: string;
  shareSession: ShareSession;
  /** loading 中は login 導線を出さない（session null と混同しない） */
  shareSessionStatus: "loading" | "ready";
  localMeta: ShareLocalMetaRead;
  listState: "loading" | "ready" | "error";
  /** listState === "ready" のときのみ意味を持つ（error/loading では空でもよい） */
  shareList: readonly ShareDialogListItemRef[];
  lastIssuedLink: ShareLinkIssued | null;
  notice: OperationNotice | null;
  noticeSequence: number;
  busy: boolean;
  onCreateShare: () => Promise<ShareResult<CreateShareValue>>;
  onPublish: () => Promise<ShareResult<{ revisionId: string }>>;
  onCreateLink: () => Promise<ShareResult<ShareLinkIssued>>;
  onCreateCommentLink: () => Promise<ShareResult<ShareLinkIssued>>;
  onRevokeLink: (linkId: string) => Promise<ShareResult<void>>;
  onReissueLink: (linkId: string) => Promise<ShareResult<ShareLinkIssued>>;
  onDeleteShare: () => Promise<ShareResult<void>>;
  onLogin: () => void;
  onClose: () => void;
  dialogMouseClickedAtRef: RefObject<number | null>;
};

export function ShareDialog({
  mapId,
  mapTitle,
  shareSession,
  shareSessionStatus,
  localMeta,
  listState,
  shareList,
  lastIssuedLink,
  notice,
  noticeSequence,
  busy,
  onCreateShare,
  onPublish,
  onCreateLink,
  onCreateCommentLink,
  onRevokeLink,
  onReissueLink,
  onDeleteShare,
  onLogin,
  onClose,
  dialogMouseClickedAtRef,
}: ShareDialogProps) {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap({
    dialogRef,
    overlayRef,
    onEscape: onClose,
  });
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const first = listFocusableElements(dialog)[0];
    (first ?? dialog).focus();
  }, []);
  const shownNotice = useReannouncedNotice(noticeSequence, notice);
  const sessionPending = shareSessionStatus === "loading";
  const loggedIn = !sessionPending && shareSession !== null;
  const metaReadError = localMeta.status === "read-error";
  const isShared = localMeta.status === "present";
  /** 読取失敗時は共有開始・更新・リンク操作・解除を止める（未共有導線に倒さない） */
  const mutationsBlocked = metaReadError;
  const links = listState === "ready"
    ? listActiveShareLinksForMap(shareList, mapId, localMeta)
    : [];

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
        data-testid="share-dialog"
        data-map-id={mapId}
      >
        <h2 id={headingId} className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {SHARE_MESSAGES.dialogTitle}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{mapTitle}</p>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300" data-testid="share-local-meta">
          {formatShareLocalMetaSummary(localMeta)}
        </p>

        {shownNotice !== null && (
          <p
            role={shownNotice.kind === "status" ? "status" : "alert"}
            aria-live={shownNotice.kind === "status" ? "polite" : "assertive"}
            className={
              shownNotice.kind === "error"
                ? "mt-3 text-sm text-red-700 dark:text-red-300"
                : "mt-3 text-sm text-zinc-600 dark:text-zinc-300"
            }
            data-testid="share-notice"
          >
            {shownNotice.message}
          </p>
        )}

        {sessionPending ? (
          <div className="mt-4 flex flex-col gap-3">
            <p role="status" className="text-sm text-zinc-700 dark:text-zinc-200" data-testid="share-session-loading">
              {SHARE_MESSAGES.sessionLoading}
            </p>
          </div>
        ) : !loggedIn ? (
          <div className="mt-4 flex flex-col gap-3">
            <p role="status" className="text-sm text-zinc-700 dark:text-zinc-200">
              {SHARE_MESSAGES.loginRequired}
            </p>
            <button
              type="button"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white"
              onClick={onLogin}
            >
              {SHARE_MESSAGES.loginButton}
            </button>
          </div>
        ) : metaReadError ? (
          <div className="mt-4 flex flex-col gap-3">
            <p role="alert" className="text-sm text-red-700 dark:text-red-300" data-testid="share-meta-read-error">
              {SHARE_MESSAGES.localMetaReadError}
            </p>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {listState === "loading" && (
              <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
                {SHARE_MESSAGES.listLoading}
              </p>
            )}
            {listState === "error" && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {SHARE_MESSAGES.listError}
              </p>
            )}
            {listState === "ready" && shareList.length === 0 && !isShared && (
              <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
                {SHARE_MESSAGES.listEmpty}
              </p>
            )}

            {!isShared ? (
              <button
                type="button"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
                // list 未取得（loading/error）では既存共有の有無が分からず二重作成を誘発するため ready のみ可
                disabled={busy || listState !== "ready" || mutationsBlocked}
                onClick={() => {
                  void onCreateShare();
                }}
              >
                {SHARE_MESSAGES.createShare}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-100"
                  disabled={busy || mutationsBlocked}
                  onClick={() => {
                    void onPublish();
                  }}
                >
                  {SHARE_MESSAGES.publish}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-100"
                  disabled={busy || mutationsBlocked}
                  onClick={() => {
                    void onCreateLink();
                  }}
                >
                  {SHARE_MESSAGES.createLink}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-100"
                  disabled={busy || mutationsBlocked}
                  onClick={() => {
                    void onCreateCommentLink();
                  }}
                >
                  {SHARE_MESSAGES.createCommentLink}
                </button>
                <ul className="space-y-2" data-testid="share-link-list">
                  {links.map((link) => (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-center gap-2 rounded border border-zinc-200 p-2 text-sm dark:border-zinc-600"
                    >
                      <span
                        className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-800 dark:bg-zinc-600 dark:text-zinc-100"
                        data-testid="share-link-permission"
                      >
                        {formatShareLinkPermissionLabel(link.permission)}
                      </span>
                      <span className="text-zinc-600 dark:text-zinc-300">{link.createdAt}</span>
                      <button
                        type="button"
                        className="rounded bg-zinc-100 px-2 py-1 text-xs disabled:opacity-60 dark:bg-zinc-700"
                        disabled={busy || mutationsBlocked}
                        aria-label={`${SHARE_MESSAGES.revokeLink}（${formatShareLinkPermissionLabel(link.permission)} / ${link.createdAt} / ${link.id}）`}
                        onClick={() => {
                          void onRevokeLink(link.id);
                        }}
                      >
                        {SHARE_MESSAGES.revokeLink}
                      </button>
                      <button
                        type="button"
                        className="rounded bg-zinc-100 px-2 py-1 text-xs disabled:opacity-60 dark:bg-zinc-700"
                        // 権限を解釈できないリンクは再発行させない（失効だけ押せる）
                        disabled={busy || mutationsBlocked || link.permission === null}
                        aria-label={`${SHARE_MESSAGES.reissueLink}（${formatShareLinkPermissionLabel(link.permission)} / ${link.createdAt} / ${link.id}）`}
                        onClick={() => {
                          void onReissueLink(link.id);
                        }}
                      >
                        {SHARE_MESSAGES.reissueLink}
                      </button>
                    </li>
                  ))}
                </ul>
                <p
                  className="text-sm text-zinc-600 dark:text-zinc-300"
                  data-testid="share-delete-comments-warning"
                >
                  {SHARE_MESSAGES.deleteShareCommentsWarning}
                </p>
                <button
                  type="button"
                  className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 disabled:opacity-60 dark:bg-red-950 dark:text-red-200"
                  disabled={busy || mutationsBlocked}
                  onClick={() => {
                    void onDeleteShare();
                  }}
                >
                  {SHARE_MESSAGES.deleteShare}
                </button>
              </>
            )}

            {lastIssuedLink !== null && (
              <div
                className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950"
                data-testid="share-issued-link"
              >
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  {SHARE_MESSAGES.issuedOnce}
                </p>
                <p
                  className="mt-1 text-xs text-amber-900 dark:text-amber-100"
                  data-testid="share-issued-link-permission"
                >
                  {formatShareLinkPermissionLabel(lastIssuedLink.permission)}
                </p>
                <p className="mt-1 break-all text-amber-900 dark:text-amber-100">{lastIssuedLink.url}</p>
                <button
                  type="button"
                  className="mt-2 rounded bg-amber-200 px-2 py-1 text-xs text-amber-950 dark:bg-amber-800 dark:text-amber-50"
                  onClick={() => {
                    void navigator.clipboard?.writeText(lastIssuedLink.url);
                  }}
                >
                  {SHARE_MESSAGES.copyUrl}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100"
            onClick={onClose}
          >
            {SHARE_MESSAGES.close}
          </button>
        </div>
      </div>
    </div>
  );
}
