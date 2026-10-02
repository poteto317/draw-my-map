"use client";

import type { Point } from "@/components/map/mapGeometry";
import { NODE_CONTEXT_MENU_SIZE } from "@/components/map/nodeContextMenuLayout";

type NodeContextMenuProps = {
  position: Point;
  onGenerateIllustration: () => void;
};

export function NodeContextMenu({ position, onGenerateIllustration }: NodeContextMenuProps) {
  return (
    <div
      role="menu"
      aria-label="ノードメニュー"
      className="absolute z-20 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      style={{ left: position.x, top: position.y, width: NODE_CONTEXT_MENU_SIZE.width }}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        autoFocus
        onClick={onGenerateIllustration}
        className="h-9 w-full rounded px-3 text-left text-sm text-zinc-800 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700"
      >
        イラストを生成
      </button>
    </div>
  );
}
