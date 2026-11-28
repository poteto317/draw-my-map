import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import { fitNodeHeightToLabel } from "@/domain/nodes/nodeLabelLayout";
import type { Node } from "@/types/node";

export function replaceNodeIllustration(
  nodes: readonly Node[],
  id: number,
  dataUrl: string,
): Node[] | null {
  if (!isIllustrationDataUrl(dataUrl)) return null;
  if (!nodes.some((node) => node.id === id)) return null;
  if (!assertNodesEditable([id], nodes).ok) return null;

  return nodes.map((node) => {
    if (node.id !== id) return node;
    return fitNodeHeightToLabel({ ...node, illustration: dataUrl }, "commit");
  });
}

// イラストを外し、ラベルに合わせて commit fit する（下限は RECT_HEIGHT）。
export function clearNodeIllustration(
  nodes: readonly Node[],
  id: number,
): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined || target.illustration === undefined) return null;
  if (!assertNodesEditable([id], nodes).ok) return null;

  return nodes.map((node) => {
    if (node.id !== id) return node;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で illustration を除外するため
    const { illustration: _removed, ...rest } = node;
    return fitNodeHeightToLabel(rest, "commit");
  });
}
