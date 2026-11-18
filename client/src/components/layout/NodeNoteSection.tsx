import { useId, useRef, type KeyboardEvent } from "react";
import { NodeNoteMarkdown } from "@/components/layout/NodeNoteMarkdown";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { NODE_NOTE_MAX_LENGTH, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import type { NodeNoteEditing } from "@/hooks/useNodeNoteEditing";

export type NodeNoteViewMode = "edit" | "preview";

type NodeNoteSectionProps = {
  // 対象ノードのラベル。未選択のときは null
  targetLabel: string | null;
  // 選択件数（MapEditor の importanceTargetIds の件数。アウトライン表示では主選択だけなので最大 1）
  selectionCount: number;
  // 未選択のときは null（テキスト欄を無効にする）
  editing: NodeNoteEditing | null;
  mode?: NodeNoteViewMode;
  onModeChange?: (mode: NodeNoteViewMode) => void;
};

const TAB_BASE_CLASS =
  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const ACTIVE_TAB_CLASS = `${TAB_BASE_CLASS} bg-blue-600 text-white`;
const INACTIVE_TAB_CLASS = `${TAB_BASE_CLASS} bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600`;

// 詳細メモの表示だけを受け持つ（状態と副作用は持たない。ID と要素参照にだけ useId / useRef を使う）。値とハンドラは NodeNoteEditor が渡す
export function NodeNoteSection({
  targetLabel,
  selectionCount,
  editing,
  mode = "edit",
  onModeChange,
}: NodeNoteSectionProps) {
  const headingId = useId();
  const textareaId = useId();
  const countId = useId();
  const editTabId = useId();
  const previewTabId = useId();
  const editPanelId = useId();
  const previewPanelId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTabRef = useRef<HTMLButtonElement>(null);
  const previewTabRef = useRef<HTMLButtonElement>(null);

  const length = editing?.length ?? 0;
  const activeMode: NodeNoteViewMode = editing === null ? "edit" : mode;

  // プレビューへ切り替える際、textarea にフォーカスが残っていれば先に blur して未反映の下書きを確定させる（L-473）
  const selectMode = (nextMode: NodeNoteViewMode) => {
    if (nextMode === "preview" && textareaRef.current !== null && document.activeElement === textareaRef.current) {
      textareaRef.current.blur();
    }
    if (nextMode !== activeMode) {
      onModeChange?.(nextMode);
    }
  };

  const handleTabListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    let nextMode: NodeNoteViewMode | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      nextMode = activeMode === "edit" ? "preview" : "edit";
    } else if (event.key === "Home") {
      nextMode = "edit";
    } else if (event.key === "End") {
      nextMode = "preview";
    }
    if (nextMode === null) return;
    event.preventDefault();
    selectMode(nextMode);
    const targetTab = nextMode === "edit" ? editTabRef.current : previewTabRef.current;
    targetTab?.focus();
  };

  const textarea = (
    <>
      {/* 見出しと同じ文言なので、ラベルは読み上げ用にだけ置く */}
      <label htmlFor={textareaId} className="sr-only">詳細メモ</label>
      <textarea
        ref={textareaRef}
        id={textareaId}
        rows={8}
        maxLength={NODE_NOTE_MAX_LENGTH}
        disabled={editing === null}
        placeholder="このノードの詳細な説明を書けます"
        value={editing?.value ?? ""}
        aria-describedby={countId}
        onFocus={editing?.onFocus}
        onChange={(event) => editing?.onChange(event.target.value)}
        onBlur={editing?.onBlur}
        onKeyDown={editing?.onKeyDown}
        onCompositionStart={editing?.onCompositionStart}
        onCompositionEnd={editing?.onCompositionEnd}
        className="w-full resize-y rounded-md border border-zinc-300 bg-white p-2 text-sm text-zinc-900 placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-800"
      />
    </>
  );

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">詳細メモ</h2>
      {targetLabel === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">ノードを選択してください</p>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">対象ノード</span>
          <p
            className="line-clamp-3 break-words text-sm text-zinc-800 dark:text-zinc-100"
            title={targetLabel || undefined}
          >
            {getNodeDisplayLabel(targetLabel)}
          </p>
        </div>
      )}
      {selectionCount >= 2 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {`${selectionCount} 件選択中。主選択のノードのメモを編集します`}
        </p>
      )}
      {editing === null ? (
        textarea
      ) : (
        <>
          <div
            role="tablist"
            aria-label="詳細メモの表示切替"
            onKeyDown={handleTabListKeyDown}
            className="flex gap-1"
          >
            <button
              ref={editTabRef}
              id={editTabId}
              type="button"
              role="tab"
              aria-selected={activeMode === "edit"}
              aria-controls={editPanelId}
              tabIndex={activeMode === "edit" ? 0 : -1}
              onClick={() => selectMode("edit")}
              className={activeMode === "edit" ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}
            >
              編集
            </button>
            <button
              ref={previewTabRef}
              id={previewTabId}
              type="button"
              role="tab"
              aria-selected={activeMode === "preview"}
              aria-controls={previewPanelId}
              tabIndex={activeMode === "preview" ? 0 : -1}
              onClick={() => selectMode("preview")}
              className={activeMode === "preview" ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}
            >
              プレビュー
            </button>
          </div>
          <div
            id={editPanelId}
            role="tabpanel"
            aria-labelledby={editTabId}
            hidden={activeMode !== "edit"}
          >
            {textarea}
          </div>
          <div
            id={previewPanelId}
            role="tabpanel"
            aria-labelledby={previewTabId}
            hidden={activeMode !== "preview"}
            className="min-h-40 rounded-md border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {activeMode === "preview" ? <NodeNoteMarkdown markdown={editing.value} /> : null}
          </div>
        </>
      )}
      <p id={countId} className="text-xs text-zinc-500 dark:text-zinc-400">
        {`${formatNodeNoteLength(length)} / ${formatNodeNoteLength(NODE_NOTE_MAX_LENGTH)} 文字`}
      </p>
      {/* ライブリージョンは常に描画し、中身だけを替える */}
      <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
        {editing?.isAtLimit === true ? "上限に達しました" : ""}
      </p>
    </section>
  );
}
