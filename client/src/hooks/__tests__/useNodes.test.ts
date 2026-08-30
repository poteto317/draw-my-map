import { renderHook, act } from "@testing-library/react";
import { useNodes } from "@/hooks/useNodes";
import { RECT_WIDTH, RECT_HEIGHT } from "@/config/shapes";

describe("useNodes", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Production break caught: addNode does not return the created ID or set root parentId to null.
  it("addNode は parentId が null のルートノードを作成し、そのIDを返す", () => {
    jest.spyOn(Date, "now").mockReturnValue(101);
    const { result } = renderHook(() => useNodes());
    let createdId!: number;

    act(() => {
      createdId = result.current.addNode(200, 150);
    });

    expect(createdId).toBe(101);
    expect(result.current.nodes[0]).toMatchObject({
      id: 101,
      parentId: null,
    });
    jest.restoreAllMocks();
  });

  it("初期状態では nodes が空配列である", () => {
    const { result } = renderHook(() => useNodes());
    expect(result.current.nodes).toEqual([]);
  });

  it("addNode を呼ぶと nodes に1件追加される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(200, 150);
    });

    expect(result.current.nodes).toHaveLength(1);
  });

  it("追加した node の位置はクリック座標を中心とした左上座標になる", () => {
    const { result } = renderHook(() => useNodes());
    const clickX = 200;
    const clickY = 150;

    act(() => {
      result.current.addNode(clickX, clickY);
    });

    const node = result.current.nodes[0];
    expect(node.x).toBe(clickX - RECT_WIDTH / 2);
    expect(node.y).toBe(clickY - RECT_HEIGHT / 2);
  });

  it("追加した node のサイズは定数値と一致する", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(0, 0);
    });

    const node = result.current.nodes[0];
    expect(node.width).toBe(RECT_WIDTH);
    expect(node.height).toBe(RECT_HEIGHT);
  });

  it("追加した node の label は空文字である", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    expect(result.current.nodes[0].label).toBe("");
  });

  it("addNode を複数回呼ぶと nodes が蓄積される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
      result.current.addNode(300, 300);
    });

    expect(result.current.nodes).toHaveLength(3);
  });

  it("各 node の id はユニークな数値である", () => {
    let counter = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++counter);

    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
    });

    const ids = result.current.nodes.map((n) => n.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(2);
    ids.forEach((id) => expect(typeof id).toBe("number"));

    jest.restoreAllMocks();
  });

  it("初期状態では selectedNodeId が null である", () => {
    const { result } = renderHook(() => useNodes());
    expect(result.current.selectedNodeId).toBeNull();
  });

  it("selectNode で指定した id が selectedNodeId にセットされる", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    const nodeId = result.current.nodes[0].id;

    act(() => {
      result.current.selectNode(nodeId);
    });

    expect(result.current.selectedNodeId).toBe(nodeId);
  });

  it("selectNode(null) で選択が解除される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    act(() => {
      result.current.selectNode(result.current.nodes[0].id);
    });

    act(() => {
      result.current.selectNode(null);
    });

    expect(result.current.selectedNodeId).toBeNull();
  });

  it("updateNodeLabel で指定したノードの label が更新される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    const nodeId = result.current.nodes[0].id;

    act(() => {
      result.current.updateNodeLabel(nodeId, "更新ラベル");
    });

    expect(result.current.nodes[0].label).toBe("更新ラベル");
  });

  it("updateNodeLabel は他のノードに影響しない", () => {
    let counter = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++counter);

    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
    });

    const firstNodeId = result.current.nodes[0].id;

    act(() => {
      result.current.updateNodeLabel(firstNodeId, "変更済み");
    });

    expect(result.current.nodes[0].label).toBe("変更済み");
    expect(result.current.nodes[1].label).toBe("");

    jest.restoreAllMocks();
  });

  it("moveNode で指定したノードの座標が更新される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    const nodeId = result.current.nodes[0].id;

    act(() => {
      result.current.moveNode(nodeId, 300, 250);
    });

    expect(result.current.nodes[0].x).toBe(300);
    expect(result.current.nodes[0].y).toBe(250);
  });

  it("moveNode は他のノードに影響しない", () => {
    let counter = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++counter);

    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
    });

    const originalX = result.current.nodes[1].x;
    const originalY = result.current.nodes[1].y;

    act(() => {
      result.current.moveNode(result.current.nodes[0].id, 500, 500);
    });

    expect(result.current.nodes[0].x).toBe(500);
    expect(result.current.nodes[1].x).toBe(originalX);
    expect(result.current.nodes[1].y).toBe(originalY);

    jest.restoreAllMocks();
  });

  it("deleteNode で指定したノードが削除される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    const nodeId = result.current.nodes[0].id;

    act(() => {
      result.current.deleteNode(nodeId);
    });

    expect(result.current.nodes).toHaveLength(0);
  });

  it("deleteNode で削除されたノードが選択中の場合、選択が解除される", () => {
    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
    });

    const nodeId = result.current.nodes[0].id;

    act(() => {
      result.current.selectNode(nodeId);
    });

    expect(result.current.selectedNodeId).toBe(nodeId);

    act(() => {
      result.current.deleteNode(nodeId);
    });

    expect(result.current.selectedNodeId).toBeNull();
  });

  it("deleteNode は他のノードに影響しない", () => {
    let counter = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++counter);

    const { result } = renderHook(() => useNodes());

    act(() => {
      result.current.addNode(100, 100);
      result.current.addNode(200, 200);
    });

    const firstId = result.current.nodes[0].id;

    act(() => {
      result.current.deleteNode(firstId);
    });

    expect(result.current.nodes).toHaveLength(1);
    expect(result.current.nodes[0].id).not.toBe(firstId);

    jest.restoreAllMocks();
  });

  it("deleteNode は対象ノードとすべての子孫を削除する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const rootId = result.current.nodes[0].id;
    act(() => result.current.addChildNode(rootId));
    const childId = result.current.nodes[1].id;
    act(() => result.current.addChildNode(childId));
    act(() => result.current.addNode(500, 100));
    const unrelatedRootId = result.current.nodes[3].id;

    act(() => result.current.deleteNode(rootId));

    expect(result.current.nodes.map((node) => node.id)).toEqual([unrelatedRootId]);
  });

  it("削除する子孫が選択中なら選択を解除する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const rootId = result.current.nodes[0].id;
    act(() => result.current.addChildNode(rootId));
    const childId = result.current.nodes[1].id;
    act(() => result.current.selectNode(childId));
    act(() => result.current.deleteNode(rootId));

    expect(result.current.selectedNodeId).toBeNull();
  });

  it("addChildNode は親の右側に子を作成して選択する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const parent = result.current.nodes[0];
    let childId!: number | null;
    act(() => {
      childId = result.current.addChildNode(parent.id);
    });

    expect(childId).toBe(2);
    expect(result.current.nodes[1]).toMatchObject({
      id: 2,
      parentId: parent.id,
      x: parent.x + parent.width + 120,
      y: parent.y,
    });
    expect(result.current.selectedNodeId).toBe(2);
  });

  it("2個目の子は既存兄弟の最下部から40px下へ配置する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const parentId = result.current.nodes[0].id;
    act(() => result.current.addChildNode(parentId));
    const firstChild = result.current.nodes[1];
    act(() => result.current.addChildNode(parentId));

    expect(result.current.nodes[2].y).toBe(firstChild.y + firstChild.height + 40);
  });

  it("存在しない親には子ノードを作成しない", () => {
    const { result } = renderHook(() => useNodes());
    let createdId!: number | null;
    act(() => {
      createdId = result.current.addChildNode(999);
    });
    expect(createdId).toBeNull();
    expect(result.current.nodes).toEqual([]);
  });

  it("addSiblingNode は同じ親を持つ兄弟を最下部へ追加する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const parentId = result.current.nodes[0].id;
    act(() => result.current.addChildNode(parentId));
    const firstChild = result.current.nodes[1];
    let siblingId!: number | null;
    act(() => {
      siblingId = result.current.addSiblingNode(firstChild.id);
    });

    const sibling = result.current.nodes[2];
    expect(siblingId).toBe(sibling.id);
    expect(sibling.parentId).toBe(parentId);
    expect(sibling.x).toBe(firstChild.x);
    expect(sibling.y).toBe(firstChild.y + firstChild.height + 40);
    expect(result.current.selectedNodeId).toBe(sibling.id);
  });

  it("ルートノードの兄弟は parentId null のルートとして追加する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const root = result.current.nodes[0];
    act(() => result.current.addSiblingNode(root.id));

    expect(result.current.nodes[1]).toMatchObject({
      parentId: null,
      x: root.x,
      y: root.y + root.height + 40,
    });
  });

  it("存在しないノードには兄弟を作成しない", () => {
    const { result } = renderHook(() => useNodes());
    let createdId!: number | null;
    act(() => {
      createdId = result.current.addSiblingNode(999);
    });
    expect(createdId).toBeNull();
    expect(result.current.nodes).toEqual([]);
  });

  it("同じ act 内の子ノード追加でも兄弟間隔を維持する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const parentId = result.current.nodes[0].id;
    act(() => {
      result.current.addChildNode(parentId);
      result.current.addChildNode(parentId);
    });

    expect(result.current.nodes[2].y).toBe(
      result.current.nodes[1].y + result.current.nodes[1].height + 40,
    );
  });

  it("同じ act 内の兄弟ノード追加でも兄弟間隔を維持する", () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { result } = renderHook(() => useNodes());

    act(() => result.current.addNode(100, 100));
    const rootId = result.current.nodes[0].id;
    act(() => {
      result.current.addSiblingNode(rootId);
      result.current.addSiblingNode(rootId);
    });

    expect(result.current.nodes[2].y).toBe(
      result.current.nodes[1].y + result.current.nodes[1].height + 40,
    );
  });
});
