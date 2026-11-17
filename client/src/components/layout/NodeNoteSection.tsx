import { useId } from "react";
import { getNodeDisplayLabel } from "@/domain/nodes/nodeDisplayLabel";
import { NODE_NOTE_MAX_LENGTH, formatNodeNoteLength } from "@/domain/nodes/nodeNote";
import type { NodeNoteEditing } from "@/hooks/useNodeNoteEditing";

type NodeNoteSectionProps = {
  // 対象ノードのラベル。未選択のときは null
  targetLabel: string | null;
  // 選択件数（MapEditor の importanceTargetIds の件数。アウトライン表示では主選択だけなので最大 1）
  selectionCount: number;
  // 未選択のときは null（テキスト欄を無効にする）
  editing: NodeNoteEditing | null;
};

// 詳細メモの表示だけを受け持つ（状態と副作用は持たない。ID の生成にだけ useId を使う）。値とハンドラは NodeNoteEditor が渡す
export function NodeNoteSection({ targetLabel, selectionCount, editing }: NodeNoteSectionProps) {
  const headingId = useId();
  const textareaId = useId();
  const countId = useId();
  const length = editing?.length ?? 0;
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
      {/* 見出しと同じ文言なので、ラベルは読み上げ用にだけ置く */}
      <label htmlFor={textareaId} className="sr-only">詳細メモ</label>
      <textarea
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
