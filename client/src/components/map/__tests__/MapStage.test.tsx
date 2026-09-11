import { act, fireEvent, render } from "@testing-library/react";
import {
  Suspense,
  startTransition,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { MapStage } from "@/components/map/MapStage";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";

type MockPointerEvent = {
  globalX: number;
  globalY: number;
  pointerId: number;
  pointerType: string;
  composedPath: () => unknown[];
  target?: unknown;
  shiftKey?: boolean;
  button: number;
};

type MockPointerHandler = (event: MockPointerEvent) => void;
type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside" | "pointercancel";

const mockStageHandlers: Partial<Record<StageEvent, MockPointerHandler>> = {};
const mockNodePointerHandlers: Array<Partial<Record<"pointerdown", MockPointerHandler>>> = [];
const mockContainers: Array<{
  addChild: jest.Mock;
  position: { set: jest.Mock };
  scale: { set: jest.Mock };
}> = [];

function pointer(
  globalX: number,
  globalY: number,
  options: Pick<MockPointerEvent, "shiftKey" | "target"> & { path?: unknown[] } = {},
): MockPointerEvent {
  const { path = [mockStage], ...eventOptions } = options;
  return {
    globalX,
    globalY,
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    composedPath: () => path,
    ...eventOptions,
  };
}

const mockStage = {
  removeChildren: jest.fn(() => []),
  addChild: jest.fn(),
  on: jest.fn((event: StageEvent, handler: MockPointerHandler) => {
    mockStageHandlers[event] = handler;
  }),
  off: jest.fn((event: StageEvent, handler: MockPointerHandler) => {
    if (mockStageHandlers[event] === handler) delete mockStageHandlers[event];
  }),
  eventMode: "none",
  hitArea: null as unknown,
};

jest.mock("pixi.js", () => ({
  Application: jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn(),
    canvas: document.createElement("canvas"),
    stage: mockStage,
    screen: { x: 0, y: 0, width: 800, height: 600 },
  })),
  Graphics: jest.fn().mockImplementation(() => ({
    rect: jest.fn().mockReturnThis(),
    fill: jest.fn().mockReturnThis(),
    stroke: jest.fn().mockReturnThis(),
    moveTo: jest.fn().mockReturnThis(),
    bezierCurveTo: jest.fn().mockReturnThis(),
  })),
  Text: jest.fn().mockImplementation(() => ({
    anchor: { set: jest.fn() },
    x: 0,
    y: 0,
  })),
  Container: jest.fn().mockImplementation(() => {
    const handlers: Partial<Record<"pointerdown", MockPointerHandler>> = {};
    const container = {
      addChild: jest.fn(),
      position: { set: jest.fn() },
      scale: { set: jest.fn() },
      on: jest.fn((event: "pointerdown", handler: MockPointerHandler) => {
        handlers[event] = handler;
        mockNodePointerHandlers.push(handlers);
      }),
      eventMode: "none",
      cursor: "default",
    };
    mockContainers.push(container);
    return container;
  }),
}));

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
  { id: 1, parentId: null, x: 50, y: 30, width: 100, height: 60, label: "ノード1" },
  { id: 2, parentId: null, x: 200, y: 100, width: 100, height: 60, label: "ノード2" },
];

async function renderReady(ui: ReactElement) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(ui);
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

function mockStageBounds(container: HTMLElement, left = 0, top = 0) {
  jest.spyOn(container, "getBoundingClientRect").mockReturnValue({
    left,
    top,
    right: left + 800,
    bottom: top + 600,
    width: 800,
    height: 600,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
}

function lastWorldContainer() {
  return mockContainers.findLast((container) => container.scale.set.mock.calls.length > 0);
}

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

beforeEach(() => {
  jest.clearAllMocks();
  for (const event of Object.keys(mockStageHandlers) as StageEvent[]) {
    delete mockStageHandlers[event];
  }
  mockNodePointerHandlers.length = 0;
  mockContainers.length = 0;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStage boundary", () => {
  it("renders the map container", async () => {
    await renderReady(<MapStage {...defaultProps} />);

    expect(document.querySelector(".cursor-crosshair")).toBeInTheDocument();
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
});
