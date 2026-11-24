import { closeExportSubtree } from "@/domain/exportScope/closeExportSubtree";
import { normalizeExportForestParents } from "@/domain/exportScope/normalizeExportForestParents";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

function node(id: number, parentId: number | null, overrides: Partial<Node> = {}): Node {
  return createTestNode({ id, parentId, label: `n${id}`, ...overrides });
}

describe("closeExportSubtree", () => {
  const chain = [node(1, null), node(2, 1), node(3, 2)];

  it("対象 ID の祖先を閉包し、元の配列順を保つ", () => {
    expect(closeExportSubtree(chain, new Set([3]))).toEqual(chain);
  });

  it("閉包後は各 parentId が結果集合内か null", () => {
    const closed = closeExportSubtree(chain, new Set([3]));
    const ids = new Set(closed.map((n) => n.id));
    for (const n of closed) {
      expect(n.parentId === null || ids.has(n.parentId)).toBe(true);
    }
  });

  it("normalizeExportForestParents だと親子が壊れるが閉包は保つ", () => {
    const leafOnly = chain.filter((n) => n.id === 3);
    expect(normalizeExportForestParents(leafOnly)[0]!.parentId).toBeNull();

    const closed = closeExportSubtree(chain, new Set([3]));
    expect(closed.find((n) => n.id === 3)?.parentId).toBe(2);
    expect(closed.find((n) => n.id === 2)?.parentId).toBe(1);
  });

  it("複数ターゲットの共通祖先を一度だけ含める", () => {
    const map = [node(1, null), node(2, 1), node(3, 1), node(4, 2), node(5, 3)];
    const closed = closeExportSubtree(map, new Set([4, 5]));
    expect(closed.map((n) => n.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("元のノードを mutate しない", () => {
    const input = [node(2, 1), node(1, null)];
    const before = JSON.parse(JSON.stringify(input)) as Node[];
    const result = closeExportSubtree(input, new Set([2]));
    expect(input).toEqual(before);
    expect(result).not.toBe(input);
  });
});