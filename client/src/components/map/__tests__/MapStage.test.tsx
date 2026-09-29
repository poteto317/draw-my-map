import { act, fireEvent } from "@testing-library/react";
import {
  Suspense,
  startTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { MapStage } from "@/components/map/MapStage";
import {
  lastWorldContainer,
  mockContainers,
  mockNodePointerHandlers,
  mockStage,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { AutoLayoutMapStageHarness } from "@/components/map/testing/AutoLayoutMapStageHarness";
import { CHILD_HORIZONTAL_GAP } from "@/config/shapes";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

const defaultProps = {
  nodes: [] as Node[],
  selectedNodeId: null as number | null,
  onDoubleClick: jest.fn(),
  onAddChildNode: jest.fn(() => null),
  onAddSiblingNode: jest.fn(() => null),
  onSelectNode: jest.fn(),
  onUpdateLabel: jest.fn(),
  onMoveNode: jest.fn(),
  onConnectNodes: jest.fn(),
  onDeleteNode: jest.fn(),
};

const sampleNodes: Node[] = [
  createTestNode({ id: 1, x: 50, y: 30, label: "ノード1" }),
  createTestNode({ id: 2, x: 200, y: 100, label: "ノード2" }),
];

function KeyboardCreationHarness({ initiallySelected = true }: { initiallySelected?: boolean }) {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    connectNodes,
    deleteNode,
  } = useNodes();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const rootId = addNode(100, 60);
    if (initiallySelected) selectNode(rootId);
  }, [addNode, initiallySelected, selectNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}

function MouseConnectionHarness() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    connectNodes,
    deleteNode,
  } = useNodes();
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    addNode(50, 30);
    addNode(200, 100);
  }, [addNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}

function SubtreeMoveHarness() {
  const {
    nodes,
    selectedNodeId,
    addNode,
    addChildNode,
    addSiblingNode,
    selectNode,
    updateNodeLabel,
    moveNode,
    connectNodes,
    deleteNode,
  } = useNodes();
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const rootId = addNode(100, 100);
    const childId = addChildNode(rootId)!;
    addChildNode(childId);
    addNode(600, 100);
  }, [addNode, addChildNode]);

  return (
    <>
      <MapStage
        nodes={nodes}
        selectedNodeId={selectedNodeId}
        onDoubleClick={addNode}
        onAddChildNode={addChildNode}
        onAddSiblingNode={addSiblingNode}
        onSelectNode={selectNode}
        onUpdateLabel={updateNodeLabel}
        onMoveNode={moveNode}
        onConnectNodes={connectNodes}
        onDeleteNode={deleteNode}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
    </>
  );
}

const pendingRender = new Promise<never>(() => {});

function SuspendPendingRender(): never {
  throw pendingRender;
}

type ConcurrentInteractionHarnessProps = {
  onReady: (startUpdate: () => void) => void;
  committedNode: Node;
  pendingNode: Node;
  committedOnSelectNode: (id: number | null) => void;
  pendingOnSelectNode: (id: number | null) => void;
  committedOnMoveNode: (id: number, x: number, y: number) => void;
  pendingOnMoveNode: (id: number, x: number, y: number) => void;
};

function ConcurrentInteractionHarness({
  onReady,
  committedNode,
  pendingNode,
  committedOnSelectNode,
  pendingOnSelectNode,
  committedOnMoveNode,
  pendingOnMoveNode,
}: ConcurrentInteractionHarnessProps) {
  const [isPendingRender, setIsPendingRender] = useState(false);

  useEffect(() => {
    onReady(() => {
      startTransition(() => setIsPendingRender(true));
    });
  }, [onReady]);

  return (
    <Suspense fallback={null}>
      <MapStage
        {...defaultProps}
        nodes={[isPendingRender ? pendingNode : committedNode]}
        onSelectNode={isPendingRender ? pendingOnSelectNode : committedOnSelectNode}
        onMoveNode={isPendingRender ? pendingOnMoveNode : committedOnMoveNode}
      />
      {isPendingRender && <SuspendPendingRender />}
    </Suspense>
  );
}

type ResetTimingHarnessProps = {
  onReady: (reset: () => void) => void;
  onMoveNode: (id: number, x: number, y: number) => void;
};

function ResetTimingHarness({ onReady, onMoveNode }: ResetTimingHarnessProps) {
  const [resetRevision, setResetRevision] = useState(0);

  useEffect(() => {
    onReady(() => setResetRevision((revision) => revision + 1));
  }, [onReady]);

  useLayoutEffect(() => {
    if (resetRevision === 0) return;
    mockStageHandlers.pointermove?.(pointer(140, 100));
    mockStageHandlers.pointerup?.(pointer(140, 100));
  }, [resetRevision]);

  return (
    <MapStage
      {...defaultProps}
      nodes={sampleNodes}
      resetRevision={resetRevision}
      onMoveNode={onMoveNode}
    />
  );
}

