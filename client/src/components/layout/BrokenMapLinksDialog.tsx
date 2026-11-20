"use client";

import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import {
  listFocusableElements,
  useDialogFocusTrap,
} from "@/components/layout/useDialogFocusTrap";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import {
  collectBrokenMapLinks,
  type BrokenMapLinkItem,
  type BrokenMapLinkStatus,
} from "@/domain/mapLibrary/mapLinkGraph";
import { nodeMapLinkKey, type NodeMapLink } from "@/domain/nodes/nodeMapLink";

export type BrokenMapLinksDialogProps = {
  corpus: CrossMapCorpus;
  onNavigateToSource: (sourceMapId: string, sourceNodeId: number) => void;
  onRemoveCurrentMapLink: (sourceNodeId: number, link: NodeMapLink) => boolean;
  onClose: () => void;
  onMouseClick: () => void;
};

function brokenStatusBadgeLabel(status: BrokenMapLinkStatus): string {
  switch (status) {
    case "missing-map":
      return "マップなし";
    case "missing-node":
      return "ノードなし";
    case "unreadable-map":
      return "読込失敗";
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

function formatBrokenLinkTarget(item: BrokenMapLinkItem): string {
  const mapLabel = item.targetMapName ?? item.link.targetMapId;
  return item.link.targetNodeId === undefined
    ? mapLabel
    : `${mapLabel} #${item.link.targetNodeId}`;
}

export function BrokenMapLinksDialog({
  corpus,
  onNavigateToSource,
  onRemoveCurrentMapLink,
  onClose,
  onMouseClick,
}: BrokenMapLinksDialogProps) {
  const headingId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onClose });

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    listFocusableElements(dialog)[0]?.focus();
  }, []);

  const result = useMemo(() => collectBrokenMapLinks(corpus), [corpus]);

  // 削除は値渡しで行い（L-035）、削除成功で行が消えても閉じるボタンへ安全にフォーカス復帰する（L-397）
  const handleRemoveLink = (item: BrokenMapLinkItem) => {
    if (onRemoveCurrentMapLink(item.sourceNodeId, item.link)) {
      closeButtonRef.current?.focus();
    }
  };

  return (
    <div
      ref={overlayRef}
      onClickCapture={(event) => handleDialogClickCapture(event, onMouseClick)}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="flex max-h-full w-full max-w-2xl flex-col gap-3 overflow-y-auto rounded-lg bg-white p-4 text-zinc-900 shadow-lg dark:bg-zinc-800 dark:text-zinc-100"
      >
        <h2 id={headingId} className="text-lg font-semibold">
          リンク切れの確認
        </h2>

        {result.unreadableMaps.length > 0 && (
          <p
            role="alert"
            className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
          >
            {`一部のマップを読み取れなかったため、すべてのリンク切れを確認できていません: ${result.unreadableMaps
              .map((info) => info.mapName)
              .join("、")}`}
          </p>
        )}

        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {result.items.length === 0
            ? "リンク切れは見つかりませんでした"
            : `${result.items.length} 件のリンク切れが見つかりました`}
        </p>

        {result.items.length > 0 && (
          <ul
            aria-label="リンク切れ一覧"
            className="flex max-h-80 shrink-0 flex-col gap-2 overflow-y-auto"
          >
            {result.items.map((item) => (
              <li
                key={`${item.sourceMapId}:${item.sourceNodeId}:${nodeMapLinkKey(item.link)}`}
                className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900/50"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">
                      {item.sourceMapName}
                    </span>
                    {item.isCurrentMap && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/70 dark:text-blue-200">
                        現在
                      </span>
                    )}
                    <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-800 dark:bg-red-950/60 dark:text-red-200">
                      {brokenStatusBadgeLabel(item.status)}
                    </span>
                  </div>
                  <p className="break-words [overflow-wrap:anywhere] text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {item.sourceNodeLabel}
                  </p>
                  <p className="break-words [overflow-wrap:anywhere] text-xs text-zinc-600 dark:text-zinc-400">
                    {`リンク先: ${formatBrokenLinkTarget(item)}`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigateToSource(item.sourceMapId, item.sourceNodeId)}
                    onKeyDown={preventRepeatedActivationClick}
                    className="rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
                  >
                    参照元へ移動
                  </button>
                  {item.isCurrentMap && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(item)}
                      onKeyDown={preventRepeatedActivationClick}
                      className="rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-red-800 dark:bg-zinc-800 dark:text-red-300 dark:hover:bg-red-950/50"
                    >
                      このリンクを削除
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            onKeyDown={preventRepeatedActivationClick}
            className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-700"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
