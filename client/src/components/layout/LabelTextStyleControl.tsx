"use client";

import { useEffect, useId, useState } from "react";
import { LABEL_FONT_SIZES, type LabelFontSize } from "@/types/labelFontSize";

export type LabelTextStyleControlProps = {
  visible: boolean; // マップ表示 && 主選択===1 && !outline && !protect
  disabled: boolean; // locked など
  fontSize: LabelFontSize;
  bold: boolean;
  underline: boolean;
  onFontSizeChange: (size: LabelFontSize) => void;
  onToggleBold: () => void;
  onToggleUnderline: () => void;
};

const FONT_SIZE_LABELS: Record<LabelFontSize, string> = {
  12: "小",
  14: "標準",
  18: "大",
  24: "特大",
};

const FONT_SIZE_OPTIONS: ReadonlyArray<{ size: LabelFontSize; label: string }> =
  LABEL_FONT_SIZES.map((size) => ({ size, label: FONT_SIZE_LABELS[size] }));

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

const toggleButtonClassName =
  "rounded-md px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:bg-blue-600 aria-pressed:text-white bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200";

const selectClassName =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200";

export function LabelTextStyleControl({
  visible,
  disabled,
  fontSize,
  bold,
  underline,
  onFontSizeChange,
  onToggleBold,
  onToggleUnderline,
}: LabelTextStyleControlProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const selectId = useId();

  // L-214: visible 消失で開状態を閉じる（LockControls と同型）
  /* eslint-disable react-hooks/set-state-in-effect -- visible の外部同期 */
  useEffect(() => {
    if (!visible) setPanelOpen(false);
  }, [visible]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!visible) return null;

  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        className={buttonClassName}
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? panelId : undefined}
        disabled={disabled}
        onClick={() => setPanelOpen((open) => !open)}
      >
        文字
      </button>
      {panelOpen && (
        <div
          id={panelId}
          role="group"
          aria-label="文字"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-[12rem] flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
        >
          <label
            htmlFor={selectId}
            className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200"
          >
            <span>サイズ</span>
            <select
              id={selectId}
              aria-label="文字サイズ"
              className={selectClassName}
              value={fontSize}
              disabled={disabled}
              onChange={(event) => {
                const next = Number(event.target.value);
                if ((LABEL_FONT_SIZES as readonly number[]).includes(next)) {
                  onFontSizeChange(next as LabelFontSize);
                }
              }}
            >
              {FONT_SIZE_OPTIONS.map(({ size, label }) => (
                <option key={size} value={size}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={toggleButtonClassName}
              aria-pressed={bold}
              disabled={disabled}
              onClick={onToggleBold}
            >
              太字
            </button>
            <button
              type="button"
              className={toggleButtonClassName}
              aria-pressed={underline}
              disabled={disabled}
              onClick={onToggleUnderline}
            >
              下線
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
