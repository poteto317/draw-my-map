"use client";

import { getIllustrationActionLabel } from "@/domain/illustration/illustrationActionLabel";
import type { Point } from "@/components/map/mapGeometry";
import { NODE_CONTEXT_MENU_ATTRIBUTE } from "@/components/map/nodeContextMenuDom";
import {
  measureNodeContextMenuHeight,
  NODE_CONTEXT_MENU_WIDTH,
} from "@/components/map/nodeContextMenuLayout";
import {
  BRANCH_LAYOUT_MENU_ITEM_COUNT,
  NodeContextMenuBranchLayout,
} from "@/components/map/NodeContextMenuBranchLayout";
import type { BranchLayoutDirection } from "@/types/branchLayout";

const itemClassName = "w-full rounded px-3 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 focus:bg-zinc-100 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:hover:bg-zinc-700 dark:focus:bg-zinc-700";

type NodeContextMenuProps = {
  position: Point;
  hasIllustration?: boolean;
  /** 未指定ならイラスト項目を出さない（N6/N7 等をイラスト配線から独立させる） */
  onGenerateIllustration?: () => void;
  extractVisible?: boolean;
  extractDisabled?: boolean;
  onBeginBranchExtract?: () => void;
  relationAddVisible?: boolean;
  relationAddDisabled?: boolean;
  onBeginRelationAdd?: () => void;
  relationConnectVisible?: boolean;
  relationConnectDisabled?: boolean;
  onConnectRelation?: () => void;
  groupCreateVisible?: boolean;
  groupCreateDisabled?: boolean;
  onCreateGroup?: () => void;
  branchGroupVisible?: boolean;
  branchGroupDisabled?: boolean;
  onCreateBranchGroup?: () => void;
  layoutPinnedVisible?: boolean;
  layoutPinnedDisabled?: boolean;
  layoutPinnedAction?: "pin" | "unpin";
  onToggleLayoutPinned?: () => void;
  branchLayoutVisible?: boolean;
  branchLayoutDisabled?: boolean;
  branchLayoutCurrent?: BranchLayoutDirection;
  branchLayoutHasExplicit?: boolean;
  onSetBranchLayout?: (direction: BranchLayoutDirection | null) => void;
};

export function NodeContextMenu({
  position,
  hasIllustration = false,
  onGenerateIllustration,
  extractVisible = false,
  extractDisabled = false,
  onBeginBranchExtract,
  relationAddVisible = false,
  relationAddDisabled = false,
  onBeginRelationAdd,
  relationConnectVisible = false,
  relationConnectDisabled = false,
  onConnectRelation,
  groupCreateVisible = false,
  groupCreateDisabled = false,
  onCreateGroup,
  branchGroupVisible = false,
  branchGroupDisabled = false,
  onCreateBranchGroup,
  layoutPinnedVisible = false,
  layoutPinnedDisabled = false,
  layoutPinnedAction = "pin",
  onToggleLayoutPinned,
  branchLayoutVisible = false,
  branchLayoutDisabled = false,
  branchLayoutCurrent = "lr",
  branchLayoutHasExplicit = false,
  onSetBranchLayout,
}: NodeContextMenuProps) {
  const illustrationVisible = onGenerateIllustration !== undefined;
  const branchLayoutItemCount = branchLayoutVisible && onSetBranchLayout !== undefined
    ? BRANCH_LAYOUT_MENU_ITEM_COUNT
    : 0;
  const itemCount = (illustrationVisible ? 1 : 0)
    + (extractVisible ? 1 : 0)
    + (relationAddVisible ? 1 : 0)
    + (relationConnectVisible ? 1 : 0)
    + (groupCreateVisible ? 1 : 0)
    + (branchGroupVisible ? 1 : 0)
    + (layoutPinnedVisible ? 1 : 0)
    + branchLayoutItemCount;
  const height = measureNodeContextMenuHeight(itemCount);
  const autoFocusTarget = ([
    { id: "illustration" as const, visible: illustrationVisible },
    { id: "extract" as const, visible: extractVisible && onBeginBranchExtract !== undefined },
    { id: "relationAdd" as const, visible: relationAddVisible && onBeginRelationAdd !== undefined },
    { id: "relationConnect" as const, visible: relationConnectVisible && onConnectRelation !== undefined },
    { id: "groupCreate" as const, visible: groupCreateVisible && onCreateGroup !== undefined },
    { id: "branchGroup" as const, visible: branchGroupVisible && onCreateBranchGroup !== undefined },
    { id: "layoutPinned" as const, visible: layoutPinnedVisible && onToggleLayoutPinned !== undefined },
    { id: "branchLayout" as const, visible: branchLayoutVisible && onSetBranchLayout !== undefined },
  ]).find((candidate) => candidate.visible)?.id ?? null;

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
      {illustrationVisible && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "illustration"}
          onClick={onGenerateIllustration}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          {getIllustrationActionLabel(hasIllustration)}
        </button>
      )}
      {extractVisible && onBeginBranchExtract !== undefined && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "extract"}
          disabled={extractDisabled}
          onClick={onBeginBranchExtract}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          枝を別マップに切り出す
        </button>
      )}
      {relationAddVisible && onBeginRelationAdd !== undefined && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "relationAdd"}
          disabled={relationAddDisabled}
          onClick={onBeginRelationAdd}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          関連線を追加
        </button>
      )}
      {relationConnectVisible && onConnectRelation !== undefined && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "relationConnect"}
          disabled={relationConnectDisabled}
          onClick={onConnectRelation}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          関連線で結ぶ
        </button>
      )}
      {groupCreateVisible && onCreateGroup !== undefined && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "groupCreate"}
          disabled={groupCreateDisabled}
          onClick={onCreateGroup}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          グループ化
        </button>
      )}
      {branchGroupVisible && onCreateBranchGroup !== undefined && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "branchGroup"}
          disabled={branchGroupDisabled}
          onClick={onCreateBranchGroup}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          この枝をグループ化
        </button>
      )}
      {layoutPinnedVisible && onToggleLayoutPinned !== undefined && (
        <button
          type="button"
          role="menuitem"
          autoFocus={autoFocusTarget === "layoutPinned"}
          disabled={layoutPinnedDisabled}
          onClick={onToggleLayoutPinned}
          className={itemClassName}
          onMouseDown={(event) => event.preventDefault()}
        >
          {layoutPinnedAction === "unpin" ? "固定を解除" : "位置を固定"}
        </button>
      )}
      {branchLayoutVisible && onSetBranchLayout !== undefined && (
        <NodeContextMenuBranchLayout
          disabled={branchLayoutDisabled}
          current={branchLayoutCurrent}
          hasExplicit={branchLayoutHasExplicit}
          autoFocusFirst={autoFocusTarget === "branchLayout"}
          onSetBranchLayout={onSetBranchLayout}
        />
      )}
    </div>
  );
}
