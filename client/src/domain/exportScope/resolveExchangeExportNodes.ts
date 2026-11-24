import { closeExportSubtree } from "@/domain/exportScope/closeExportSubtree";
import type { ExportScope } from "@/domain/exportScope/exportScope";
import { resolveExportNodes } from "@/domain/exportScope/resolveExportNodes";
import type { Node } from "@/types/node";

/** OPML・CSV/TSV 向け。表示中／選択は祖先閉包、全件はそのまま。 */
export function resolveExchangeExportNodes(
  scope: ExportScope,
  allNodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
  selectionTargetIds: readonly number[],
): readonly Node[] {
  if (scope === "all") {
    return resolveExportNodes(scope, allNodes, visibleNodeIds, selectionTargetIds);
  }
  const resolved = resolveExportNodes(scope, allNodes, visibleNodeIds, selectionTargetIds);
  return closeExportSubtree(allNodes, resolved.map((node) => node.id));
}