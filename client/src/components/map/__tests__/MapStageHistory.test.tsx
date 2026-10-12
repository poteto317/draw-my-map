import { act } from "@testing-library/react";
import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from "react";
import { MapStage } from "@/components/map/MapStage";
import {
  mockNodePointerHandlers,
  mockStage,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

type NodesApi = ReturnType<typeof useNodes>;

type HistoryHarnessProps = {
  apiRef: MutableRefObject<NodesApi | null>;
  setup?: (api: NodesApi) => void;
  visibleNodeIds?: ReadonlySet<number>;
};

// 親(1)と子(2)を作った状態から始める。setupで追加の前提操作を行う
function HistoryHarness({ apiRef, setup, visibleNodeIds }: HistoryHarnessProps) {
  const api = useNodes();
  const initializedRef = useRef(false);

  useLayoutEffect(() => {
    apiRef.current = api;
  });

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const parentId = api.addNode(100, 60);
    api.addChildNode(parentId);
    setup?.(api);
  }, [api, setup]);

  return (
    <MapStage
      nodes={api.nodes}
      visibleNodeIds={visibleNodeIds}
      selectedNodeId={api.selectedNodeId}
      onDoubleClick={api.addNode}
      onAddChildNode={api.addChildNode}
      onAddSiblingNode={api.addSiblingNode}
      onSelectNode={api.selectNode}
      onUpdateLabel={api.updateNodeLabel}
      onMoveNode={api.moveNode}
      onBeginNodeMove={api.beginMoveHistory}
      onConnectNodes={api.connectNodes}
      onDeleteNode={api.deleteNode}
    />
  );
}

async function renderHistoryHarness(setup?: (api: NodesApi) => void) {
  const apiRef: MutableRefObject<NodesApi | null> = { current: null };
  const rendered = await renderReady(<HistoryHarness apiRef={apiRef} setup={setup} />);
  const api = () => apiRef.current!;
  return { apiRef, api, rendered };
}

function positions(nodes: readonly Node[]) {
  return nodes.map(({ id, x, y }) => ({ id, x, y }));
}

function nodeById(nodes: readonly Node[], id: number) {
  return nodes.find((node) => node.id === id)!;
}

function displacement(
  from: readonly Pick<Node, "id" | "x" | "y">[],
  to: readonly Pick<Node, "id" | "x" | "y">[],
  id: number,
) {
  const start = from.find((node) => node.id === id)!;
  const end = to.find((node) => node.id === id)!;
  return { dx: end.x - start.x, dy: end.y - start.y };
}

// 親ノード上でpointerdownし、同じpointerでdx刻みに移動する
function startParentDrag(options: { pointerType?: string } = {}) {
  const pointerOptions = { pointerId: 1, pointerType: options.pointerType ?? "mouse" };
  act(() => {
    mockNodePointerHandlers[0].pointerdown?.(pointer(110, 70, pointerOptions));
  });
  return {
    moveTo(x: number, y: number) {
      act(() => {
        mockStageHandlers.pointermove?.(pointer(x, y, pointerOptions));
      });
    },
    release(x: number, y: number) {
      act(() => {
        mockStageHandlers.pointerup?.(pointer(x, y, pointerOptions));
      });
    },
  };
}

