import type { NodeLayoutMode } from "@/types/nodeLayout";

type LayoutModeSelectorProps = {
  layoutMode: NodeLayoutMode;
  onLayoutModeChange: (mode: NodeLayoutMode) => void;
};

const layoutModeOptions: ReadonlyArray<{
  mode: NodeLayoutMode;
  label: string;
}> = [
  { mode: "manual", label: "手動配置" },
  { mode: "auto", label: "自動配置" },
];

const baseButtonClassName = "px-3 py-1 text-sm transition-colors";
const selectedButtonClassName = "bg-blue-600 text-white";
const idleButtonClassName =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

export function LayoutModeSelector({
  layoutMode,
  onLayoutModeChange,
}: LayoutModeSelectorProps) {
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded-md"
      role="group"
      aria-label="レイアウトモード"
    >
      {layoutModeOptions.map(({ mode, label }) => {
        const stateClassName = layoutMode === mode
          ? selectedButtonClassName
          : idleButtonClassName;

        return (
          <button
            key={mode}
            type="button"
            aria-pressed={layoutMode === mode}
            className={`${baseButtonClassName} ${stateClassName}`}
            onClick={() => onLayoutModeChange(mode)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
