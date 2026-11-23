"use client";

import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";
import type { Point } from "@/components/map/mapGeometry";
import { NODE_CONTEXT_MENU_ATTRIBUTE } from "@/components/map/nodeContextMenuDom";
import {
  measureNodeContextMenuHeight,
  NODE_CONTEXT_MENU_WIDTH,
} from "@/components/map/nodeContextMenuLayout";

const itemClassName = "w-full rounded px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700";

type NodeContextMenuProps = {
  position: Point;
  hasIllustration: boolean;
  onGenerateIllustration: () => void;
  extractVisible?: boolean;
  extractDisabled?: boolean;
  onBeginBranchExtract?: () => void;
};

export function NodeContextMenu({
  position,
  hasIllustration,
  onGenerateIllustration,
  extractVisible = false,
  extractDisabled = false,
  onBeginBranchExtract,
}: NodeContextMenuProps) {
  const itemCount = 1 + (extractVisible ? 1 : 0);
  const height = measureNodeContextMenuHeight(itemCount);

  return (
    <div
      role="menu"
      aria-label="ノードメニュー"
      {...{ [NODE_CONTEXT_MENU_ATTRIBUTE]: "" }}
      className="absolute z-20 flex flex-col gap-0 rounded-md border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-800"
      style={{ left: position.x, top: position.y, width: NODE_CONTEXT_MENU_WIDTH, height }}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onMouseDown={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        autoFocus
        onClick={onGenerateIllustration}
        className={itemClassName}
        onMouseDown={(event) => event.preventDefault()}
      >
        {getIllustrationActionLabel(hasIllustration)}
      </button>
      {extractVisible && onBeginBranchExtract !== undefined && (
        <button
          type="button"
          role="menuitem"
          disabled={extractDisabled}
          onClick={onBeginBranchExtract}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          枝を別マップに切り出す
        </button>
      )}
    </div>
  );
}