beforeEach(() => {
  resetMapStageTestRuntime();
  // ノードIDを親=1、子=2に固定する
  let now = 0;
  jest.spyOn(Date, "now").mockImplementation(() => ++now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStageのドラッグ履歴", () => {
  it("親子のドラッグを1操作として戻し、やり直す", async () => {
    const { api } = await renderHistoryHarness();
    const before = positions(api().nodes);

    const drag = startParentDrag();
    for (let step = 1; step <= 10; step += 1) drag.moveTo(110 + step * 6, 70 + step * 3);
    drag.release(170, 100);
    const after = positions(api().nodes);

    expect(displacement(before, after, 1)).toEqual({ dx: 60, dy: 30 });
    expect(displacement(before, after, 2)).toEqual({ dx: 60, dy: 30 });

    act(() => {
      expect(api().undo()).toBe(true);
    });
    expect(positions(api().nodes)).toEqual(before);
    expect(api().nodes).toHaveLength(2);

    act(() => {
      expect(api().redo()).toBe(true);
    });
    expect(positions(api().nodes)).toEqual(after);
  });

  it("元の位置へ戻した往復ドラッグでは既存のRedoを保つ", async () => {
    const { api } = await renderHistoryHarness((nodesApi) => {
      nodesApi.updateNodeLabel(1, "変更後");
      nodesApi.undo();
    });
    const before = positions(api().nodes);
    expect(api().canRedo).toBe(true);

    const drag = startParentDrag();
    drag.moveTo(160, 120);
    drag.moveTo(110, 70);
    drag.release(110, 70);

    expect(positions(api().nodes)).toEqual(before);
    expect(api().canRedo).toBe(true);
    act(() => {
      expect(api().redo()).toBe(true);
    });
    expect(nodeById(api().nodes, 1).label).toBe("変更後");
  });

  it.each([
    {
      name: "pointercancel",
      interrupt: () => mockStageHandlers.pointercancel?.(pointer(140, 90)),
    },
    {
      name: "領域外での解放",
      interrupt: () => mockStageHandlers.pointerupoutside?.(pointer(140, 90)),
    },
  ])("$nameで中断しても移動済み分を1操作として残す", async ({ interrupt }) => {
    const { api } = await renderHistoryHarness();
    const before = positions(api().nodes);

    const drag = startParentDrag();
    drag.moveTo(130, 80);
    drag.moveTo(140, 90);
    act(interrupt);
    const interrupted = positions(api().nodes);
    drag.moveTo(200, 200);
    drag.release(200, 200);

    expect(displacement(before, interrupted, 1)).toEqual({ dx: 30, dy: 20 });
    expect(positions(api().nodes)).toEqual(interrupted);
    act(() => {
      api().undo();
    });
    expect(positions(api().nodes)).toEqual(before);
    expect(api().nodes).toHaveLength(2);
  });

  it("ピンチへの切り替えで中断しても移動済み分を1操作として残す", async () => {
    const { api } = await renderHistoryHarness();
    const before = positions(api().nodes);

    const drag = startParentDrag({ pointerType: "touch" });
    drag.moveTo(130, 80);
    drag.moveTo(140, 90);
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(300, 300, {
        pointerId: 2,
        pointerType: "touch",
        target: mockStage,
      }));
    });
    const interrupted = positions(api().nodes);
    drag.moveTo(200, 200);

    expect(displacement(before, interrupted, 1)).toEqual({ dx: 30, dy: 20 });
    expect(positions(api().nodes)).toEqual(interrupted);
    act(() => {
      api().undo();
    });
    expect(positions(api().nodes)).toEqual(before);
    expect(api().nodes).toHaveLength(2);
  });

  it("ドラッグ中のノード非表示化で中断しても移動済み分を1操作として残す", async () => {
    const apiRef: MutableRefObject<NodesApi | null> = { current: null };
    const rendered = await renderReady(<HistoryHarness apiRef={apiRef} />);
    const api = () => apiRef.current!;
    const before = positions(api().nodes);

    const drag = startParentDrag();
    drag.moveTo(130, 80);
    drag.moveTo(140, 90);
    rendered.rerender(<HistoryHarness apiRef={apiRef} visibleNodeIds={new Set([2])} />);
    const interrupted = positions(api().nodes);
    drag.moveTo(200, 200);
    drag.release(200, 200);

    expect(displacement(before, interrupted, 1)).toEqual({ dx: 30, dy: 20 });
    expect(positions(api().nodes)).toEqual(interrupted);
    act(() => {
      api().undo();
    });
    expect(positions(api().nodes)).toEqual(before);
    expect(api().nodes).toHaveLength(2);
  });

  it("自動配置モードのドラッグでは履歴を増やさない", async () => {
    const { api } = await renderHistoryHarness((nodesApi) => {
      nodesApi.setLayoutMode("auto");
    });
    const before = positions(api().nodes);

    const drag = startParentDrag();
    drag.moveTo(180, 140);
    drag.release(180, 140);

    expect(positions(api().nodes)).toEqual(before);
    expect(api().canRedo).toBe(false);
    act(() => {
      api().undo();
    });
    expect(api().layoutMode).toBe("manual");
  });

  it("ドラッグ中の重要度変更では移動と重要度の2操作だけを記録し、以後の移動を無視する", async () => {
    const { api } = await renderHistoryHarness();
    const before = api().nodes;
    const originalImportance = nodeById(before, 1).importance;
    const nextImportance = originalImportance === "high" ? "low" : "high";

    const drag = startParentDrag();
    drag.moveTo(130, 80);
    act(() => {
      expect(api().updateNodeImportance(1, nextImportance)).toBe(true);
    });
    const afterImportance = positions(api().nodes);
    drag.moveTo(200, 200);
    drag.release(200, 200);

    expect(displacement(positions(before), afterImportance, 1)).toEqual({ dx: 20, dy: 10 });
    expect(positions(api().nodes)).toEqual(afterImportance);

    act(() => {
      api().undo();
    });
    expect(nodeById(api().nodes, 1).importance).toBe(originalImportance);
    expect(positions(api().nodes)).toEqual(afterImportance);

    act(() => {
      api().undo();
    });
    expect(positions(api().nodes)).toEqual(positions(before));
    expect(api().nodes).toHaveLength(2);

    act(() => {
      api().undo();
    });
    expect(api().nodes).toHaveLength(1);
  });

  it("実変更のあるドラッグ中にRedoがfalseになっても、以後の旧移動を無視する", async () => {
    const { api } = await renderHistoryHarness();
    const before = positions(api().nodes);

    const drag = startParentDrag();
    drag.moveTo(130, 80);
    drag.moveTo(140, 90);
    act(() => {
      expect(api().redo()).toBe(false);
    });
    const afterRedo = positions(api().nodes);
    drag.moveTo(200, 200);
    drag.release(200, 200);

    expect(displacement(before, afterRedo, 1)).toEqual({ dx: 30, dy: 20 });
    expect(positions(api().nodes)).toEqual(afterRedo);
    act(() => {
      api().undo();
    });
    expect(positions(api().nodes)).toEqual(before);
    expect(api().nodes).toHaveLength(2);
  });
});
