import type { HeaderControlDisabledReason } from "@/domain/map/mapHeaderLayoutControlTypes";
import type { TreeDirection } from "@/types/treeDirection";

type TreeDirectionControlProps = {
  treeDirection: TreeDirection | undefined;
  /** 親／domain が確定した disabled。省略時は操作可能 */
  disabled?: boolean;
  /** disabled 理由。ツールチップ表示の正本（推測しない） */
  disabledReason?: HeaderControlDisabledReason;
  onChange: (direction: TreeDirection) => void;
};

const MANUAL_MODE_TOOLTIP =
  "ツリー方向は自動配置モードでのみ変更できます。手動配置では設定だけ保持し、座標は変わりません。";

const RADIAL_MODE_TOOLTIP =
  "放射レイアウト中はツリー方向を変更できません。直交に戻すと再び使えます。";

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

function tooltipForReason(reason: HeaderControlDisabledReason | undefined): string | undefined {
  if (reason === "manual") return MANUAL_MODE_TOOLTIP;
  if (reason === "radial") return RADIAL_MODE_TOOLTIP;
  return undefined;
}

export function TreeDirectionControl({
  treeDirection,
  disabled = false,
  disabledReason = null,
  onChange,
}: TreeDirectionControlProps) {
  const selected = treeDirection ?? "lr";
  const tooltip = disabled ? tooltipForReason(disabledReason) : undefined;

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      title={tooltip}
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
