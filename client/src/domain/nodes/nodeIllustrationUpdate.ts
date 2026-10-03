import { ILLUSTRATED_NODE_HEIGHT, RECT_HEIGHT } from "@/config/shapes";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";
import type { Node } from "@/types/node";

export function replaceNodeIllustration(
  nodes: readonly Node[],
  id: number,
  dataUrl: string,
): Node[] | null {
  if (!isIllustrationDataUrl(dataUrl)) return null;
  if (!nodes.some((node) => node.id === id)) return null;

  return nodes.map((node) => (
    node.id === id ? { ...node, illustration: dataUrl, height: ILLUSTRATED_NODE_HEIGHT } : node
  ));
}

// イラストを外し、高さをイラストなしのノードの高さ（RECT_HEIGHT）に戻す。
// 設定時（ILLUSTRATED_NODE_HEIGHT に固定）と対になる。
export function clearNodeIllustration(
  nodes: readonly Node[],
  id: number,
): Node[] | null {
  const target = nodes.find((node) => node.id === id);
  if (target === undefined || target.illustration === undefined) return null;

  return nodes.map((node) => {
    if (node.id !== id) return node;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 分割代入で illustration を除外するため
    const { illustration: _removed, ...rest } = node;
    return { ...rest, height: RECT_HEIGHT };
  });
}
