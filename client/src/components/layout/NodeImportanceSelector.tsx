import type { NodeImportance } from "@/types/nodeImportance";

type NodeImportanceSelectorProps = {
  importance: NodeImportance | null;
  disabled: boolean;
  onChange: (importance: NodeImportance) => void;
};

const importanceOptions: ReadonlyArray<{
  importance: NodeImportance;
  label: string;
}> = [
  { importance: "high", label: "高" },
  { importance: "medium", label: "中" },
  { importance: "low", label: "低" },
];

const baseButtonClassName = "px-3 py-1 text-sm transition-colors";
const selectedButtonClassName = "bg-blue-600 text-white";
const idleButtonClassName =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

export function NodeImportanceSelector({
  importance,
  disabled,
  onChange,
}: NodeImportanceSelectorProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">重要度</span>
      <div
        className="flex overflow-hidden rounded-md"
        role="group"
        aria-label="重要度"
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
    </div>
  );
}
