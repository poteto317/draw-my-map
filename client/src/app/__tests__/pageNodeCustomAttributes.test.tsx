import { fireEvent, screen, waitFor } from "@testing-library/react";
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

it("カスタム属性の追加・編集・削除が各1回のUndoで戻る", async () => {
  seedMapLibrary(localStorage, [{ json: v3Json([{ id: 1, label: "ノード", x: 100, y: 100 }]) }]);
  await renderPage();
  selectNode(1, 1);

  fireEvent.click(screen.getByRole("button", { name: "属性を追加" }));
  fireEvent.change(screen.getByLabelText("種類"), { target: { value: "number" } });
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: "件数" } });
  fireEvent.change(screen.getByLabelText("数値"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 件数" })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "編集: 件数" }));
  fireEvent.change(screen.getByLabelText("数値"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  fireEvent.click(screen.getByRole("button", { name: "カスタム属性を削除: 件数" }));
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "編集: 件数" })).not.toBeInTheDocument();
  });

  fireEvent.click(undoButton());
  selectNode(1, 1);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 件数" })).toBeInTheDocument();
  });
  fireEvent.click(undoButton());
  selectNode(1, 1);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 件数" })).toBeInTheDocument();
  });
  fireEvent.click(undoButton());
  selectNode(1, 1);
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "編集: 件数" })).not.toBeInTheDocument();
  });

  fireEvent.click(redoButton());
  selectNode(1, 1);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 件数" })).toBeInTheDocument();
  });
});

it("日付型と選択肢型の追加が各1回のUndoで戻る", async () => {
  seedMapLibrary(localStorage, [{ json: v3Json([{ id: 1, label: "ノード", x: 100, y: 100 }]) }]);
  await renderPage();
  selectNode(1, 1);

  fireEvent.click(screen.getByRole("button", { name: "属性を追加" }));
  fireEvent.change(screen.getByLabelText("種類"), { target: { value: "date" } });
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: "期限" } });
  fireEvent.change(screen.getByLabelText("日付"), { target: { value: "2026-12-01" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 期限" })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "属性を追加" }));
  fireEvent.change(screen.getByLabelText("種類"), { target: { value: "choice" } });
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: "区分" } });
  fireEvent.change(screen.getByLabelText("候補"), { target: { value: "高\n中\n" } });
  fireEvent.change(screen.getByLabelText("値"), { target: { value: "高" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 区分" })).toBeInTheDocument();
  });

  fireEvent.click(undoButton());
  selectNode(1, 1);
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "編集: 区分" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "編集: 期限" })).toBeInTheDocument();
  });
  fireEvent.click(undoButton());
  selectNode(1, 1);
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: "編集: 期限" })).not.toBeInTheDocument();
  });
});

it("ノード選択を切り替えると未保存の追加フォームを閉じる", async () => {
  seedMapLibrary(localStorage, [{
    json: v3Json([
      { id: 1, label: "A", x: 100, y: 100 },
      { id: 2, label: "B", x: 300, y: 100 },
    ]),
  }]);
  await renderPage();
  selectNode(1, 2);
  fireEvent.click(screen.getByRole("button", { name: "属性を追加" }));
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: "下書き" } });
  selectNode(2, 2);
  expect(screen.queryByLabelText("名前")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "属性を追加" })).toBeInTheDocument();
});

it("編集ロック中はカスタム属性の削除が無効になる", async () => {
  seedMapLibrary(localStorage, [{ json: v3Json([{ id: 1, label: "ノード", x: 100, y: 100 }]) }]);
  await renderPage();
  selectNode(1, 1);
  fireEvent.click(screen.getByRole("button", { name: "属性を追加" }));
  fireEvent.change(screen.getByLabelText("名前"), { target: { value: "件数" } });
  fireEvent.change(screen.getByLabelText("数値"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "編集: 件数" })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole("button", { name: "編集ロック" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "ロックする" }));
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "カスタム属性を削除: 件数" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "編集: 件数" })).toBeDisabled();
  });
});