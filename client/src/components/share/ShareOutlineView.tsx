"use client";

import { useMemo, useState } from "react";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import {
  canCollapse,
  createNodeCollapseIndex,
  deriveNodeCollapse,
  toggleCollapsedNode,
} from "@/domain/nodes/nodeCollapse";
import type { ShareCommentTarget } from "@/components/share/shareCommentTarget";
import { SHARE_COMMENT_MESSAGES } from "@/domain/share/shareCommentMessages";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { Node } from "@/types/node";

type ShareOutlineViewProps = {
  nodes: readonly Node[];
  /** comment リンクのときだけ非 null（行の件数と「コメント」ボタン） */
  commentTarget: ShareCommentTarget | null;
};

const commentButtonClassName = "shrink-0 rounded px-1.5 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100 aria-pressed:bg-blue-100 aria-pressed:text-blue-800";

export function ShareOutlineView({ nodes, commentTarget }: ShareOutlineViewProps) {
  const model = useMemo(() => buildOutlineRows(nodes), [nodes]);
  const index = useMemo(() => createNodeCollapseIndex(nodes), [nodes]);
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<number>>(() => new Set());

  const derived = useMemo(() => {
    if (!index) {
      return {
        collapsedNodeIds: collapsedIds,
        visibleNodeIds: new Set(nodes.map((n) => n.id)),
        hiddenCountById: new Map<number, number>(),
      };
    }
    return deriveNodeCollapse(index, collapsedIds);
  }, [index, collapsedIds, nodes]);

  if (nodes.length === 0) {
    return (
      <div data-testid="share-outline-view" className="p-4 text-sm text-zinc-600">
        {SHARE_MESSAGES.viewEmpty}
      </div>
    );
  }

  return (
    <div
      data-testid="share-outline-view"
      className="h-full overflow-auto p-4"
      aria-label="アウトライン"
    >
      <ul className="space-y-1">
        {model.rows.map((row) => {
          if (!derived.visibleNodeIds.has(row.nodeId)) return null;
          const node = model.nodesById.get(row.nodeId);
          if (!node) return null;
          const collapsible = index ? canCollapse(index, row.nodeId) : false;
          const isCollapsed = derived.collapsedNodeIds.has(row.nodeId);
          const hiddenCount = derived.hiddenCountById.get(row.nodeId) ?? 0;
          return (
            <li
              key={row.nodeId}
              className="flex items-start gap-2 text-sm text-zinc-800"
              style={{ paddingLeft: `${(row.depth - 1) * 1.25}rem` }}
            >
              {collapsible ? (
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded px-1 text-xs text-zinc-600 hover:bg-zinc-100"
                  aria-expanded={!isCollapsed}
                  aria-label={`${node.label || "（無題）"}を${isCollapsed ? SHARE_MESSAGES.viewExpand : SHARE_MESSAGES.viewCollapse}`}
                  onClick={() => {
                    if (!index) return;
                    setCollapsedIds((current) => toggleCollapsedNode(index, current, row.nodeId));
                  }}
                >
                  {isCollapsed ? `▸${hiddenCount > 0 ? ` (${hiddenCount})` : ""}` : "▾"}
                </button>
              ) : (
                <span className="mt-0.5 inline-block w-4 shrink-0" aria-hidden />
              )}
              <span>{node.label || "（無題）"}</span>
              {commentTarget !== null && renderCommentControls(commentTarget, row.nodeId, node.label || "（無題）")}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function renderCommentControls(target: ShareCommentTarget, nodeId: number, label: string) {
  const openCount = target.counts.get(nodeId) ?? 0;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {openCount > 0 && (
        <span className="text-xs text-zinc-600">{`${SHARE_COMMENT_MESSAGES.title} ${openCount}`}</span>
      )}
      <button
        type="button"
        className={commentButtonClassName}
        aria-pressed={target.selectedNodeId === nodeId}
        aria-label={`${SHARE_COMMENT_MESSAGES.title}（${label}）`}
        onClick={() => target.onSelectNode(nodeId)}
      >
        {SHARE_COMMENT_MESSAGES.title}
      </button>
    </span>
  );
}
