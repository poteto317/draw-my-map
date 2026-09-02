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

  it("moveNode は指定ノードだけを移動する", () => {
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
      deleteNode: result.current.deleteNode,
    };

    act(() => result.current.addNode(100, 100));
    act(() => result.current.moveNode(1, 200, 200));

    expect(result.current.addChildNode).toBe(initialCallbacks.addChildNode);
    expect(result.current.addSiblingNode).toBe(initialCallbacks.addSiblingNode);
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
});
