import type {
  ResolutionFilterMode,
  ResolutionLevel,
} from "@/types/nodeResolution";
import { RESOLUTION_LEVEL_LABELS } from "@/config/resolutionLevelLabels";

type ResolutionFilterSelectorProps = {
  mode: ResolutionFilterMode;
  level: ResolutionLevel;
  onChange: (mode: ResolutionFilterMode) => void;
};

const resolutionOptions: ReadonlyArray<{
  mode: ResolutionFilterMode;
  label: string;
}> = [
  { mode: "auto", label: "自動" },
  { mode: "high", label: RESOLUTION_LEVEL_LABELS.high },
  { mode: "medium", label: RESOLUTION_LEVEL_LABELS.medium },
  { mode: "all", label: RESOLUTION_LEVEL_LABELS.all },
];

const baseButtonClassName = "px-3 py-1 text-sm transition-colors";
const selectedButtonClassName = "bg-blue-600 text-white";
const idleButtonClassName =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

export function ResolutionFilterSelector({
  mode,
  level,
  onChange,
}: ResolutionFilterSelectorProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">表示</span>
      <div
        className="flex overflow-hidden rounded-md"
        role="group"
        aria-label="表示"
      >
        {resolutionOptions.map(({ mode: optionMode, label }) => {
          const selected = mode === optionMode;

          return (
            <button
              key={optionMode}
              type="button"
              aria-label={`表示 ${label}`}
              aria-pressed={selected}
              className={`${baseButtonClassName} ${selected ? selectedButtonClassName : idleButtonClassName}`}
              onClick={() => onChange(optionMode)}
            >
              {label}
            </button>
          );
        })}
      </div>
      {mode === "auto" && (
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          現在: {RESOLUTION_LEVEL_LABELS[level]}
        </span>
      )}
    </div>
  );
}
