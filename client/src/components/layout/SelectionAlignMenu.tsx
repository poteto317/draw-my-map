"use client";

import { useEffect, useId, useState } from "react";
import type { SelectionAlignOp } from "@/domain/nodes/selectionAlign";
import type { SelectionDistributeAxis } from "@/domain/nodes/selectionDistribute";
import type { NodeLayoutMode } from "@/types/nodeLayout";

type SelectionAlignMenuProps = {
  layoutMode: NodeLayoutMode;
  selectionActive: boolean;
  disabled: boolean;
  onAlign: (op: SelectionAlignOp) => void;
  onDistribute: (axis: SelectionDistributeAxis) => void;
};

const MANUAL_MODE_TOOLTIP =
  "整列・等間隔は手動配置モードでのみ使えます。";

const DISABLED_SELECTION_TOOLTIP =
  "ロックされたノードを含む、または2件未満の選択では使えません。";

const buttonClassName =
  "shrink-0 rounded-md bg-zinc-100 px-3 py-1 text-sm text-zinc-700 transition-colors hover:bg-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600";

const menuItemClassName =
  "rounded px-2 py-1 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-700";

const alignItems: ReadonlyArray<{ op: SelectionAlignOp; label: string }> = [
  { op: "align-left", label: "左揃え" },
  { op: "align-center-x", label: "水平中央" },
  { op: "align-right", label: "右揃え" },
  { op: "align-top", label: "上揃え" },
  { op: "align-center-y", label: "垂直中央" },
  { op: "align-bottom", label: "下揃え" },
];

export function SelectionAlignMenu({
  layoutMode,
  selectionActive,
  disabled,
  onAlign,
  onDistribute,
}: SelectionAlignMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const showManualTooltip = layoutMode !== "manual";
  const showDisabledTooltip = layoutMode === "manual" && disabled;

  // L-214: 選択消失で開状態を閉じる（Phase 24 オーバーレイ同期と同型）
  /* eslint-disable react-hooks/set-state-in-effect -- selectionActive の外部同期 */
  useEffect(() => {
    if (!selectionActive) setMenuOpen(false);
  }, [selectionActive]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const tooltip = showManualTooltip
    ? MANUAL_MODE_TOOLTIP
    : showDisabledTooltip
      ? DISABLED_SELECTION_TOOLTIP
      : undefined;

  return (
    <div className="relative flex shrink-0 items-center" title={tooltip}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        disabled={layoutMode !== "manual" || disabled}
        onClick={() => setMenuOpen((open) => !open)}
      >
        整列・等間隔
      </button>
      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="整列・等間隔"
          className="absolute top-full left-0 z-20 mt-1 flex min-w-[12rem] flex-col gap-1 rounded-md border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
        >
          <span className="px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400">整列</span>
          {alignItems.map(({ op, label }) => (
            <button
              key={op}
              type="button"
              role="menuitem"
              className={menuItemClassName}
              onClick={() => {
                onAlign(op);
                setMenuOpen(false);
              }}
            >
              {label}
            </button>
          ))}
          <span className="mt-1 px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400">等間隔</span>
          <button
            type="button"
            role="menuitem"
            className={menuItemClassName}
            onClick={() => {
              onDistribute("x");
              setMenuOpen(false);
            }}
          >
            水平
          </button>
          <button
            type="button"
            role="menuitem"
            className={menuItemClassName}
            onClick={() => {
              onDistribute("y");
              setMenuOpen(false);
            }}
          >
            垂直
          </button>
        </div>
      )}
    </div>
  );
}