beforeEach(() => {
  resetMapStageTestRuntime();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStage boundary", () => {
  it("renders the map container", async () => {
    await renderReady(<MapStage {...defaultProps} />);

    expect(document.querySelector(".cursor-crosshair")).toBeInTheDocument();
  });

  it("unmount時に共有runtimeへ登録したstage listenerを解除する", async () => {
    const { unmount } = await renderReady(<MapStage {...defaultProps} />);
    const registeredHandlers = Object.entries(mockStageHandlers);

    expect(registeredHandlers.length).toBeGreaterThan(0);
    unmount();

    for (const [event, handler] of registeredHandlers) {
      expect(mockStage.off).toHaveBeenCalledWith(event, handler);
    }
    expect(Object.keys(mockStageHandlers)).toHaveLength(0);
  });

  it("親要素の実寸高を使い固定header高へ依存しない", async () => {
    await renderReady(<MapStage {...defaultProps} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;

    expect(container).toHaveClass("h-full");
    expect(container.style.minHeight).toBe("");
  });

  it("routes a blank double-click with container-relative coordinates", async () => {
    const onDoubleClick = jest.fn();
    await renderReady(<MapStage {...defaultProps} onDoubleClick={onDoubleClick} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container, 100, 50);

    fireEvent.doubleClick(container, { clientX: 300, clientY: 200 });

    expect(onDoubleClick).toHaveBeenCalledTimes(1);
    expect(onDoubleClick).toHaveBeenCalledWith(200, 150);
  });

  it("変換後座標が非有限のdouble-clickでは追加も編集もしない", async () => {
    const onDoubleClick = jest.fn();
    const { queryByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onDoubleClick={onDoubleClick} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container, -Number.MAX_VALUE, 0);

    fireEvent.doubleClick(container, { clientX: Number.MAX_VALUE, clientY: 0 });

    expect(onDoubleClick).not.toHaveBeenCalled();
    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
  });

  it("opens the editor for a node double-click", async () => {
    const { getByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

    expect(getByTestId("node-label-input")).toHaveValue("ノード1");
  });

  it("wheelでpointer位置をanchorにworld containerを拡大する", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 100,
        clientY: 100,
        deltaY: -100,
        cancelable: true,
      }));
    });

    expect(lastWorldContainer()?.scale.set).toHaveBeenCalledWith(Math.exp(0.1));
  });

  it("viewport更新ではworld containerを再生成せずtransformだけ変更する", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} />);
    const worldContainer = lastWorldContainer();
    const containerCount = mockContainers.length;
    const sceneAddCount = mockStage.addChild.mock.calls.length;

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
    });

    expect(lastWorldContainer()).toBe(worldContainer);
    expect(mockContainers).toHaveLength(containerCount);
    expect(mockStage.addChild).toHaveBeenCalledTimes(sceneAddCount);
    expect(worldContainer?.position.set).toHaveBeenLastCalledWith(20, 10);
  });

  it("scene再生成とviewport更新が同じcommitでもtransformを1回だけ適用する", async () => {
    const { rerender } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      rerender(
        <MapStage
          {...defaultProps}
          nodes={[...sampleNodes, createTestNode({
            id: 3,
            parentId: null,
            x: 300,
            y: 200,
            width: 100,
            height: 60,
            label: "追加ノード",
          })]}
        />,
      );
    });

    const updatedWorldContainer = lastWorldContainer();
    expect(updatedWorldContainer?.position.set).toHaveBeenCalledTimes(1);
    expect(updatedWorldContainer?.position.set).toHaveBeenCalledWith(20, 10);
    expect(updatedWorldContainer?.scale.set).toHaveBeenCalledTimes(1);
  });

  it("パン後の空白double-clickを変換済みworld座標で追加へ渡す", async () => {
    const onDoubleClick = jest.fn();
    await renderReady(<MapStage {...defaultProps} onDoubleClick={onDoubleClick} />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      mockStageHandlers.pointerup?.(pointer(20, 10));
    });
    fireEvent.doubleClick(container, { clientX: 220, clientY: 110 });

    expect(onDoubleClick).toHaveBeenCalledWith(200, 100);
  });

  it("ズーム後の変換済みnode位置でdouble-click編集を開始する", async () => {
    const { getByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );
    const canvas = document.querySelector("canvas")!;
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(canvas);
    mockStageBounds(container);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -10000,
        cancelable: true,
      }));
    });
    fireEvent.doubleClick(container, { clientX: 400, clientY: 240 });

    expect(getByTestId("node-label-input")).toHaveValue("ノード1");
  });

  it("ズーム後の画面差分をworld差分へ変換してノードを移動する", async () => {
    const onMoveNode = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onMoveNode={onMoveNode} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -10000,
        cancelable: true,
      }));
    });
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(400, 240));
      mockStageHandlers.pointermove?.(pointer(440, 280));
    });

    expect(onMoveNode).toHaveBeenCalledWith(1, 60, 40);
  });

  it("ズーム後の画面座標から接続先ノードを判定する", async () => {
    const onConnectNodes = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onConnectNodes={onConnectNodes} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -10000,
        cancelable: true,
      }));
    });
    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(400, 240, { shiftKey: true }));
      mockStageHandlers.pointermove?.(pointer(1000, 520));
      mockStageHandlers.pointerup?.(pointer(1000, 520));
    });

    expect(onConnectNodes).toHaveBeenCalledWith(1, 2);
  });

  it("wheelズーム前に進行中のノード移動をキャンセルする", async () => {
    const onMoveNode = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onMoveNode={onMoveNode} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
    });
    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -100,
        cancelable: true,
      }));
    });
    act(() => {
      mockStageHandlers.pointermove?.(pointer(120, 80));
      mockStageHandlers.pointerup?.(pointer(120, 80));
    });

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("wheelズーム前に進行中のノード接続をキャンセルする", async () => {
    const onConnectNodes = jest.fn();
    await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} onConnectNodes={onConnectNodes} />,
    );
    const canvas = document.querySelector("canvas")!;
    mockStageBounds(canvas);

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60, { shiftKey: true }));
    });
    await act(async () => {
      canvas.dispatchEvent(new WheelEvent("wheel", {
        clientX: 0,
        clientY: 0,
        deltaY: -100,
        cancelable: true,
      }));
    });
    act(() => {
      mockStageHandlers.pointermove?.(pointer(250, 130));
      mockStageHandlers.pointerup?.(pointer(250, 130));
    });

    expect(onConnectNodes).not.toHaveBeenCalled();
  });

  it("Fキーで倍率を保ち選択ノードを中央へ移す", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);

    fireEvent.keyDown(window, { key: "f" });

    expect(lastWorldContainer()?.position.set).toHaveBeenCalledWith(300, 240);
    expect(lastWorldContainer()?.scale.set).toHaveBeenCalledWith(1);
  });

  it("gesture中のFキーではviewportを変更しない", async () => {
    await renderReady(<MapStage {...defaultProps} nodes={sampleNodes} selectedNodeId={1} />);
    const worldContainerBeforeKeyDown = lastWorldContainer();
    const event = new KeyboardEvent("keydown", { key: "f", cancelable: true });

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      window.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(false);
    expect(lastWorldContainer()).toBe(worldContainerBeforeKeyDown);
    expect(worldContainerBeforeKeyDown?.position.set).toHaveBeenCalledTimes(1);
    expect(worldContainerBeforeKeyDown?.position.set).toHaveBeenLastCalledWith(0, 0);
  });

  it("preserves the current draft when the editing input is double-clicked", async () => {
    const { getByTestId } = await renderReady(
      <MapStage {...defaultProps} nodes={sampleNodes} />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
    const input = getByTestId("node-label-input");

    fireEvent.change(input, { target: { value: "編集中の下書き" } });
    fireEvent.doubleClick(input, { clientX: 100, clientY: 60 });

    expect(input).toHaveValue("編集中の下書き");
  });

  it("マップ置換時に編集中draftとviewportと進行中gestureを同期リセットする", async () => {
    const onMoveNode = jest.fn();
    const onUpdateLabel = jest.fn();
    const { getByTestId, queryByTestId, rerender } = await renderReady(
      <MapStage
        {...defaultProps}
        nodes={sampleNodes}
        resetRevision={0}
        onMoveNode={onMoveNode}
        onUpdateLabel={onUpdateLabel}
      />,
    );
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });
    fireEvent.change(getByTestId("node-label-input"), {
      target: { value: "古い下書き" },
    });
    act(() => {
      mockStageHandlers.pointerdown?.(pointer(0, 0, { target: mockStage }));
      mockStageHandlers.pointermove?.(pointer(20, 10));
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      rerender(
        <MapStage
          {...defaultProps}
          nodes={[{ ...sampleNodes[0], label: "読込後" }, sampleNodes[1]]}
          resetRevision={1}
          onMoveNode={onMoveNode}
          onUpdateLabel={onUpdateLabel}
        />,
      );
    });

    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
    expect(onUpdateLabel).not.toHaveBeenCalled();
    expect(lastWorldContainer()?.position.set).toHaveBeenLastCalledWith(0, 0);
    expect(lastWorldContainer()?.scale.set).toHaveBeenLastCalledWith(1);
    act(() => {
      mockStageHandlers.pointermove?.(pointer(140, 100));
      mockStageHandlers.pointerup?.(pointer(140, 100));
    });
    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("親layout effectより前に古いgestureをキャンセルする", async () => {
    const onMoveNode = jest.fn();
    let reset!: () => void;
    await renderReady(
      <ResetTimingHarness
        onReady={(command) => {
          reset = command;
        }}
        onMoveNode={onMoveNode}
      />,
    );

    act(() => {
      mockNodePointerHandlers.at(-2)?.pointerdown?.(pointer(100, 60));
      reset();
    });

    expect(onMoveNode).not.toHaveBeenCalled();
  });

  it("破棄された render の操作参照をコミット済みの値へ漏らさない", async () => {
    const committedOnSelectNode = jest.fn();
    const pendingOnSelectNode = jest.fn();
    const committedOnMoveNode = jest.fn();
    const pendingOnMoveNode = jest.fn();
    const committedNode = sampleNodes[0];
    const pendingNode = { ...committedNode, x: 500, y: 400 };
    let startPendingUpdate!: () => void;

    await renderReady(
      <ConcurrentInteractionHarness
        onReady={(startUpdate) => {
          startPendingUpdate = startUpdate;
        }}
        committedNode={committedNode}
        pendingNode={pendingNode}
        committedOnSelectNode={committedOnSelectNode}
        pendingOnSelectNode={pendingOnSelectNode}
        committedOnMoveNode={committedOnMoveNode}
        pendingOnMoveNode={pendingOnMoveNode}
      />,
    );

    act(() => startPendingUpdate());
    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(pointer(100, 60));
      mockStageHandlers.pointermove?.(pointer(104, 64));
    });

    expect(pendingOnSelectNode).not.toHaveBeenCalled();
    expect(pendingOnMoveNode).not.toHaveBeenCalled();
    expect(committedOnSelectNode).toHaveBeenCalledWith(committedNode.id);
    expect(committedOnMoveNode).toHaveBeenCalledWith(committedNode.id, 54, 34);
  });

  it.each([
    ["Tab", 1],
    ["Enter", null],
  ])("uses real useNodes to create and edit a node with %s", async (key, expectedParentId) => {
    let nextNodeId = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++nextNodeId);
    const { getByTestId } = await renderReady(<KeyboardCreationHarness />);
    const [source] = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];

    fireEvent.keyDown(window, { key });

    let nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const created = nodes[1];
    expect(nodes).toHaveLength(2);
    expect(created.parentId).toBe(expectedParentId === null ? source.parentId : source.id);
    expect(getByTestId("selected-node-id")).toHaveTextContent(String(created.id));
    const input = getByTestId("node-label-input");
    expect(input).toHaveValue("");

    fireEvent.change(input, { target: { value: "作成したノード" } });
    fireEvent.keyDown(input, { key: "Enter" });

    nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes).toHaveLength(2);
    expect(nodes[1].label).toBe("作成したノード");
  });

  it.each(["Tab", "Enter"])("suppresses %s when no node is selected", async (key) => {
    const { getByTestId, queryByTestId } = await renderReady(
      <KeyboardCreationHarness initiallySelected={false} />,
    );

    fireEvent.keyDown(window, { key });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes).toHaveLength(1);
    expect(getByTestId("selected-node-id")).toHaveTextContent("");
    expect(queryByTestId("node-label-input")).not.toBeInTheDocument();
  });

  it.each(["Tab", "Delete", "Backspace"])("suppresses %s while editing", async (key) => {
    const { getByTestId } = await renderReady(<KeyboardCreationHarness />);
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);
    fireEvent.doubleClick(container, { clientX: 100, clientY: 60 });

    fireEvent.keyDown(getByTestId("node-label-input"), { key });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes).toHaveLength(1);
  });

  it("Shiftドラッグで実際のノード状態を親子接続する", async () => {
    let nextNodeId = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++nextNodeId);
    const { getByTestId } = await renderReady(<MouseConnectionHarness />);

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(pointer(100, 60, { shiftKey: true }));
      mockStageHandlers.pointermove?.(pointer(220, 120));
      mockStageHandlers.pointerup?.(pointer(220, 120));
    });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes.find((node) => node.id === 2)?.parentId).toBe(1);
    expect(getByTestId("selected-node-id")).toHaveTextContent("2");
  });

  it("親ノードのpointer dragで子孫だけを同じ差分だけ移動する", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<SubtreeMoveHarness />);
    const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const root = before[0];

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(pointer(root.x + 10, root.y + 10));
      mockStageHandlers.pointermove?.(pointer(root.x + 30, root.y + 25));
      mockStageHandlers.pointerup?.(pointer(root.x + 30, root.y + 25));
    });

    const after = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    for (const nodeId of [1, 2, 3]) {
      const oldNode = before.find((node) => node.id === nodeId)!;
      const movedNode = after.find((node) => node.id === nodeId)!;
      expect(movedNode).toMatchObject({ x: oldNode.x + 20, y: oldNode.y + 15 });
    }
    expect(after.find((node) => node.id === 4)).toEqual(before.find((node) => node.id === 4));
  });

  it("自動モードでShift接続した子を親の右列へ再配置する", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
    const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const parent = before.find((node) => node.id === 1)!;
    const child = before.find((node) => node.id === 2)!;

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(
        pointer(parent.x + 10, parent.y + 10, { shiftKey: true }),
      );
      mockStageHandlers.pointermove?.(pointer(child.x + 10, child.y + 10));
      mockStageHandlers.pointerup?.(pointer(child.x + 10, child.y + 10));
    });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const connectedParent = nodes.find((node) => node.id === 1)!;
    const connectedChild = nodes.find((node) => node.id === 2)!;
    expect(connectedChild.parentId).toBe(connectedParent.id);
    expect(connectedChild.x).toBe(
      connectedParent.x + connectedParent.width + CHILD_HORIZONTAL_GAP,
    );
  });

  it("自動モードのpointer dragではノード座標を変更しない", async () => {
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
    const before = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const root = before[0];

    act(() => {
      mockNodePointerHandlers[0].pointerdown?.(
        pointer(root.x + 10, root.y + 10),
      );
      mockStageHandlers.pointermove?.(pointer(root.x + 80, root.y + 90));
      mockStageHandlers.pointerup?.(pointer(root.x + 80, root.y + 90));
    });

    const after = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(after.map(({ x, y }) => ({ x, y }))).toEqual(
      before.map(({ x, y }) => ({ x, y })),
    );
  });

  it("自動モードで離れた位置に追加したルートを既存列へ整列する", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);
    const before = JSON.parse(
      getByTestId("node-state").textContent ?? "[]",
    ) as Node[];
    const firstRoot = before.find((node) => node.id === 1)!;
    const container = document.querySelector(".cursor-crosshair") as HTMLElement;
    mockStageBounds(container);

    fireEvent.doubleClick(container, { clientX: 700, clientY: 500 });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    const addedRoot = nodes.find((node) => node.id === 3)!;
    expect(addedRoot.parentId).toBeNull();
    expect(addedRoot.x).toBe(firstRoot.x);
    expect(addedRoot.x).not.toBe(650);
  });

  it("自動モードで兄弟削除後に残った兄弟を親の中央へ戻す", async () => {
    let id = 0;
    jest.spyOn(Date, "now").mockImplementation(() => ++id);
    const { getByTestId } = await renderReady(<AutoLayoutMapStageHarness />);

    fireEvent.keyDown(window, { key: "Tab" });
    fireEvent.keyDown(getByTestId("node-label-input"), { key: "Enter" });
    fireEvent.keyDown(window, { key: "Enter" });

    const beforeDelete = JSON.parse(
      getByTestId("node-state").textContent ?? "[]",
    ) as Node[];
    const rootBeforeDelete = beforeDelete.find((node) => node.id === 1)!;
    const remainingChildBeforeDelete = beforeDelete.find((node) => node.id === 3)!;
    expect(remainingChildBeforeDelete.y).not.toBe(rootBeforeDelete.y);

    fireEvent.keyDown(getByTestId("node-label-input"), { key: "Enter" });
    fireEvent.keyDown(window, { key: "Delete" });

    const nodes = JSON.parse(
      getByTestId("node-state").textContent ?? "[]",
    ) as Node[];
    const remainingChild = nodes.find((node) => node.id === 3)!;
    expect(nodes.map((node) => node.id)).toEqual([1, 2, 3]);
    expect(remainingChild).toMatchObject({
      parentId: rootBeforeDelete.id,
      y: rootBeforeDelete.y,
    });
  });
});
