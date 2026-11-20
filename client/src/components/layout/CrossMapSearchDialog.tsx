"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { handleDialogClickCapture } from "@/components/layout/dialogClickCapture";
import { preventRepeatedActivationClick } from "@/components/layout/repeatedEnterClick";
import { useDialogFocusTrap } from "@/components/layout/useDialogFocusTrap";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import {
  MAX_CROSS_MAP_SEARCH_RESULTS,
  searchCrossMapCorpus,
  type CrossMapSearchMatchField,
} from "@/domain/search/crossMapSearch";
import { normalizeNodeSearchQuery } from "@/domain/search/nodeLabelSearch";

export type CrossMapSearchDialogProps = {
  corpus: CrossMapCorpus;
  storageMode: "persistent" | "protected";
  onSelectMatch: (targetMapId: string, targetNodeId: number) => void;
  onClose: () => void;
  onMouseClick: () => void;
};

function isComposingKey(event: KeyboardEvent<HTMLInputElement>): boolean {
  return event.nativeEvent.isComposing || event.keyCode === 229;
}

function matchFieldBadgeLabel(field: CrossMapSearchMatchField): string {
  switch (field) {
    case "label":
      return "ラベル";
    case "note":
      return "メモ";
    case "tag":
      return "タグ";
    case "link":
      return "リンク";
    case "source":
      return "出典";
    default: {
      const unreachable: never = field;
      return unreachable;
    }
  }
}

function buildStatusMessage(
  trimmedQuery: string,
  hasQuery: boolean,
  total: number,
  shownCount: number,
  matchedMapCount: number,
): string {
  if (!hasQuery) {
    return "キーワードを入力すると全マップからノードを検索できます";
  }
  if (total === 0) {
    return `「${trimmedQuery}」に一致するノードはありません`;
  }
  const base = `「${trimmedQuery}」に ${total} 件一致（${matchedMapCount} マップ）`;
  return total > shownCount
    ? `${base}（先頭 ${MAX_CROSS_MAP_SEARCH_RESULTS} 件を表示）`
    : base;
}

export function CrossMapSearchDialog({
  corpus,
  storageMode,
  onSelectMatch,
  onClose,
  onMouseClick,
}: CrossMapSearchDialogProps) {
  const idPrefix = useId();
  const headingId = `${idPrefix}-heading`;
  const inputId = `${idPrefix}-input`;
  const listboxId = `${idPrefix}-listbox`;
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useDialogFocusTrap({ dialogRef, overlayRef, onEscape: onClose });

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const result = useMemo(() => searchCrossMapCorpus(corpus, query), [corpus, query]);
  const trimmedQuery = query.trim();
  const hasQuery = normalizeNodeSearchQuery(query) !== "";

  const effectiveActiveIndex =
    result.matches.length === 0
      ? -1
      : activeIndex >= 0 && activeIndex < result.matches.length
        ? activeIndex
        : 0;

  // 結果件数が減って範囲外になったときは state 自体を 0 に正規化し、再拡大時の古い位置復活を防ぐ
  if (result.matches.length === 0) {
    if (activeIndex !== 0) setActiveIndex(0);
  } else if (activeIndex < 0 || activeIndex >= result.matches.length) {
    setActiveIndex(0);
  }

  useEffect(() => {
    if (effectiveActiveIndex < 0) return;
    const activeElement = document.getElementById(`${idPrefix}-match-${effectiveActiveIndex}`);
    activeElement?.scrollIntoView?.({ block: "nearest" });
  }, [effectiveActiveIndex, idPrefix, result.matches]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingKey(event) || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }

    if (event.key === "ArrowDown") {
      if (result.matches.length === 0) return;
      event.preventDefault();
      setActiveIndex((effectiveActiveIndex + 1) % result.matches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (result.matches.length === 0) return;
      event.preventDefault();
      setActiveIndex(
        (effectiveActiveIndex - 1 + result.matches.length) % result.matches.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.repeat || effectiveActiveIndex < 0) return;
      const match = result.matches[effectiveActiveIndex];
      onSelectMatch(match.mapId, match.nodeId);
    }
  };

  const optionId = (index: number) => `${idPrefix}-match-${index}`;
  const activeDescendant = effectiveActiveIndex >= 0 ? optionId(effectiveActiveIndex) : undefined;

  const statusText = buildStatusMessage(
    trimmedQuery,
    hasQuery,
    result.total,
    result.matches.length,
    result.matchedMapCount,
  );

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
          全マップ検索
        </h2>

        {storageMode === "protected" && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
            保護モードのため現在開いているマップのみ検索しています
          </p>
        )}

        {result.unreadableMaps.length > 0 && (
          <p
            role="alert"
            className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
          >
            {`一部のマップを読み取れなかったため検索対象に含まれていません: ${result.unreadableMaps
              .map((info) => info.mapName)
              .join("、")}`}
          </p>
        )}

        <div className="flex flex-col gap-1">
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            全マップを検索
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            role="combobox"
            value={query}
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={result.matches.length > 0}
            aria-activedescendant={activeDescendant}
            placeholder="キーワードを入力（ラベル・メモ・タグ・リンク・出典）"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* ライブリージョンは常に描画し、中身だけを替える */}
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {statusText}
        </p>

        {/* NodeSearchBox と同じく、入力欄（combobox）にフォーカスを残したまま aria-activedescendant で候補を伝える。
            候補はマウスでクリックできるボタンだが、Tab の移動先には含めない */}
        {result.matches.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="検索結果"
            className="flex max-h-80 shrink-0 flex-col gap-1.5 overflow-y-auto"
          >
            {result.matches.map((match, index) => {
              const isActive = index === effectiveActiveIndex;
              return (
                <button
                  key={`${match.mapId}:${match.nodeId}`}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  tabIndex={-1}
                  onClick={() => onSelectMatch(match.mapId, match.nodeId)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onKeyDown={preventRepeatedActivationClick}
                  className={`flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                    isActive
                      ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/60"
                      : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:bg-zinc-700/60"
                  }`}
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-medium text-zinc-600 dark:text-zinc-300">
                      {match.mapName}
                    </span>
                    {match.isCurrentMap && (
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/70 dark:text-blue-200">
                        現在
                      </span>
                    )}
                    <span className="rounded bg-zinc-200 px-1.5 py-0.5 font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                      {matchFieldBadgeLabel(match.matchedBy)}
                    </span>
                  </span>
                  <span className="break-words [overflow-wrap:anywhere] text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {match.label}
                  </span>
                  {match.parentLabel !== null && (
                    <span className="break-words [overflow-wrap:anywhere] text-xs text-zinc-500 dark:text-zinc-400">
                      {`親: ${match.parentLabel}`}
                    </span>
                  )}
                  {match.snippet !== undefined && (
                    <span className="break-words [overflow-wrap:anywhere] text-xs text-zinc-600 dark:text-zinc-300">
                      {match.snippet}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
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
