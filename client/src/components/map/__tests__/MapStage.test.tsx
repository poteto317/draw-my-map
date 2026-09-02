import { act, fireEvent, render } from "@testing-library/react";
import { useEffect, useRef, type ReactElement } from "react";
import { MapStage } from "@/components/map/MapStage";
import { useNodes } from "@/hooks/useNodes";
import type { Node } from "@/types/node";

const mockStage = {
  removeChildren: jest.fn(() => []),
  addChild: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
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
  Container: jest.fn().mockImplementation(() => ({
    addChild: jest.fn(),
    on: jest.fn(),
    eventMode: "none",
    cursor: "default",
  })),
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
        onDeleteNode={deleteNode}
      />
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
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
});
