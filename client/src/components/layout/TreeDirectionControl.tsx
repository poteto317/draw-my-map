import type { NodeLayoutMode } from "@/types/nodeLayout";
import type { TreeDirection } from "@/types/treeDirection";

type TreeDirectionControlProps = {
  layoutMode: NodeLayoutMode;
  treeDirection: TreeDirection | undefined;
  onChange: (direction: TreeDirection) => void;
};

const MANUAL_MODE_TOOLTIP =
  "ツリー方向は自動配置モードでのみ変更できます。手動配置では設定だけ保持し、座標は変わりません。";

const treeDirectionOptions: ReadonlyArray<{
  direction: TreeDirection;
  label: string;
}> = [
  { direction: "lr", label: "左→右" },
  { direction: "tb", label: "上→下" },
];

const baseButtonClassName = "px-3 py-1 text-sm transition-colors";
const selectedButtonClassName = "bg-blue-600 text-white";
const idleButtonClassName =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
const disabledButtonClassName =
  "cursor-not-allowed opacity-50";

export function TreeDirectionControl({
  layoutMode,
  treeDirection,
  onChange,
}: TreeDirectionControlProps) {
  const selected = treeDirection ?? "lr";
  const disabled = layoutMode === "manual";

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      title={disabled ? MANUAL_MODE_TOOLTIP : undefined}
    >
      <span className="text-sm text-zinc-600 dark:text-zinc-400">ツリー方向</span>
      <div
        className="flex shrink-0 overflow-hidden rounded-md"
        role="group"
        aria-label="ツリー方向"
        aria-disabled={disabled}
      >
        {treeDirectionOptions.map(({ direction, label }) => {
          const isSelected = selected === direction;
          const stateClassName = isSelected
            ? selectedButtonClassName
            : idleButtonClassName;

          return (
            <button
              key={direction}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={label}
              className={`${baseButtonClassName} ${stateClassName} ${disabled ? disabledButtonClassName : ""}`}
              onClick={() => onChange(direction)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}