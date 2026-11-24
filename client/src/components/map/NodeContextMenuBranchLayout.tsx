"use client";

import type { BranchLayoutDirection } from "@/types/branchLayout";

const itemClassName = "w-full rounded px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700";

export const BRANCH_DIRECTION_ITEMS: readonly {
  direction: BranchLayoutDirection;
  label: string;
}[] = [
  { direction: "lr", label: "右へ（lr）" },
  { direction: "rl", label: "左へ（rl）" },
  { direction: "tb", label: "下へ（tb）" },
  { direction: "bt", label: "上へ（bt）" },
];

/** 見出し + 4 方向 + 「文書の既定に戻す」 */
export const BRANCH_LAYOUT_MENU_ITEM_COUNT = 1 + BRANCH_DIRECTION_ITEMS.length + 1;

type NodeContextMenuBranchLayoutProps = {
  disabled: boolean;
  current: BranchLayoutDirection;
  hasExplicit: boolean;
  autoFocusFirst: boolean;
  onSetBranchLayout: (direction: BranchLayoutDirection | null) => void;
};

export function NodeContextMenuBranchLayout({
  disabled,
  current,
  hasExplicit,
  autoFocusFirst,
  onSetBranchLayout,
}: NodeContextMenuBranchLayoutProps) {
  return (
    <>
      <div
        role="presentation"
        className="px-3 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
      >
        この枝の配置方向
      </div>
      {BRANCH_DIRECTION_ITEMS.map((item, index) => (
        <button
          key={item.direction}
          type="button"
          role="menuitemradio"
          aria-checked={current === item.direction && hasExplicit}
          autoFocus={autoFocusFirst && index === 0}
          disabled={disabled}
          onClick={() => onSetBranchLayout(item.direction)}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          {item.label}
        </button>
      ))}
      <button
        type="button"
        role="menuitem"
        disabled={disabled || !hasExplicit}
        onClick={() => onSetBranchLayout(null)}
        className={itemClassName}
        onMouseDown={(event) => event.preventDefault()}
      >
        文書の既定に戻す
      </button>
    </>
  );
}
