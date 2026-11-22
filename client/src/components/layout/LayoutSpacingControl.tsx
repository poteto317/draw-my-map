"use client";

import { useEffect, useId, useState } from "react";
import {
  clampLayoutSpacing,
  clampLayoutSpacingValue,
} from "@/components/layout/layoutSpacingClamp";
import { resolveLayoutSpacing } from "@/domain/nodes/resolveLayoutSpacing";
import type { LayoutSpacing } from "@/types/layoutSpacing";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type LayoutSpacingControlProps = {
  layoutMode: NodeLayoutMode;
  layoutSpacing: LayoutSpacing | undefined;
  selectionActive: boolean;
  onChange: (spacing: LayoutSpacing) => void;
};

const MANUAL_MODE_TOOLTIP =
  "手動配置では間隔の値だけ保存され、座標は変わりません。自動配置では変更に合わせて再配置されます。";

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

const fieldClassName =
  "w-20 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200";

export function LayoutSpacingControl({
  layoutMode,
  layoutSpacing,
  selectionActive,
  onChange,
}: LayoutSpacingControlProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const resolved = resolveLayoutSpacing({ layoutSpacing });
  const showManualTooltip = layoutMode === "manual";

  // L-214: 選択消失で開状態を閉じる（Phase 24 オーバーレイ同期と同型）
  /* eslint-disable react-hooks/set-state-in-effect -- selectionActive の外部同期 */
  useEffect(() => {
    if (!selectionActive) setMenuOpen(false);
  }, [selectionActive]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function commitField(field: keyof LayoutSpacing, raw: string) {
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const next = clampLayoutSpacing({
      ...resolved,
      [field]: clampLayoutSpacingValue(parsed),
    });
    if (next.childGap === resolved.childGap && next.siblingGap === resolved.siblingGap) return;
    onChange(next);
  }

  return (
    <div
      className="relative flex shrink-0 items-center"
      title={showManualTooltip ? MANUAL_MODE_TOOLTIP : undefined}
    >
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => setMenuOpen((open) => !open)}
      >
        配置間隔
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="配置間隔"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-[14rem] flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
        >
          <label className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <span>子方向の間隔</span>
            <input
              type="number"
              aria-label="子方向の間隔"
              className={fieldClassName}
              min={8}
              max={400}
              step={1}
              defaultValue={resolved.childGap}
              onBlur={(event) => commitField("childGap", event.target.value)}
            />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm text-zinc-700 dark:text-zinc-200">
            <span>兄弟方向の間隔</span>
            <input
              type="number"
              aria-label="兄弟方向の間隔"
              className={fieldClassName}
              min={8}
              max={400}
              step={1}
              defaultValue={resolved.siblingGap}
              onBlur={(event) => commitField("siblingGap", event.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}