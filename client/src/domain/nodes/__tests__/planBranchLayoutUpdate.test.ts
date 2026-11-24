import { planBranchLayoutUpdate } from "@/domain/nodes/planBranchLayoutUpdate";
import type { NodeMapState } from "@/types/nodeMapState";
import { createTestNode } from "@/testing/createTestNode";

describe("planBranchLayoutUpdate", () => {
  it("manual では配列だけ更新しノード座標は変えない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "c", x: 40, y: 0 }),
    ];
    const current: NodeMapState = { layoutMode: "manual", nodes };

    const planned = planBranchLayoutUpdate(current, 1, "tb");
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.state.branchLayouts).toEqual([{ nodeId: 1, direction: "tb" }]);
    expect(planned.state.nodes).toBe(nodes);
  });

  it("auto+radial では配列だけ更新し再配置しない", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "c", x: 40, y: 0 }),
    ];
    const current: NodeMapState = {
      layoutMode: "auto",
      layoutStyle: "radial",
      nodes,
    };

    const planned = planBranchLayoutUpdate(current, 1, "rl");
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.state.branchLayouts).toEqual([{ nodeId: 1, direction: "rl" }]);
    expect(planned.state.nodes).toBe(nodes);
  });

  it("auto+orthogonal では枝方向を反映して再配置する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0 }),
      createTestNode({ id: 2, parentId: 1, label: "c", x: 0, y: 0 }),
    ];
    const current: NodeMapState = { layoutMode: "auto", nodes };

    const planned = planBranchLayoutUpdate(current, 1, "tb");
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.state.branchLayouts).toEqual([{ nodeId: 1, direction: "tb" }]);
    expect(planned.state.nodes).not.toBe(nodes);
    expect(planned.state.nodes.find((n) => n.id === 2)?.y).toBeGreaterThan(0);
  });

  it("locked ノードは拒否する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "r", x: 0, y: 0, locked: true }),
    ];
    const current: NodeMapState = { layoutMode: "auto", nodes };
    expect(planBranchLayoutUpdate(current, 1, "tb")).toEqual({
      ok: false,
      reason: "locked",
    });
  });

  it("unchanged は ok:false reason:unchanged", () => {
    const nodes = [createTestNode({ id: 1, label: "r", x: 0, y: 0 })];
    const current: NodeMapState = {
      layoutMode: "manual",
      nodes,
      branchLayouts: [{ nodeId: 1, direction: "rl" }],
    };
    expect(planBranchLayoutUpdate(current, 1, "rl")).toEqual({
      ok: false,
      reason: "unchanged",
    });
  });
});
