import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Text } from "pixi.js";
import { renderPage, selectNode, undoButton, redoButton, v3Json } from "@/app/testing/pageTestHelpers";
import { resetMapStageTestRuntime } from "@/components/map/testing/mapStageTestRuntime";
import { seedMapLibrary } from "@/testing/mapLibraryTestStorage";

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

function lastParentProgressBadge() {
  const badges = jest.mocked(Text).mock.calls
    .map((call) => (call[0] as { text?: string }).text)
    .filter((text): text is string => typeof text === "string" && /^\d+% 残\d+$/.test(text));
  return badges.at(-1);
}

const threeChildForest = v3Json([
  { id: 1, label: "親" },
  { id: 2, parentId: 1, label: "子A", x: 200, task: { completed: false } },
  { id: 3, parentId: 1, label: "子B", x: 300, y: 100, task: { completed: false } },
  { id: 4, parentId: 1, label: "子C", x: 400, y: 200, task: { completed: false } },
]);

it("子を完了保存すると Pixi とアウトラインの両方で親が 33%・残2 になり、Undo/Redo で戻る", async () => {
  seedMapLibrary(localStorage, [{ json: threeChildForest }]);
  await renderPage();
  selectNode(1, 2);
  fireEvent.click(screen.getByRole("checkbox", { name: "完了" }));
  fireEvent.click(screen.getByRole("button", { name: "タスクを保存" }));

  await waitFor(() => {
    expect(lastParentProgressBadge()).toBe("33% 残2");
  });

  fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
  expect(screen.getByRole("button", { name: /親.*完了率33%.*残り2件/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "マップ" }));
  fireEvent.click(undoButton());
  await waitFor(() => {
    expect(lastParentProgressBadge()).toBe("0% 残3");
  });
  fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
  expect(screen.getByRole("button", { name: /親.*完了率0%.*残り3件/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "マップ" }));
  fireEvent.click(redoButton());
  await waitFor(() => {
    expect(lastParentProgressBadge()).toBe("33% 残2");
  });
  fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
  expect(screen.getByRole("button", { name: /親.*完了率33%.*残り2件/ })).toBeInTheDocument();
});

it("子をタスク化して完了を保存すると親のアウトライン進捗が変わり、UndoとRedoで戻る", async () => {
  seedMapLibrary(localStorage, [{ json: v3Json([{ id: 1, label: "親" }, { id: 2, parentId: 1, label: "子", x: 300 }]) }]);
  await renderPage();
  selectNode(1, 2);
  fireEvent.click(screen.getByRole("button", { name: "タスクにする" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "完了" }));
  fireEvent.click(screen.getByRole("button", { name: "タスクを保存" }));
  fireEvent.click(screen.getByRole("button", { name: "アウトライン" }));
  expect(screen.getByRole("button", { name: /親.*完了率100%.*残り0件/ })).toBeInTheDocument();
  fireEvent.click(undoButton());
  expect(screen.getByRole("button", { name: /親.*完了率0%.*残り1件/ })).toBeInTheDocument();
  fireEvent.click(redoButton());
  expect(screen.getByRole("button", { name: /親.*完了率100%.*残り0件/ })).toBeInTheDocument();
});