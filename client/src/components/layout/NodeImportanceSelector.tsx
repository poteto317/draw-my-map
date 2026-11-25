import { NODE_IMPORTANCE_LABELS } from "@/domain/nodes/nodeImportance";
import type { NodeImportance } from "@/types/nodeImportance";

type NodeImportanceSelectorProps = {
  importance: NodeImportance | null;
  disabled: boolean;
  // 一括編集の対象件数。2件以上で件数を表示する
  selectionCount: number;
  // 対象の重要度が揃っていないとき true
  mixed: boolean;
  onChange: (importance: NodeImportance) => void;
};

const importanceOptions: ReadonlyArray<{
  importance: NodeImportance;
  label: string;
}> = (["high", "medium", "low"] as const).map((importance) => ({
  importance,
  label: NODE_IMPORTANCE_LABELS[importance],
}));

const baseButtonClassName = "px-3 py-1 text-sm transition-colors";
const selectedButtonClassName = "bg-blue-600 text-white";
const idleButtonClassName =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeImportanceSelector({
  importance,
  disabled,
  selectionCount,
  mixed,
  onChange,
}: NodeImportanceSelectorProps) {
  const isMultiple = selectionCount >= 2;
  // 画面の件数表示とグループ名で同じ文言を使い、混在をスクリーンリーダーにも伝える
  const countText = isMultiple
    ? `${selectionCount}件選択中${mixed ? "・混在" : ""}`
    : "";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">重要度</span>
      <div
        className="flex overflow-hidden rounded-md"
        role="group"
        aria-label={isMultiple ? `重要度（${countText}）` : "重要度"}
      >
        {importanceOptions.map(({ importance: optionImportance, label }) => {
          const selected = importance === optionImportance;

          return (
            <button
              key={optionImportance}
              type="button"
              aria-label={`重要度 ${label}`}
              aria-pressed={selected}
              disabled={disabled}
              className={`${baseButtonClassName} ${selected ? selectedButtonClassName : idleButtonClassName}`}
              onClick={() => onChange(optionImportance)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {/* 件数の変化を読み上げるため、ライブリージョンは常に描画して中身だけを替える */}
      <span className="text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
        {countText}
      </span>
    </div>
  );
}
