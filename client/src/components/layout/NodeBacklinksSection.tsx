"use client";

import { useId } from "react";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import { collectBacklinks } from "@/domain/mapLibrary/mapLinkGraph";

export type NodeBacklinksSectionProps = {
  selectedNodeId: number | null;
  currentMapId: string;
  corpus: CrossMapCorpus;
  storageMode: "persistent" | "protected";
  onNavigateToMapTarget: (targetMapId: string, targetNodeId?: number) => void;
};

// 右パネルの「被リンク」節。他マップおよび現在マップから対象ノード・対象マップ全体を指すリンク一覧を表示する
export function NodeBacklinksSection({
  selectedNodeId,
  currentMapId,
  corpus,
  storageMode,
  onNavigateToMapTarget,
}: NodeBacklinksSectionProps) {
  const headingId = useId();
  const result =
    selectedNodeId === null
      ? null
      : collectBacklinks(corpus, currentMapId, selectedNodeId);

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        被リンク
      </h2>
      {result === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <>
          {storageMode === "protected" && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              保護モードのため他マップからの被リンクは確認できません
            </p>
          )}
          {result.unreadableMaps.length > 0 && (
            <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              一部のマップを読み取れなかったため、すべての被リンクを表示できていません
            </p>
          )}
          {result.items.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              このノードへの被リンクはありません
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {result.items.map((item) => {
                const scopeLabel =
                  item.matchScope === "node" ? "このノードへ" : "このマップ全体へ";
                return (
                  <li key={`${item.sourceMapId}:${item.sourceNodeId}:${item.matchScope}`}>
                    <button
                      type="button"
                      onClick={() => onNavigateToMapTarget(item.sourceMapId, item.sourceNodeId)}
                      className="flex w-full flex-col gap-0.5 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-left transition-colors hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-700/60"
                    >
                      <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {item.sourceMapName}
                      </span>
                      <span className="break-words text-sm text-zinc-800 dark:text-zinc-100">
                        {item.sourceNodeLabel}
                      </span>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {scopeLabel}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
