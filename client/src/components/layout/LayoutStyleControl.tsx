import type { LayoutStyle } from "@/types/layoutStyle";

type LayoutStyleControlProps = {
  layoutStyle: LayoutStyle | undefined;
  disabled: boolean;
  onChange: (style: LayoutStyle) => void;
};

const MANUAL_OR_BLOCKED_TOOLTIP =
  "レイアウト様式は自動配置モードでのみ変更できます。手動配置・保護・競合中は設定だけ保持します。";

const styleOptions: ReadonlyArray<{ style: LayoutStyle; label: string }> = [
  { style: "orthogonal", label: "直交" },
  { style: "radial", label: "放射" },
];

const baseButtonClassName = "px-3 py-1 text-sm transition-colors";
const selectedButtonClassName = "bg-blue-600 text-white";
const idleButtonClassName =
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";
const disabledButtonClassName = "cursor-not-allowed opacity-50";

export function LayoutStyleControl({
  layoutStyle,
  disabled,
  onChange,
}: LayoutStyleControlProps) {
  const selected: LayoutStyle = layoutStyle ?? "orthogonal";

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      title={disabled ? MANUAL_OR_BLOCKED_TOOLTIP : undefined}
    >
      <span className="text-sm text-zinc-600 dark:text-zinc-400">レイアウト様式</span>
      <div
        className="flex shrink-0 overflow-hidden rounded-md"
        role="group"
        aria-label="レイアウト様式"
        aria-disabled={disabled}
      >
        {styleOptions.map(({ style, label }) => {
          const isSelected = selected === style;
          const stateClassName = isSelected
            ? selectedButtonClassName
            : idleButtonClassName;

          return (
            <button
              key={style}
              type="button"
              disabled={disabled}
              aria-pressed={isSelected}
              aria-label={label}
              className={`${baseButtonClassName} ${stateClassName} ${disabled ? disabledButtonClassName : ""}`}
              onClick={() => onChange(style)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
