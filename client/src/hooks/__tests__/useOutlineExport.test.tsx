import { act, renderHook } from "@testing-library/react";
import { buildOutlineRows } from "@/domain/outline/outlineRows";
import * as outlineExport from "@/domain/outline/outlineExport";
import { useOutlineExport } from "@/hooks/useOutlineExport";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("@/domain/outline/outlineExport", () => {
  const actual = jest.requireActual<typeof import("@/domain/outline/outlineExport")>("@/domain/outline/outlineExport");
  return { ...actual, formatOutlineRows: jest.fn(actual.formatOutlineRows) };
});

const model = buildOutlineRows([
  createTestNode({ id: 1, parentId: null, label: "親" }),
  createTestNode({ id: 2, parentId: 1, label: "子" }),
]);

afterEach(() => jest.mocked(outlineExport.formatOutlineRows).mockReset().mockImplementation(
  jest.requireActual<typeof import("@/domain/outline/outlineExport")>("@/domain/outline/outlineExport").formatOutlineRows,
));

it("reportsStartOnlyAfterDownloadReturns", () => {
  const downloadText = jest.fn();
  const { result } = renderHook(() => useOutlineExport({ model, mapName: "旅行", downloadText }));
  expect(result.current.notice).toBeNull();
  act(() => result.current.exportMarkdown());
  expect(downloadText).toHaveBeenCalledWith("- 親\n  - 子\n", "旅行", "md");
  expect(result.current.notice).toEqual({ kind: "status", message: "Markdownファイルを書き出しました。" });
  act(() => result.current.exportPlainText());
  expect(downloadText).toHaveBeenCalledWith("・親\n  ・子\n", "旅行", "txt");
  expect(result.current.notice).toEqual({ kind: "status", message: "箇条書きファイルを書き出しました。" });
});

it("reportsEmptyAndLimitWithoutDownload", () => {
  const downloadText = jest.fn();
  const empty = renderHook(() => useOutlineExport({ model: buildOutlineRows([]), mapName: "空", downloadText }));
  act(() => empty.result.current.exportMarkdown());
  expect(empty.result.current.notice).toEqual({ kind: "warning", message: "書き出すノードがありません。" });
  const large = renderHook(() => useOutlineExport({
    model: buildOutlineRows([createTestNode({ id: 1, label: "x".repeat(1_000_000) })]),
    mapName: "大", downloadText,
  }));
  act(() => large.result.current.exportPlainText());
  expect(large.result.current.notice).toEqual({ kind: "warning", message: "書き出すテキストが大きすぎます。JSONで書き出してください。" });
  expect(downloadText).not.toHaveBeenCalled();
});

it("reportsInvalidStructureAndGenerationFailure", () => {
  const downloadText = jest.fn();
  const invalid = renderHook(() => useOutlineExport({
    model: buildOutlineRows([createTestNode({ id: 1, parentId: 99, label: "孤立" })]),
    mapName: "不正", downloadText,
  }));
  act(() => invalid.result.current.exportMarkdown());
  expect(invalid.result.current.notice).toEqual({ kind: "error", message: "Markdownファイルを書き出せませんでした。" });
  jest.mocked(outlineExport.formatOutlineRows).mockImplementationOnce(() => { throw new Error("秘密のラベル"); });
  const thrown = renderHook(() => useOutlineExport({ model, mapName: "秘密のラベル", downloadText }));
  act(() => thrown.result.current.exportPlainText());
  expect(thrown.result.current.notice).toEqual({ kind: "error", message: "箇条書きファイルを書き出せませんでした。" });
  expect(downloadText).not.toHaveBeenCalled();
});

it("reportsFailureOnlyAfterDownloadException", () => {
  const downloadText = jest.fn(() => { throw new Error("秘密のラベル"); });
  const { result } = renderHook(() => useOutlineExport({ model, mapName: "秘密のラベル", downloadText }));
  act(() => result.current.exportMarkdown());
  expect(downloadText).toHaveBeenCalledTimes(1);
  expect(result.current.notice).toEqual({ kind: "error", message: "Markdownファイルを書き出せませんでした。" });
});
