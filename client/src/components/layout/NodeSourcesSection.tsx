"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { toSafeLinkHref } from "@/domain/nodes/nodeLink";
import {
  NODE_SOURCES_MAX_COUNT,
  formatNodeSourceFailure,
  type AddNodeSourceOutcome,
  type NodeSourceInput,
} from "@/domain/nodes/nodeSource";
import type { Node, NodeSource } from "@/types/node";

type NodeSourcesSectionProps = {
  // 対象のノード（主選択）。未選択のときは null
  node: Pick<Node, "id" | "label" | "sources"> | null;
  // 文書の世代（useNodes の documentRevision）。変わったら入力欄の下書きとエラーを消す
  documentRevision: number;
  onAddSource: (id: number, input: NodeSourceInput) => AddNodeSourceOutcome;
  onRemoveSource: (id: number, index: number) => boolean;
};

const NO_SOURCES: readonly NodeSource[] = [];

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";
const inputClassName = "min-w-0 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100";

// 右パネルの「出典」節。一覧（開く・削除）と追加のフォームを持ち、入力欄の下書き・エラーの文言・フォーカスを受け持つ。
// NodeDetailPanel が対象のノードの ID だけを key にして作り直す（別のノードの下書きを引き継がない）。
// documentRevision（Undo / Redo・JSON 読み込み・マップの切り替えで増える）では作り直さず、描画中に前回の世代と比べて
// 下書きとエラーだけを消す（L-588）。作り直すと、削除ボタンにあったフォーカスが body へ落ち、続けて押した
// Delete などのキーがマップの操作になるため（L-155）。入力欄とボタンは disabled にしない（L-155・L-157）
export function NodeSourcesSection({
  node,
  documentRevision,
  onAddSource,
  onRemoveSource,
}: NodeSourcesSectionProps) {
  const headingId = useId();
  const titleInputId = useId();
  const pageInputId = useId();
  const urlInputId = useId();
  const countId = useId();
  const errorId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [page, setPage] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seenRevision, setSeenRevision] = useState(documentRevision);

  // 文書が入れ替わったら、古い下書きとエラーを新しい文書へ残さない（レンダー中に調整し、effect 内の同期 setState を避ける）
  if (documentRevision !== seenRevision) {
    setSeenRevision(documentRevision);
    setTitle("");
    setPage("");
    setUrl("");
    setError(null);
  }
  const sources = node?.sources ?? NO_SOURCES;
  const isAtLimit = sources.length >= NODE_SOURCES_MAX_COUNT;

  // 確定は送信の 1 か所だけ（type="url" のブラウザの検証は noValidate で止め、独自の文言を出す。L-057・L-161）
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (node === null || title.trim() === "") return;
    const outcome = onAddSource(node.id, { title, page, url });
    if (outcome.ok) {
      setTitle("");
      setPage("");
      setUrl("");
      setError(null);
      titleInputRef.current?.focus();
      return;
    }
    if (outcome.reason !== "empty-title") setError(formatNodeSourceFailure(outcome.reason));
  };

  // IME の変換中の Enter（L-474）と、押し続けの Enter（L-408）では送信しない
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) event.preventDefault();
  };

  // 押した削除ボタンは消えるので、フォーカスを常に有効なタイトル入力欄へ移す（L-155）
  const handleRemove = (index: number) => {
    if (node === null) return;
    if (onRemoveSource(node.id, index)) setError(null);
    titleInputRef.current?.focus();
  };

  const clearErrorOnChange = () => {
    if (error !== null) setError(null);
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">出典</h2>
      {node === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
            <p
              className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
              title={node.label || undefined}
            >
              {getNodeDisplayLabel(node.label)}
            </p>
          </div>
          {sources.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">出典はありません</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sources.map((item, index) => {
                const href = item.url === undefined ? null : toSafeLinkHref(item.url);
                return (
                  <li key={`${index}:${item.title}:${item.page ?? ""}:${item.url ?? ""}`} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                      <span className="break-words text-sm text-zinc-800 dark:text-zinc-100" title={item.title}>
                        {item.title}
                      </span>
                      {item.page !== undefined && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{`p. ${item.page}`}</span>
                      )}
                      {item.url !== undefined && (
                        href === null ? (
                          <span className="truncate text-sm text-zinc-800 dark:text-zinc-100" title={item.url}>
                            {item.url}
                          </span>
                        ) : (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={item.url}
                            className="truncate text-sm text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300"
                          >
                            {item.url}
                          </a>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`出典を削除: ${[
                        item.title,
                        item.page !== undefined ? `p. ${item.page}` : null,
                        item.url !== undefined ? item.url : null,
                      ]
                        .filter((part): part is string => part !== null)
                        .join(" ")}`}
                      className={buttonClassName}
                      onClick={() => handleRemove(index)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
              {`${sources.length} / ${NODE_SOURCES_MAX_COUNT} 件`}
            </p>
            {/* ライブリージョンは常に描画し、中身だけを替える */}
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              {isAtLimit ? `上限（${NODE_SOURCES_MAX_COUNT} 件）に達しました` : ""}
            </p>
          </div>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={titleInputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">タイトル</label>
              <input
                ref={titleInputRef}
                id={titleInputId}
                type="text"
                autoComplete="off"
                value={title}
                aria-invalid={error === null ? undefined : "true"}
                aria-describedby={error === null ? countId : `${countId} ${errorId}`}
                onChange={(event) => {
                  setTitle(event.target.value);
                  clearErrorOnChange();
                }}
                onKeyDown={handleKeyDown}
                className={inputClassName}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={pageInputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">ページ</label>
              <input
                id={pageInputId}
                type="text"
                autoComplete="off"
                value={page}
                onChange={(event) => {
                  setPage(event.target.value);
                  clearErrorOnChange();
                }}
                onKeyDown={handleKeyDown}
                className={inputClassName}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={urlInputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">URL</label>
              <div className="flex gap-2">
                <input
                  id={urlInputId}
                  type="url"
                  autoComplete="off"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    clearErrorOnChange();
                  }}
                  onKeyDown={handleKeyDown}
                  className={inputClassName}
                />
                <button type="submit" className={buttonClassName}>追加</button>
              </div>
            </div>
            {error !== null && (
              <p id={errorId} role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>
            )}
          </form>
        </>
      )}
    </section>
  );
}
