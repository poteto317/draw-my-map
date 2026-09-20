import type { MapDocumentResult } from "@/types/mapDocument";
import type { Node } from "@/types/node";

export function validateMapDocumentGraph(
  nodes: readonly Node[],
): MapDocumentResult<Node[]> {
  const nodesById = new Map<number, Node>();
  for (const current of nodes) {
    if (nodesById.has(current.id)) {
      return { ok: false, error: `ノードID ${current.id} が重複しています。` };
    }
    nodesById.set(current.id, current);
  }

  for (const current of nodes) {
    if (current.parentId !== null && !nodesById.has(current.parentId)) {
      return {
        ok: false,
        error: `親ノード ${current.parentId} が存在しません。`,
      };
    }
  }

  const stateById = new Map<number, "visiting" | "visited">();
  for (const start of nodes) {
    if (stateById.get(start.id) === "visited") continue;

    const path: number[] = [];
    let current: Node | undefined = start;
    while (current) {
      const state = stateById.get(current.id);
      if (state === "visiting") {
        return { ok: false, error: "親子関係が循環しています。" };
      }
      if (state === "visited") break;

      stateById.set(current.id, "visiting");
      path.push(current.id);
      current = current.parentId === null
        ? undefined
        : nodesById.get(current.parentId);
    }

    for (const id of path) stateById.set(id, "visited");
  }

  return { ok: true, value: [...nodes] };
}
