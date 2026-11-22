import { useId } from "react";

type DepthLimitControlProps = {
  maxDepth: number | null;
  onChange: (maxDepth: number | null) => void;
};

const DEPTH_OPTIONS: ReadonlyArray<{ value: number | null; label: string }> = [
  { value: null, label: "無制限" },
  { value: 0, label: "0（ルート）" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 3, label: "3" },
  { value: 4, label: "4" },
  { value: 5, label: "5" },
];

export function DepthLimitControl({ maxDepth, onChange }: DepthLimitControlProps) {
  const selectId = useId();
  const selectValue = maxDepth === null ? "unlimited" : String(maxDepth);

  return (
    <div className="flex shrink-0 items-center gap-2">
      <label htmlFor={selectId} className="text-sm text-zinc-600 dark:text-zinc-400">
        深さ
      </label>
      <select
        id={selectId}
        aria-label="深さ"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200"
        value={selectValue}
        onChange={(event) => {
          const { value } = event.target;
          onChange(value === "unlimited" ? null : Number(value));
        }}
      >
        {DEPTH_OPTIONS.map(({ value, label }) => (
          <option
            key={value === null ? "unlimited" : value}
            value={value === null ? "unlimited" : String(value)}
          >
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}
