import { startTransition } from "react";
import { flushSync } from "react-dom";
import { renderHook, act } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";

describe("useNodes", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("初期状態では nodes は空で選択はない", () => {
    const { result } = renderHook(() => useNodes());

    expect(result.current.nodes).toEqual([]);
    expect(result.current.selectedNodeId).toBeNull();
  });

  // Production break caught: addNode drops an update made in the same React batch.
  it("addNode は作成したIDを返し、同じ batch の追加を蓄積する", () => {
    let id = 100;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    let firstId!: number;
    let secondId!: number;

    act(() => {
      firstId = result.current.addNode(100, 100);
      secondId = result.current.addNode(200, 200);
    });

    expect([firstId, secondId]).toEqual([101, 102]);
    expect(result.current.nodes.map((node) => node.id)).toEqual([101, 102]);
    expect(result.current.nodes.every((node) => node.parentId === null)).toBe(true);
  });

  it("Date.now が同じ値でも一括作成したルート・子・兄弟に一意なIDを割り当てる", () => {
    jest.spyOn(Date, "now").mockReturnValue(1_000);
    const { result } = renderHook(() => useNodes());
    const createdIds: number[] = [];

    act(() => {
      createdIds.push(
        result.current.addNode(100, 100),
        result.current.addNode(500, 100),
      );
    });
    act(() => {
      createdIds.push(
        result.current.addChildNode(createdIds[0])!,
        result.current.addChildNode(createdIds[0])!,
      );
    });
    act(() => {
      createdIds.push(
        result.current.addSiblingNode(createdIds[2])!,
        result.current.addSiblingNode(createdIds[2])!,
      );
    });

    expect(createdIds).toEqual([1_000, 1_001, 1_002, 1_003, 1_004, 1_005]);
    expect(new Set(result.current.nodes.map((node) => node.id)).size).toBe(6);

    act(() => result.current.updateNodeLabel(createdIds[4], "対象だけ更新"));
    expect(result.current.nodes.filter((node) => node.label === "対象だけ更新"))
      .toEqual([expect.objectContaining({ id: createdIds[4] })]);

    act(() => result.current.deleteNode(createdIds[4]));
    expect(result.current.nodes.map((node) => node.id)).toEqual(createdIds.filter(
      (id) => id !== createdIds[4],
    ));
  });

  it("selectNode は選択を設定・解除する", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.selectNode(123);
    });
    expect(result.current.selectedNodeId).toBe(123);

    act(() => {
      result.current.selectNode(null);
    });
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("updateNodeLabel は指定ノードだけを更新する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
    });
    act(() => {
      result.current.updateNodeLabel(1, "更新ラベル");
    });

    expect(result.current.nodes.map((node) => node.label)).toEqual(["更新ラベル", ""]);
  });

  it("葉または子孫のないノードだけを移動する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
    });
    const untouchedNode = result.current.nodes[1];
    act(() => {
      result.current.moveNode(1, 300, 250);
    });

    expect(result.current.nodes[0]).toMatchObject({ x: 300, y: 250 });
    expect(result.current.nodes[1]).toMatchObject({
      x: untouchedNode.x,
      y: untouchedNode.y,
    });
  });

  it("moveNodeは親と全子孫へ同じ差分を適用する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
      result.current.addChildNode(2);
      result.current.addNode(600, 100);
    });
    const before = result.current.nodes.map((node) => ({ ...node }));
    const root = before.find((node) => node.id === 1)!;

    act(() => result.current.moveNode(1, root.x + 25, root.y - 10));

    for (const nodeId of [1, 2, 3]) {
      const oldNode = before.find((node) => node.id === nodeId)!;
      const movedNode = result.current.nodes.find((node) => node.id === nodeId)!;
      expect(movedNode).toMatchObject({ x: oldNode.x + 25, y: oldNode.y - 10 });
    }
    expect(result.current.nodes.find((node) => node.id === 4)).toEqual(before[3]);
  });

  it("中間ノードから配下だけを移動する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
      result.current.addChildNode(2);
    });
    const before = result.current.nodes.map((node) => ({ ...node }));
    const middle = before[1];

    act(() => result.current.moveNode(2, middle.x + 10, middle.y + 15));

    expect(result.current.nodes[0]).toEqual(before[0]);
    expect(result.current.nodes[1]).toMatchObject({ x: middle.x + 10, y: middle.y + 15 });
    expect(result.current.nodes[2]).toMatchObject({
      x: before[2].x + 10,
      y: before[2].y + 15,
    });
  });

  it("同一batchの絶対移動先を子孫へ重複加算しない", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
    });
    const root = { ...result.current.nodes[0] };
    const child = { ...result.current.nodes[1] };

    act(() => {
      result.current.moveNode(1, root.x + 10, root.y + 5);
      result.current.moveNode(1, root.x + 20, root.y + 15);
    });

    expect(result.current.nodes[0]).toMatchObject({ x: root.x + 20, y: root.y + 15 });
    expect(result.current.nodes[1]).toMatchObject({ x: child.x + 20, y: child.y + 15 });
  });

  it("初回取得したmoveNodeは最新ツリーの子孫を移動する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    const moveNode = result.current.moveNode;
    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
    });
    const root = { ...result.current.nodes[0] };
    const child = { ...result.current.nodes[1] };

    act(() => moveNode(1, root.x + 30, root.y + 40));

    expect(result.current.nodes[1]).toMatchObject({
      x: child.x + 30,
      y: child.y + 40,
    });
    expect(result.current.moveNode).toBe(moveNode);
  });

  it("欠損ノードと非有限座標ではstateを変更しない", () => {
    const { result } = renderHook(() => useNodes());
    let nodeId!: number;
    act(() => {
      nodeId = result.current.addNode(100, 100);
    });
    const before = result.current.nodes;

    act(() => result.current.moveNode(nodeId + 1, 1, 1));
    expect(result.current.nodes).toBe(before);

    act(() => result.current.moveNode(nodeId, Number.NaN, 1));
    expect(result.current.nodes).toBe(before);
  });

  it("deleteNode は対象と子孫を削除し、選択中の子孫を解除する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    act(() => result.current.addChildNode(1));
    act(() => result.current.addChildNode(2));
    act(() => result.current.addNode(500, 100));
    act(() => result.current.selectNode(3));
    act(() => result.current.deleteNode(1));

    expect(result.current.nodes.map((node) => node.id)).toEqual([4]);
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("addChildNode は子を接続して作成ノードを選択する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    let childId!: number | null;
    act(() => {
      childId = result.current.addChildNode(1);
    });

    expect(childId).toBe(2);
    expect(result.current.nodes[1].parentId).toBe(1);
    expect(result.current.selectedNodeId).toBe(2);
  });

  it("addSiblingNode は兄弟を接続して作成ノードを選択する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    act(() => result.current.addChildNode(1));
    let siblingId!: number | null;
    act(() => {
      siblingId = result.current.addSiblingNode(2);
    });

    expect(siblingId).toBe(3);
    expect(result.current.nodes[2].parentId).toBe(1);
    expect(result.current.selectedNodeId).toBe(3);
  });

  it("存在しない親または兄弟の基点にはノードを作成しない", () => {
    const { result } = renderHook(() => useNodes());
    let childId!: number | null;
    let siblingId!: number | null;

    act(() => {
      childId = result.current.addChildNode(999);
      siblingId = result.current.addSiblingNode(999);
    });

    expect(childId).toBeNull();
    expect(siblingId).toBeNull();
    expect(result.current.nodes).toEqual([]);
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("同じ batch のルート作成を後続の子・兄弟作成から参照する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    let rootId!: number;
    let childId!: number | null;
    let siblingId!: number | null;

    act(() => {
      rootId = result.current.addNode(100, 100);
      childId = result.current.addChildNode(rootId);
      siblingId = result.current.addSiblingNode(childId!);
    });

    expect([rootId, childId, siblingId]).toEqual([1, 2, 3]);
    expect(result.current.nodes.map((node) => node.parentId)).toEqual([null, 1, 1]);
    expect(result.current.selectedNodeId).toBe(3);
  });

  it("保留中のノード更新を緊急 render が上書きしない", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    let rootId!: number;
    let childId!: number | null;

    act(() => {
      startTransition(() => {
        rootId = result.current.addNode(100, 100);
      });
      flushSync(() => result.current.selectNode(999));
      childId = result.current.addChildNode(rootId);
    });

    expect(childId).toBe(2);
    expect(result.current.nodes.map((node) => node.id)).toEqual([1, 2]);
    expect(result.current.selectedNodeId).toBe(2);
  });

  it("同じ batch で削除した親には子を作成せず成功IDを返さない", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    let childId!: number | null;
    act(() => {
      result.current.deleteNode(1);
      childId = result.current.addChildNode(1);
    });

    expect(childId).toBeNull();
    expect(result.current.nodes).toEqual([]);
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("同じ batch で削除した基点には兄弟を作成せず成功IDを返さない", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    let siblingId!: number | null;
    act(() => {
      result.current.deleteNode(1);
      siblingId = result.current.addSiblingNode(1);
    });

    expect(siblingId).toBeNull();
    expect(result.current.nodes).toEqual([]);
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("同じ batch 内で子ノードを追加しても両方を追加する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    act(() => {
      result.current.addChildNode(1);
      result.current.addChildNode(1);
    });

    expect(result.current.nodes.map((node) => node.parentId)).toEqual([null, 1, 1]);
    expect(result.current.selectedNodeId).toBe(3);
  });

  it("同じ batch 内で兄弟ノードを追加しても両方を追加する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    act(() => {
      result.current.addSiblingNode(1);
      result.current.addSiblingNode(1);
    });

    expect(result.current.nodes.map((node) => node.parentId)).toEqual([null, null, null]);
    expect(result.current.selectedNodeId).toBe(3);
  });

  it("ノード更新後もツリー操作コールバックの参照を維持する", () => {
    jest.spyOn(Date, "now").mockReturnValue(1);
    const { result } = renderHook(() => useNodes());
    const initialCallbacks = {
      addChildNode: result.current.addChildNode,
      addSiblingNode: result.current.addSiblingNode,
      connectNodes: result.current.connectNodes,
      deleteNode: result.current.deleteNode,
    };

    act(() => result.current.addNode(100, 100));
    act(() => result.current.moveNode(1, 200, 200));

    expect(result.current.addChildNode).toBe(initialCallbacks.addChildNode);
    expect(result.current.addSiblingNode).toBe(initialCallbacks.addSiblingNode);
    expect(result.current.connectNodes).toBe(initialCallbacks.connectNodes);
    expect(result.current.deleteNode).toBe(initialCallbacks.deleteNode);
  });

  it("初回取得した作成コールバックは最新の確定済みノードを参照する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    const addChildNode = result.current.addChildNode;
    const addSiblingNode = result.current.addSiblingNode;

    act(() => result.current.addNode(100, 100));
    let childId!: number | null;
    act(() => {
      childId = addChildNode(1);
    });
    let siblingId!: number | null;
    act(() => {
      siblingId = addSiblingNode(2);
    });

    expect(childId).toBe(2);
    expect(siblingId).toBe(3);
    expect(result.current.nodes.map((node) => node.parentId)).toEqual([null, 1, 1]);
  });

  it("初回取得した削除コールバックは最新ツリーの子孫も削除する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    const deleteNode = result.current.deleteNode;

    act(() => result.current.addNode(100, 100));
    act(() => result.current.addChildNode(1));
    act(() => result.current.addChildNode(2));
    act(() => deleteNode(1));

    expect(result.current.nodes).toEqual([]);
  });

  it("connectNodes は既存ノードを親子接続し、子ノードを選択する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(300, 100);
    });
    let connected!: boolean;
    act(() => {
      connected = result.current.connectNodes(1, 2);
    });

    expect(connected).toBe(true);
    expect(result.current.nodes[1].parentId).toBe(1);
    expect(result.current.selectedNodeId).toBe(2);
  });

  it("connectNodes は子ノードの既存の親を新しい親へ付け替える", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
      result.current.addNode(500, 100);
    });
    act(() => result.current.connectNodes(3, 2));

    expect(result.current.nodes.find((node) => node.id === 2)?.parentId).toBe(3);
  });

  it("connectNodes は循環接続を拒否してノードと選択を維持する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addChildNode(1);
      result.current.selectNode(1);
    });
    const nodesBeforeConnection = result.current.nodes;
    let connected!: boolean;
    act(() => {
      connected = result.current.connectNodes(2, 1);
    });

    expect(connected).toBe(false);
    expect(result.current.nodes).toBe(nodesBeforeConnection);
    expect(result.current.selectedNodeId).toBe(1);
  });

  it("connectNodes は同じ batch で作成したノードを接続できる", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    let connected!: boolean;

    act(() => {
      const parentId = result.current.addNode(100, 100);
      const childId = result.current.addNode(300, 100);
      connected = result.current.connectNodes(parentId, childId);
    });

    expect(connected).toBe(true);
    expect(result.current.nodes.map((node) => node.parentId)).toEqual([null, 1]);
  });

  it("初回取得した connectNodes は最新の確定済みノードを接続する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());
    const connectNodes = result.current.connectNodes;

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(300, 100);
    });
    let connected!: boolean;
    act(() => {
      connected = connectNodes(1, 2);
    });

    expect(connected).toBe(true);
    expect(result.current.nodes[1].parentId).toBe(1);
  });
});
