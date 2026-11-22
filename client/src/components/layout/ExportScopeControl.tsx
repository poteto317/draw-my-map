import type { ExportScope } from "@/domain/exportScope/exportScope";

type ExportScopeControlProps = {
  scope: ExportScope;
  onChange: (scope: ExportScope) => void;
  selectionAvailable: boolean;
};

const buttonClassName =
  "rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white bg-zinc-100 text-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-700 dark:text-zinc-200";

const OPTIONS: ReadonlyArray<{
  scope: ExportScope;
  label: string;
}> = [
  { scope: "all", label: "全件" },
  { scope: "visible", label: "表示中" },
  { scope: "selection", label: "選択" },
];

const SELECTION_UNAVAILABLE_REASON = "ノードを1つ選んでください";

export function ExportScopeControl({
  scope,
  onChange,
  selectionAvailable,
}: ExportScopeControlProps) {
  return (
    <div role="group" aria-label="書き出し対象" className="flex shrink-0 gap-2">
      {OPTIONS.map(({ scope: option, label }) => {
        const available = option !== "selection" || selectionAvailable;
        const accessibleName = available
          ? label
          : `${label}（${SELECTION_UNAVAILABLE_REASON}）`;
        return (
          <button
            key={option}
            type="button"
            className={buttonClassName}
            aria-pressed={scope === option}
            aria-label={accessibleName}
            title={available ? undefined : SELECTION_UNAVAILABLE_REASON}
            disabled={!available}
            onClick={() => onChange(option)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
