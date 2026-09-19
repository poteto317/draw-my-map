import { renderHook, act } from "@testing-library/react";
import {
  CHILD_HORIZONTAL_GAP,
  RECT_HEIGHT,
  RECT_WIDTH,
  SIBLING_VERTICAL_GAP,
} from "@/config/shapes";
import { layoutNodeForest } from "@/domain/nodes/nodeAutoLayout";
import { useNodes } from "@/hooks/useNodes";

jest.mock("@/domain/nodes/nodeAutoLayout", () => {
  const actual = jest.requireActual<typeof import("@/domain/nodes/nodeAutoLayout")>(
    "@/domain/nodes/nodeAutoLayout",
  );
  return {
    ...actual,
    layoutNodeForest: jest.fn(actual.layoutNodeForest),
  };
});

describe("useNodes auto layout", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("手動配置で開始し、自動配置への切り替え直後に全体を整列する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(500, 300);
    });
    const firstRoot = result.current.nodes[0];

    act(() => result.current.setLayoutMode("auto"));

    expect(result.current.layoutMode).toBe("auto");
    expect(result.current.nodes[0]).toMatchObject({
      x: firstRoot.x,
      y: firstRoot.y,
    });
    expect(result.current.nodes[1].x).toBe(firstRoot.x);
    expect(result.current.nodes[1].y).toBeGreaterThan(
      firstRoot.y + firstRoot.height,
    );
  });

  it("初回renderで取得したsetLayoutModeが最新ノードを整列し参照も安定する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    const setLayoutMode = result.current.setLayoutMode;
    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(400, 400);
    });

    act(() => setLayoutMode("auto"));

    expect(result.current.layoutMode).toBe("auto");
    expect(result.current.setLayoutMode).toBe(setLayoutMode);
    expect(result.current.nodes[1].x).toBe(result.current.nodes[0].x);
  });

  it("無効な現在ノードでは自動モードへの切り替えを原子的に拒否する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(Number.NaN, 100));
    const nodesBefore = result.current.nodes;

    act(() => result.current.setLayoutMode("auto"));

    expect(result.current.layoutMode).toBe("manual");
    expect(result.current.nodes).toBe(nodesBefore);
  });

  it("自動モード中は子追加後に全体を再配置する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(600, 300);
      result.current.setLayoutMode("auto");
    });

    act(() => result.current.addChildNode(1));
    expect(result.current.nodes.find((node) => node.id === 3)?.x).toBe(
      result.current.nodes[0].x
        + result.current.nodes[0].width
        + CHILD_HORIZONTAL_GAP,
    );
  });

  it("自動モード中は兄弟追加後に全体を再配置する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
      result.current.setLayoutMode("auto");
    });

    act(() => result.current.addSiblingNode(2));
    const children = result.current.nodes.filter(({ parentId }) => parentId === 1);
    expect(children[1].y).toBe(
      children[0].y + children[0].height + SIBLING_VERTICAL_GAP,
    );
  });

  it("自動モード中は接続後に全体を再配置する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(600, 300);
      result.current.setLayoutMode("auto");
    });

    act(() => result.current.connectNodes(1, 2));

    expect(result.current.nodes.find(({ id: nodeId }) => nodeId === 2)?.parentId)
      .toBe(1);
    expect(result.current.nodes.find(({ id: nodeId }) => nodeId === 2)?.x).toBe(
      result.current.nodes.find(({ id: nodeId }) => nodeId === 1)!.x
        + RECT_WIDTH
        + CHILD_HORIZONTAL_GAP,
    );
  });

  it("自動モード中のmoveNodeは配列参照と全座標を維持する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(100, 100));
    act(() => result.current.setLayoutMode("auto"));
    const nodesBefore = result.current.nodes;

    act(() => result.current.moveNode(nodesBefore[0].id, 900, 900));

    expect(result.current.nodes).toBe(nodesBefore);
  });

  it("空の自動モードで最初に追加したルート位置をアンカーにする", () => {
    const { result } = renderHook(() => useNodes());
    act(() => result.current.setLayoutMode("auto"));

    act(() => result.current.addNode(320, 240));

    expect(result.current.nodes[0]).toMatchObject({
      x: 320 - RECT_WIDTH / 2,
      y: 240 - RECT_HEIGHT / 2,
    });
  });

  it("自動モードでルートを追加すると既存アンカーの列へ再配置する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(100, 100));
    act(() => result.current.setLayoutMode("auto"));

    act(() => result.current.addNode(900, 900));

    expect(result.current.nodes[1].x).toBe(result.current.nodes[0].x);
    expect(result.current.nodes[1].y).toBeGreaterThan(
      result.current.nodes[0].y + result.current.nodes[0].height,
    );
  });

  it("初回renderで取得した構造commandは最新の自動モードを参照する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    const addNode = result.current.addNode;
    const moveNode = result.current.moveNode;
    act(() => addNode(100, 100));
    act(() => result.current.setLayoutMode("auto"));

    act(() => addNode(900, 900));
    const positioned = result.current.nodes;
    act(() => moveNode(positioned[0].id, 500, 500));

    expect(result.current.nodes).toBe(positioned);
    expect(result.current.nodes[1].x).toBe(result.current.nodes[0].x);
  });

  it("自動モードで兄弟削除後に残った兄弟を親の中央へ戻す", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
      result.current.addChildNode(1);
      result.current.setLayoutMode("auto");
    });
    expect(result.current.nodes.find(({ id: nodeId }) => nodeId === 3)?.y)
      .not.toBe(70);

    act(() => result.current.deleteNode(2));

    expect(result.current.nodes.find(({ id: nodeId }) => nodeId === 3)?.y).toBe(70);
  });

  it("自動配置に失敗した追加はstateを変えずID契約を維持する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => result.current.setLayoutMode("auto"));
    const before = result.current.nodes;
    let rejectedId!: number;

    act(() => {
      rejectedId = result.current.addNode(Number.NaN, 0);
    });

    expect(rejectedId).toBe(1);
    expect(result.current.nodes).toBe(before);
    expect(result.current.layoutMode).toBe("auto");
  });

  it("自動配置に失敗した子追加はnullを返し選択を変えない", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(Number.MAX_VALUE, 0));
    act(() => result.current.setLayoutMode("auto"));
    const nodesBefore = result.current.nodes;
    let childId!: number | null;

    act(() => {
      childId = result.current.addChildNode(1);
    });

    expect(childId).toBeNull();
    expect(result.current.nodes).toBe(nodesBefore);
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("自動配置に失敗した兄弟追加と接続は既存stateを維持する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(0, Number.MAX_VALUE));
    act(() => result.current.setLayoutMode("auto"));
    const beforeSibling = result.current.nodes;
    let siblingId!: number | null;

    act(() => {
      siblingId = result.current.addSiblingNode(1);
    });
    expect(siblingId).toBeNull();
    expect(result.current.nodes).toBe(beforeSibling);

    act(() => result.current.setLayoutMode("manual"));
    act(() => result.current.addNode(0, 0));
    act(() => result.current.moveNode(1, Number.MAX_VALUE, 0));
    act(() => result.current.setLayoutMode("auto"));
    const beforeConnection = result.current.nodes;
    act(() => result.current.selectNode(1));
    let connected!: boolean;
    act(() => {
      connected = result.current.connectNodes(1, 3);
    });
    expect(connected).toBe(false);
    expect(result.current.nodes).toBe(beforeConnection);
    expect(result.current.selectedNodeId).toBe(1);
  });

  it("自動モード中のラベル変更は自動レイアウトを再実行しない", () => {
    const layoutMock = jest.mocked(layoutNodeForest);
    layoutMock.mockClear();
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(100, 100));
    act(() => result.current.setLayoutMode("auto"));
    const callsBeforeLabelUpdate = layoutMock.mock.calls.length;

    act(() => result.current.updateNodeLabel(result.current.nodes[0].id, "更新"));

    expect(result.current.nodes[0].label).toBe("更新");
    expect(layoutMock).toHaveBeenCalledTimes(callsBeforeLabelUpdate);
  });

  it("自動モード中の選択変更はノード配列を変更しない", () => {
    const { result } = renderHook(() => useNodes());
    act(() => result.current.addNode(100, 100));
    act(() => result.current.setLayoutMode("auto"));
    const nodesBeforeSelection = result.current.nodes;

    act(() => result.current.selectNode(nodesBeforeSelection[0].id));

    expect(result.current.selectedNodeId).toBe(nodesBeforeSelection[0].id);
    expect(result.current.nodes).toBe(nodesBeforeSelection);
  });

  it("手動モードへ戻しても自動配置済み座標を維持する", () => {
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(500, 300);
      result.current.setLayoutMode("auto");
    });
    const autoCoordinates = result.current.nodes.map(({ x, y }) => ({ x, y }));

    act(() => result.current.setLayoutMode("manual"));

    expect(result.current.nodes.map(({ x, y }) => ({ x, y })))
      .toEqual(autoCoordinates);
  });
});
