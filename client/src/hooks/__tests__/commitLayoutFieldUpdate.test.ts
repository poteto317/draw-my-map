import { commitLayoutFieldUpdate } from "@/hooks/commitLayoutFieldUpdate";
import type { NodeMapState } from "@/types/nodeMapState";
import { createTestNode } from "@/testing/createTestNode";

describe("commitLayoutFieldUpdate", () => {
  it("manual ではノードを動かさず patch だけ commit する", () => {
    const nodes = [createTestNode({ id: 1, label: "a", x: 10, y: 20 })];
    const current: NodeMapState = { layoutMode: "manual", nodes };
    const committed: NodeMapState[] = [];

    const ok = commitLayoutFieldUpdate(
      current,
      { layoutStyle: "radial" },
      (next) => {
        committed.push(next);
      },
    );

    expect(ok).toBe(true);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.layoutStyle).toBe("radial");
    expect(committed[0]?.nodes).toBe(nodes);
  });

  it("auto では patch 後 layout で再配置してから commit する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "c", x: 0, y: 0 }),
    ];
    const current: NodeMapState = { layoutMode: "auto", nodes };
    const committed: NodeMapState[] = [];

    const ok = commitLayoutFieldUpdate(
      current,
      { treeDirection: "tb" },
      (next) => {
        committed.push(next);
      },
    );

    expect(ok).toBe(true);
    expect(committed).toHaveLength(1);
    expect(committed[0]?.treeDirection).toBe("tb");
    expect(committed[0]?.nodes).not.toBe(nodes);
    expect(committed[0]?.nodes.find((n) => n.id === 2)?.y).toBeGreaterThan(0);
  });
});
