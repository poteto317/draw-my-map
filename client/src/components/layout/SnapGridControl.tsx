"use client";

import { useEffect, useId, useState } from "react";
import { clampGridStep } from "@/domain/nodes/snapGrid";
import type { LayoutSnapPrefs } from "@/domain/nodes/snapGrid";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type SnapGridControlProps = {
  layoutMode: NodeLayoutMode;
  selectionActive: boolean;
  prefs: LayoutSnapPrefs;
  disabled?: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onShowGridChange: (showGrid: boolean) => void;
  onGridStepChange: (gridStep: number) => void;
};

const MANUAL_MODE_TOOLTIP =
  "グリッド・スナップは手動配置モードでのみ使えます。";

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

const fieldClassName =
  "w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200";

export function SnapGridControl({
  layoutMode,
  selectionActive,
  prefs,
  disabled = false,
  onEnabledChange,
  onShowGridChange,
  onGridStepChange,
}: SnapGridControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();

  // L-214: 選択消失で開状態を閉じる（Phase 24 オーバーレイ同期と同型）
  /* eslint-disable react-hooks/set-state-in-effect -- selectionActive の外部同期 */
  useEffect(() => {
    if (!selectionActive) setMenuOpen(false);
  }, [selectionActive]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (layoutMode !== "manual") return null;

  function commitGridStep(raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = clampGridStep(parsed);
    if (next === prefs.gridStep) return;
    onGridStepChange(next);
  }

  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        disabled={disabled}
        onClick={() => setMenuOpen((open) => !open)}
        title={MANUAL_MODE_TOOLTIP}
      >
        グリッド・スナップ
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="グリッド・スナップ"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-[14rem] flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
        >
          <label className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <span>スナップ</span>
            <input
              type="checkbox"
              aria-label="スナップ"
              checked={prefs.enabled}
              onChange={(event) => onEnabledChange(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <span>グリッド表示</span>
            <input
              type="checkbox"
              aria-label="グリッド表示"
              checked={prefs.showGrid}
              disabled={!prefs.enabled}
              onChange={(event) => onShowGridChange(event.target.checked)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <span>グリッド間隔</span>
            <input
              type="number"
              aria-label="グリッド間隔"
              className={fieldClassName}
              min={4}
              max={64}
              step={4}
              defaultValue={prefs.gridStep}
              onBlur={(event) => commitGridStep(event.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}