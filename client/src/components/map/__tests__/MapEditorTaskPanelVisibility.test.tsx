import "@/components/map/testing/mockExchangeTextDownload";
import { act, screen } from "@testing-library/react";
import { MapEditor } from "@/components/map/MapEditor";
import {
  mockGraphicsPointerHandlers,
  mockStageBounds,
  mockStageHandlers,
  pointer,
  renderReady,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { createTestStorageSession } from "@/testing/createTestStorageSession";
import { createEmptyMapLibraryMeta } from "@/domain/mapLibrary/mapLibraryMeta";
import { Text } from "pixi.js";

jest.mock("pixi.js", () => {
  const runtime = jest.requireActual<typeof import("@/components/map/testing/mapStageTestRuntime")>(
    "@/components/map/testing/mapStageTestRuntime",
  );
  return runtime.createMockPixiModule();
});

const panelSeedJson = JSON.stringify({
  version: 3,
  layoutMode: "manual",
  nodes: [
    { id: 1, parentId: null, label: "親ルート", importance: "high", x: 100, y: 100, width: 100, height: 60 },
    { id: 2, parentId: 1, label: "子ノード", importance: "low", x: 220, y: 100, width: 100, height: 60 },
    { id: 5, parentId: null, label: "別のルート", importance: "high", x: 400, y: 100, width: 100, height: 60 },
  ],
});

function panelSeedJsonWithRelation() {
  const base = JSON.parse(panelSeedJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    relations: [{ id: 10, fromId: 1, toId: 5, kind: "related", directed: false }],
  });
}

function panelSeedJsonWithGroup() {
  const base = JSON.parse(panelSeedJson) as Record<string, unknown>;
  return JSON.stringify({
    ...base,
    groups: [{ id: 20, nodeIds: [1, 2], label: "枝束" }],
  });
}

async function renderTaskPanelEditor(initialJson: string) {
  const storage = createTestStorageSession({ initialJson });
  await renderReady(
    <MapEditor
      mapId={storage.session.mapId}
      exportButtonRef={{ current: null }}
      mapMoveTargets={[{
        id: storage.session.mapId,
        name: "テストのマップ",
        createdAt: "2026-10-31T00:00:00.000Z",
        updatedAt: "2026-10-31T00:00:00.000Z",
      }]}
      libraryMeta={createEmptyMapLibraryMeta()}
      onMoveBranchToMap={() => ({ ok: false, notice: { kind: "error", message: "移動先がありません。" } })}
      onExtractBranchToNewMap={() => ({ ok: false, notice: { kind: "error", message: "切り出せません。" } })}
      mapName="テストのマップ"
      storageSession={storage.session}
      storageMode="persistent"
      mapControls={null}
      shortcutsEnabled
      dialogMouseClickedAtRef={{ current: null }}
      pendingNavigation={null}
      onConsumePendingNavigation={() => {}}
      onSwitchToMapTarget={() => {}}
      brokenLinksDialogRequest={0}
      onBrokenLinksDialogClosed={() => {}}
      shareSession={null}
      shareSessionStatus="ready"
      shareDialogOpen={false}
      onShareDialogOpenChange={() => {}}
      onShareRequest={() => {}}
      onShareLogin={() => {}}
    />,
  );
  const stage = document.querySelector<HTMLElement>(".cursor-crosshair")!;
  mockStageBounds(stage);
}

function findInteractiveCanvasNode(label: string) {
  const textMock = jest.mocked(Text);
  const { lastWorldContainer, mockContainers } = jest.requireActual<
    typeof import("@/components/map/testing/mapStageTestRuntime")
  >("@/components/map/testing/mapStageTestRuntime");
  const worldChildren = lastWorldContainer()?.addChild.mock.calls.map(([child]) => child);
  return mockContainers.findLast((container) => worldChildren?.includes(container)
    && container.eventMode === "static"
    && container.addChild.mock.calls.some(([child]) => textMock.mock.calls.some(
      ([options], index) => typeof options === "object" && "text" in options
        && options.text === label && child === textMock.mock.results[index].value,
    )));
}

function selectCanvasNodeByLabel(label: string, ctrlKey = false) {
  const container = findInteractiveCanvasNode(label);
  expect(container).toBeDefined();
  const handler = container!.on.mock.lastCall![1];
  act(() => {
    handler(pointer(300, 200, { ctrlKey }));
    mockStageHandlers.pointerup?.(pointer(300, 200, { ctrlKey }));
  });
}

function expectTaskSectionAbsent() {
  expect(screen.queryByRole("button", { name: "タスクにする" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "タスクを保存" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "タスク", level: 3 })).not.toBeInTheDocument();
}

function expectTaskSectionVisible() {
  expect(screen.getByRole("button", { name: "タスクにする" })).toBeInTheDocument();
}

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
});

describe("MapEditor のタスク節の表示（L-061）", () => {
  it("単一選択ではタスク節を出す", async () => {
    await renderTaskPanelEditor(panelSeedJson);
    selectCanvasNodeByLabel("親ルート");
    expectTaskSectionVisible();
  });

  it("複数選択ではタスク節を出さない", async () => {
    await renderTaskPanelEditor(panelSeedJson);
    selectCanvasNodeByLabel("親ルート");
    selectCanvasNodeByLabel("別のルート", true);
    expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
    expectTaskSectionAbsent();
  });

  it("関連線選択ではタスク節を出さない", async () => {
    await renderTaskPanelEditor(panelSeedJsonWithRelation());
    const relationHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    expect(relationHandler).toBeDefined();
    act(() => {
      relationHandler?.(pointer(150, 80));
    });
    expect(screen.getByRole("heading", { name: "関連線" })).toBeInTheDocument();
    expectTaskSectionAbsent();
  });

  it("グループ選択ではタスク節を出さない", async () => {
    await renderTaskPanelEditor(panelSeedJsonWithGroup());
    const groupHandler = mockGraphicsPointerHandlers.at(-1)?.pointerdown;
    expect(groupHandler).toBeDefined();
    act(() => {
      groupHandler?.(pointer(120, 40));
    });
    expect(screen.getByRole("heading", { name: "グループ" })).toBeInTheDocument();
    expectTaskSectionAbsent();
  });
});