import { createNodeCollapseIndex } from "@/domain/nodes/nodeCollapse";
import { planOutlineNodeJump } from "@/hooks/crossMapNavigationPlan";
import { createTestNode } from "@/testing/createTestNode";

describe("planOutlineNodeJump", () => {
  const root = createTestNode({ id: 1, parentId: null, label: "ルート", importance: "high" });
  const child = createTestNode({ id: 2, parentId: 1, label: "子", importance: "medium" });
  const grandChild = createTestNode({ id: 3, parentId: 2, label: "孫", importance: "low" });
  const nodes = [root, child, grandChild];

  it("表示中で展開も解像度変更も不要なら、空の展開対象と通知なしの計画を返す", () => {
    expect(
      planOutlineNodeJump({
        nodes,
        nodeId: 2,
        resolutionMode: "all",
        initialViewportScale: 1,
        collapseIndex: createNodeCollapseIndex(nodes),
        collapsedNodeIds: new Set(),
      }),
    ).toEqual({ ancestorIdsToExpand: [], resolutionLevel: null, notice: null });
  });

  it("折りたたまれた祖先があれば展開対象に含め、展開の通知を返す", () => {
    expect(
      planOutlineNodeJump({
        nodes,
        nodeId: 3,
        resolutionMode: "all",
        initialViewportScale: 1,
        collapseIndex: createNodeCollapseIndex(nodes),
        collapsedNodeIds: new Set([1, 2]),
      }),
    ).toEqual({
      ancestorIdsToExpand: [2, 1],
      resolutionLevel: null,
      notice: { kind: "status", message: "検索結果を表示するため、祖先の枝を展開しました。" },
    });
  });

  it("自動モードでは初期ズームを基準に解像度を判定し、隠れるノードなら解像度の切替と通知を返す", () => {
    // 初期ズーム 0.5 の自動判定は「高のみ」。重要度・低の孫は「すべて」へ切り替える必要がある
    const plan = planOutlineNodeJump({
      nodes,
      nodeId: 3,
      resolutionMode: "auto",
      initialViewportScale: 0.5,
      collapseIndex: createNodeCollapseIndex(nodes),
      collapsedNodeIds: new Set(),
    });

    expect(plan).toEqual({
      ancestorIdsToExpand: [],
      resolutionLevel: "all",
      notice: {
        kind: "status",
        message: "表示を『すべて』に切り替えました。ズームに連動させるには『自動』を選んでください。",
      },
    });
  });

  it("集中先では解像度切替を免除する", () => {
    const plan = planOutlineNodeJump({
      nodes,
      nodeId: 3,
      resolutionMode: "auto",
      initialViewportScale: 0.5,
      collapseIndex: createNodeCollapseIndex(nodes),
      collapsedNodeIds: new Set(),
      focusRootId: 3,
    });

    expect(plan).toEqual({
      ancestorIdsToExpand: [],
      resolutionLevel: null,
      notice: null,
    });
  });

  it("展開と解像度切替が両方必要なら、通知の文言を空白で連結する", () => {
    const plan = planOutlineNodeJump({
      nodes,
      nodeId: 3,
      resolutionMode: "high",
      initialViewportScale: 1,
      collapseIndex: createNodeCollapseIndex(nodes),
      collapsedNodeIds: new Set([2]),
    });

    expect(plan?.ancestorIdsToExpand).toEqual([2]);
    expect(plan?.resolutionLevel).toBe("all");
    expect(plan?.notice).toEqual({
      kind: "status",
      message:
        "検索結果を表示するため、祖先の枝を展開しました。 表示を『すべて』に切り替えました。ズームに連動させるには『自動』を選んでください。",
    });
  });

  it("親子関係が壊れて collapseIndex が null のときは null を返す", () => {
    expect(
      planOutlineNodeJump({
        nodes,
        nodeId: 2,
        resolutionMode: "all",
        initialViewportScale: 1,
        collapseIndex: null,
        collapsedNodeIds: new Set(),
      }),
    ).toBeNull();
  });

  it("対象ノードが collapseIndex に無いときは null を返す", () => {
    expect(
      planOutlineNodeJump({
        nodes,
        nodeId: 99,
        resolutionMode: "all",
        initialViewportScale: 1,
        collapseIndex: createNodeCollapseIndex(nodes),
        collapsedNodeIds: new Set(),
      }),
    ).toBeNull();
  });
});
