import type { Node } from "@/types/node";

// 自動配置の列の基準は先頭のルート。ノードの削除・統合で先頭のルートが別のノードに入れ替わったときだけ、
// 旧先頭のルートの座標を新しい先頭のルートへ写す。旧い配列・新しい配列のどちらかにルートが無いとき、
// 先頭のルートが変わらないときは座標を変えない。next は変更せず、変えたときだけ新しい配列を返す
export function keepFirstRootPosition(previous: readonly Node[], next: Node[]): Node[] {
  const previousRoot = previous.find((node) => node.parentId === null);
  const nextRootIndex = next.findIndex((node) => node.parentId === null);
  if (previousRoot === undefined || nextRootIndex === -1 || next[nextRootIndex].id === previousRoot.id) {
    return next;
  }
  const result = [...next];
  result[nextRootIndex] = { ...next[nextRootIndex], x: previousRoot.x, y: previousRoot.y };
  return result;
}
