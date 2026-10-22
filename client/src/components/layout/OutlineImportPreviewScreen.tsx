import { useId, type KeyboardEvent, type MouseEvent, type Ref } from "react";
import { OutlinePreviewTree } from "@/components/layout/OutlinePreviewTree";
import {
  formatOutlinePreviewSummary,
  formatOutlinePreviewTruncation,
  formatOutlineWarning,
  OUTLINE_ROOT_TARGET_LABEL,
} from "@/domain/outline/outlineMessages";
import type { ParsedOutline } from "@/domain/outline/outlineParser";
import type { OutlinePreview } from "@/domain/outline/outlinePreview";
import type { OutlineImportTarget } from "@/hooks/useOutlineImport";

export type OutlineParentCandidate =
  | { kind: "none" } // 開いた時点で未選択
  | { kind: "found"; label: string } // getNodeDisplayLabel の値の先頭40コードポイント（MapEditor が resolveOutlineParentCandidate で作る）
  | { kind: "missing" }; // 控えた親が今のマップに無い

type OutlineImportPreviewScreenProps = {
  headingId: string; // 見出し「変換結果の確認」の id
  summaryId: string; // 要約の要素の id
  warningsId: string; // 警告の <ul> の id（警告が無くても空の要素を置く）
  outline: ParsedOutline;
  preview: OutlinePreview;
  parentCandidate: OutlineParentCandidate;
  target: OutlineImportTarget;
  onTargetChange: (target: OutlineImportTarget) => void;
  onSubmit: () => void;
  onBack: () => void;
  regionRef: Ref<HTMLDivElement>; // プレビューの領域（最初のフォーカス先）
};

const buttonClassName = "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200";

const radioClassName = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

// 「マップに追加」の押し続けの Enter・Space で、続けて追加しない（L-408）。ダブルクリックの続きは handleSubmitClick が無視する
function handleSubmitKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  if ((event.key === "Enter" || event.key === " ") && event.repeat) {
    event.preventDefault();
  }
}

function childTargetLabel(
  parentCandidate: Exclude<OutlineParentCandidate, { kind: "none" }>,
): string {
  switch (parentCandidate.kind) {
    case "found":
      return `選択中のノード「${parentCandidate.label}」の子として追加`;
    case "missing":
      return "選択していたノードの子として追加";
    default: {
      const unreachable: never = parentCandidate;
      throw new Error(
        `Unknown outline parent candidate: ${JSON.stringify(unreachable)}`,
      );
    }
  }
}

export function OutlineImportPreviewScreen({
  headingId,
  summaryId,
  warningsId,
  outline,
  preview,
  parentCandidate,
  target,
  onTargetChange,
  onSubmit,
  onBack,
  regionRef,
}: OutlineImportPreviewScreenProps) {
  const radioName = useId();
  const truncation = formatOutlinePreviewTruncation(preview);

  // ダブルクリックの続きの click（detail > 1）では、続けて追加しない（L-150）。
  // OutlineImportDialog のオーバーレイも detail > 1 の click を止めるが、二重の防御として残す
  const handleSubmitClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 1) return;
    onSubmit();
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 id={headingId} className="text-base font-semibold">
        変換結果の確認
      </h2>
      <p id={summaryId} className="text-sm">
        {formatOutlinePreviewSummary(outline)}
      </p>
      {/* 色だけに頼らず、文言の先頭に「注意: 」を付ける（L-400） */}
      <ul
        id={warningsId}
        className="flex flex-col gap-1 text-sm break-words text-amber-800 [overflow-wrap:anywhere] dark:text-amber-300"
      >
        {outline.warnings.map((warning) => (
          <li key={warning.kind}>注意: {formatOutlineWarning(warning)}</li>
        ))}
      </ul>
      <div
        ref={regionRef}
        role="region"
        aria-label="変換結果のプレビュー"
        tabIndex={0}
        className="max-h-[40vh] overflow-auto rounded-md border border-zinc-200 p-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-zinc-700"
      >
        <OutlinePreviewTree roots={preview.roots} />
      </div>
      {/* 一部だけを表示していることを明示する（L-160） */}
      {truncation !== null && <p className="text-sm">{truncation}</p>}
      {parentCandidate.kind === "none" ? (
        <p className="text-sm">新しいルートとして追加します。</p>
      ) : (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 font-medium">追加する位置</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={radioName}
              className={radioClassName}
              checked={target === "root"}
              onChange={() => onTargetChange("root")}
            />
            {OUTLINE_ROOT_TARGET_LABEL}
          </label>
          <label className="flex items-center gap-2 break-words [overflow-wrap:anywhere]">
            <input
              type="radio"
              name={radioName}
              className={radioClassName}
              checked={target === "child"}
              onChange={() => onTargetChange("child")}
            />
            {childTargetLabel(parentCandidate)}
          </label>
        </fieldset>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClassName} onClick={onBack}>
          戻る
        </button>
        <button
          type="button"
          className={buttonClassName}
          onClick={handleSubmitClick}
          onKeyDown={handleSubmitKeyDown}
        >
          マップに追加
        </button>
      </div>
    </div>
  );
}
