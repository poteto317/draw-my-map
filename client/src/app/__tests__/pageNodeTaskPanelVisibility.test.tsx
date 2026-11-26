import { act, screen } from "@testing-library/react";
import {
  ensureCanvasNodesInteractive,
  renderPage,
  selectNode,
} from "@/app/testing/pageTestHelpers";
import {
  mockNodePointerHandlers,
  mockStageHandlers,
  pointer,
  resetMapStageTestRuntime,
} from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";
import { v3Json } from "@/app/testing/pageTestHelpers";

jest.mock("pixi.js", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createPagePixiModuleMock()
));

jest.mock("@/services/imageExport/mapTextMeasurement", () => (
  jest.requireActual<typeof import("@/app/testing/pageModuleMocks")>("@/app/testing/pageModuleMocks")
    .createMapTextMeasurementModuleMock()
));

beforeEach(() => {
  resetMapStageTestRuntime();
  window.localStorage.clear();
});

function toggleSelectNode(index: number, nodeCount: number) {
  ensureCanvasNodesInteractive(nodeCount);
  act(() => {
    mockNodePointerHandlers.at(index - nodeCount)?.pointerdown?.(pointer(0, 0, { ctrlKey: true }));
    mockStageHandlers.pointerup?.(pointer(0, 0));
  });
}

it("マップの複数選択ではタスク節を出さない", async () => {
  seedMapLibrary(localStorage, [{
    json: v3Json([
      { id: 1, label: "りんご", x: 100 },
      { id: 2, label: "みかん", x: 300 },
    ]),
  }]);
  await renderPage();
  const nodeCount = 2;
  selectNode(0, nodeCount);
  expect(screen.getByRole("button", { name: "タスクにする" })).toBeInTheDocument();
  toggleSelectNode(1, nodeCount);
  expect(screen.getByRole("group", { name: /重要度（2件選択中/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "タスクにする" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "タスク", level: 3 })).not.toBeInTheDocument();
});