import { planLayoutFieldUpdate } from "@/domain/nodes/planLayoutFieldUpdate";
import type { NodeMapState } from "@/types/nodeMapState";
import { createTestNode } from "@/testing/createTestNode";

describe("planLayoutFieldUpdate", () => {
  it("manual ではノードを動かさず patch だけ返す", () => {
    const nodes = [createTestNode({ id: 1, label: "a", x: 10, y: 20 })];
    const current: NodeMapState = { layoutMode: "manual", nodes };

    const next = planLayoutFieldUpdate(current, { layoutStyle: "radial" });

    expect(next).not.toBeNull();
    expect(next?.layoutStyle).toBe("radial");
    expect(next?.nodes).toBe(nodes);
  });

  it("auto では patch 後 state の layout で再配置した次状態を返す", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "c", x: 0, y: 0 }),
    ];
    const current: NodeMapState = { layoutMode: "auto", nodes };

    const next = planLayoutFieldUpdate(current, { treeDirection: "tb" });

    expect(next).not.toBeNull();
    expect(next?.treeDirection).toBe("tb");
    expect(next?.nodes).not.toBe(nodes);
    expect(next?.nodes.find((n) => n.id === 2)?.y).toBeGreaterThan(0);
  });

  it("layoutContext は nextState（current+patch）から単一ソースで取る", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "c", x: 0, y: 0 }),
    ];
    const current: NodeMapState = {
      layoutMode: "auto",
      nodes,
      treeDirection: "lr",
      layoutStyle: "orthogonal",
    };

    const next = planLayoutFieldUpdate(current, { layoutStyle: "radial" });

    expect(next).not.toBeNull();
    expect(next?.layoutStyle).toBe("radial");
    // radial 配置では子が親の周囲に置かれる（orthogonal の tb/lr 直線配置とは異なる）
    expect(next?.nodes).not.toBe(nodes);
  });
});
