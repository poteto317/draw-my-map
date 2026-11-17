"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import {
  NODE_LINKS_MAX_COUNT,
  formatNodeLinkFailure,
  toSafeLinkHref,
  type AddNodeLinkOutcome,
} from "@/domain/nodes/nodeLink";
import type { Node } from "@/types/node";

type NodeLinksSectionProps = {
  // 対象のノード（主選択）。未選択のときは null
  node: Pick<Node, "id" | "label" | "links"> | null;
  // 文書の世代（useNodes の documentRevision）。変わったら入力欄の下書きとエラーを消す
  documentRevision: number;
  onAddLink: (id: number, input: string) => AddNodeLinkOutcome;
  onRemoveLink: (id: number, url: string) => boolean;
};

const NO_LINKS: readonly string[] = [];

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

// 右パネルの「リンク」節。一覧（開く・削除）と追加のフォームを持ち、入力欄の下書き・エラーの文言・フォーカスを受け持つ。
// NodeDetailPanel が対象のノードの ID だけを key にして作り直す（別のノードの下書きを引き継がない）。
// documentRevision（Undo / Redo・JSON 読み込み・マップの切り替えで増える）では作り直さず、描画中に前回の世代と比べて
// 下書きとエラーだけを消す（L-588）。作り直すと、リンクや削除ボタンにあったフォーカスが body へ落ち、続けて押した
// Delete などのキーがマップの操作になるため（L-155）。入力欄とボタンは disabled にしない（L-155・L-157）
export function NodeLinksSection({ node, documentRevision, onAddLink, onRemoveLink }: NodeLinksSectionProps) {
  const headingId = useId();
  const inputId = useId();
  const countId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [seenRevision, setSeenRevision] = useState(documentRevision);

  // 文書が入れ替わったら、古い下書きとエラーを新しい文書へ残さない（レンダー中に調整し、effect 内の同期 setState を避ける）
  if (documentRevision !== seenRevision) {
    setSeenRevision(documentRevision);
    setInput("");
    setError(null);
  }
  const links = node?.links ?? NO_LINKS;
  const isAtLimit = links.length >= NODE_LINKS_MAX_COUNT;

  // 確定は送信の 1 か所だけ（type="url" のブラウザの検証は noValidate で止め、独自の文言を出す。L-057・L-161）
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (node === null || input.trim() === "") return;
    const outcome = onAddLink(node.id, input);
    if (outcome.ok) {
      setInput("");
      setError(null);
      inputRef.current?.focus();
      return;
    }
    if (outcome.reason !== "empty") setError(formatNodeLinkFailure(outcome.reason));
  };

  // IME の変換中の Enter（L-474）と、押し続けの Enter（L-408）では送信しない
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    if (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat) event.preventDefault();
  };

  // 押した削除ボタンは消えるので、フォーカスを常に有効な入力欄へ移す（L-155）
  const handleRemove = (url: string) => {
    if (node === null) return;
    if (onRemoveLink(node.id, url)) setError(null);
    inputRef.current?.focus();
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">リンク</h2>
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
          {links.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">リンクはありません</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {links.map((url) => {
                const href = toSafeLinkHref(url);
                return (
                  <li key={url} className="flex items-center gap-2">
                    {href === null ? (
                      <span className="min-w-0 flex-1 truncate text-sm text-zinc-800 dark:text-zinc-100" title={url}>
                        {url}
                      </span>
                    ) : (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={url}
                        className="min-w-0 flex-1 truncate text-sm text-blue-700 underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-blue-300"
                      >
                        {url}
                      </a>
                    )}
                    <button
                      type="button"
                      aria-label={`リンクを削除: ${url}`}
                      className={buttonClassName}
                      onClick={() => handleRemove(url)}
                    >
                      削除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
              {`${links.length} / ${NODE_LINKS_MAX_COUNT} 件`}
            </p>
            {/* ライブリージョンは常に描画し、中身だけを替える */}
            <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
              {isAtLimit ? `上限（${NODE_LINKS_MAX_COUNT} 件）に達しました` : ""}
            </p>
          </div>
          <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-1">
            <label htmlFor={inputId} className="text-xs font-medium text-zinc-700 dark:text-zinc-300">URLを追加</label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id={inputId}
                type="url"
                autoComplete="off"
                value={input}
                aria-invalid={error === null ? undefined : "true"}
                aria-describedby={error === null ? countId : `${countId} ${errorId}`}
                onChange={(event) => {
                  setInput(event.target.value);
                  setError(null);
                }}
                onKeyDown={handleKeyDown}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <button type="submit" className={buttonClassName}>追加</button>
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
