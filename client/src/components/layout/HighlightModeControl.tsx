import { useId } from "react";
import type { HighlightMode } from "@/domain/nodes/highlightSets";

type HighlightModeControlProps = {
  mode: HighlightMode;
  onChange: (mode: HighlightMode) => void;
};

const MODE_OPTIONS: ReadonlyArray<{ value: HighlightMode; label: string }> = [
  { value: "off", label: "オフ" },
  { value: "search", label: "検索ヒット" },
  { value: "selection", label: "選択枝" },
];

export function HighlightModeControl({ mode, onChange }: HighlightModeControlProps) {
  const selectId = useId();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <label htmlFor={selectId} className="text-sm text-zinc-600 dark:text-zinc-400">
        一時強調
      </label>
      <select
        id={selectId}
        aria-label="一時強調"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
        value={mode}
        onChange={(event) => {
          onChange(event.target.value as HighlightMode);
        }}
      >
        {MODE_OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
