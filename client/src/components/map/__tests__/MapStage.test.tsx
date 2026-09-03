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
  target?: unknown;
  shiftKey?: boolean;
};

type MockPointerHandler = (event: MockPointerEvent) => void;
type StageEvent = "pointerdown" | "pointermove" | "pointerup" | "pointerupoutside";

const mockStageHandlers: Partial<Record<StageEvent, MockPointerHandler>> = {};
const mockNodePointerHandlers: Array<Partial<Record<"pointerdown", MockPointerHandler>>> = [];

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
    mockNodePointerHandlers.push(handlers);
    return {
      addChild: jest.fn(),
      on: jest.fn((event: "pointerdown", handler: MockPointerHandler) => {
        handlers[event] = handler;
      }),
      eventMode: "none",
      cursor: "default",
    };
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
  onConnectNodes: jest.fn(() => true),
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
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("MapStage boundary", () => {
  it("renders the map container", async () => {
    await renderReady(<MapStage {...defaultProps} />);

    expect(document.querySelector(".cursor-crosshair")).toBeInTheDocument();
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
      mockNodePointerHandlers[0].pointerdown?.({ globalX: 100, globalY: 60 });
      mockStageHandlers.pointermove?.({ globalX: 104, globalY: 64 });
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
      mockNodePointerHandlers[0].pointerdown?.({
        globalX: 100,
        globalY: 60,
        shiftKey: true,
      });
      mockStageHandlers.pointermove?.({ globalX: 220, globalY: 120 });
      mockStageHandlers.pointerup?.({ globalX: 220, globalY: 120 });
    });

    const nodes = JSON.parse(getByTestId("node-state").textContent ?? "[]") as Node[];
    expect(nodes.find((node) => node.id === 2)?.parentId).toBe(1);
    expect(getByTestId("selected-node-id")).toHaveTextContent("2");
  });
});
