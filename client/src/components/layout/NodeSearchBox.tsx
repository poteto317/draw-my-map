"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { resolveNodeSearchKeyAction } from "@/components/layout/nodeSearchKeyAction";
import type { NodeSearchListItem } from "@/types/nodeSearch";

type NodeSearchBoxProps = {
  query: string;
  onQueryChange: (query: string) => void;
  hasQuery: boolean;
  matches: readonly NodeSearchListItem[];
  total: number;
  onSelectResult: (nodeId: number) => void;
};

function optionName(match: NodeSearchListItem): string {
  const relation = match.parentLabel === null ? "ルート" : `親: ${match.parentLabel}`;
  return `${match.label}（${relation}${match.hidden ? "、非表示" : ""}）`;
}

export function NodeSearchBox({
  query,
  onQueryChange,
  hasQuery,
  matches,
  total,
  onSelectResult,
}: NodeSearchBoxProps) {
  const idPrefix = useId();
  const listboxId = `${idPrefix}-node-search-results`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(hasQuery);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const selectedMatch = matches.find((match) => match.nodeId === selectedNodeId) ?? matches[0];
  const effectiveSelectedNodeId = selectedMatch?.nodeId ?? null;
  const showResults = isOpen && hasQuery;
  const activeDescendant = showResults && effectiveSelectedNodeId !== null
    ? `${idPrefix}-node-${effectiveSelectedNodeId}`
    : undefined;

  useEffect(() => {
    if (!activeDescendant) return;
    const selectedElement = document.getElementById(activeDescendant);
    selectedElement?.scrollIntoView?.({ block: "nearest" });
  }, [activeDescendant]);

  const moveSelection = (offset: number) => {
    const currentIndex = matches.findIndex(
      (match) => match.nodeId === effectiveSelectedNodeId,
    );
    const nextIndex = (currentIndex + offset + matches.length) % matches.length;
    setSelectedNodeId(matches[nextIndex].nodeId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const action = resolveNodeSearchKeyAction({
      key: event.key,
      isComposing: event.nativeEvent.isComposing,
      keyCode: event.keyCode,
      repeat: event.repeat,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      isOpen: showResults,
      hasQuery,
      hasResults: matches.length > 0,
    });

    if (action === null) return;
    event.preventDefault();

    if (action === "open") setIsOpen(true);
    if (action === "next") moveSelection(1);
    if (action === "previous") moveSelection(-1);
    if (action === "select" && effectiveSelectedNodeId !== null) {
      onSelectResult(effectiveSelectedNodeId);
    }
    if (action === "close") setIsOpen(false);
    if (action === "clear") onQueryChange("");
  };

  const handleResultMouseDown = (event: MouseEvent) => {
    event.preventDefault();
  };

  const selectResult = (nodeId: number) => {
    setSelectedNodeId(nodeId);
    onSelectResult(nodeId);
    inputRef.current?.focus();
  };

  const status = matches.length === 0
    ? "一致するノードはありません。"
    : total > matches.length
      ? `全${total}件中${matches.length}件を表示しています。キーワードを絞り込んでください。`
      : `${total}件`;

  return (
    <div className="relative w-full max-w-md">
      <label className="sr-only" htmlFor={`${idPrefix}-node-search-input`}>
        ノードを検索
      </label>
      <input
        ref={inputRef}
        id={`${idPrefix}-node-search-input`}
        type="text"
        role="combobox"
        value={query}
        aria-label="ノードを検索"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={showResults}
        aria-activedescendant={activeDescendant}
        placeholder="ノードを検索"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        onChange={(event) => {
          onQueryChange(event.target.value);
          setIsOpen(event.target.value.trim() !== "");
        }}
        onFocus={() => {
          if (hasQuery) setIsOpen(true);
        }}
        onBlur={() => setIsOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {showResults && (
        <div
          className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
          onMouseDown={handleResultMouseDown}
        >
          <div
            id={listboxId}
            role="listbox"
            aria-label="ノード検索結果"
            className="max-h-80 overflow-y-auto p-1"
          >
            {matches.map((match) => {
              const selected = match.nodeId === effectiveSelectedNodeId;
              return (
                <button
                  key={match.nodeId}
                  id={`${idPrefix}-node-${match.nodeId}`}
                  type="button"
                  role="option"
                  aria-label={optionName(match)}
                  aria-selected={selected}
                  tabIndex={-1}
                  className={`block w-full rounded px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-blue-600 ${selected ? "bg-blue-100 dark:bg-blue-900" : "hover:bg-zinc-100 dark:hover:bg-zinc-700"}`}
                  onClick={() => selectResult(match.nodeId)}
                >
                  <span className="block truncate text-sm text-zinc-900 dark:text-zinc-100" title={match.label}>
                    {match.label}
                  </span>
                  <span className="block text-xs text-zinc-600 dark:text-zinc-400">
                    {match.parentLabel === null ? "ルート" : `親: ${match.parentLabel}`}
                    {match.hidden && " · 非表示"}
                  </span>
                </button>
              );
            })}
          </div>
          <div
            role="status"
            className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            {status}
          </div>
        </div>
      )}
    </div>
  );
}
