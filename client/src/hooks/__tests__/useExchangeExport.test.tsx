import { act, renderHook } from "@testing-library/react";
import { encodeCsv } from "@/domain/exchange/csvTsvCodec";
import { encodeOpml } from "@/domain/exchange/opmlCodec";
import { useExchangeExport } from "@/hooks/useExchangeExport";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, parentId: null, label: "親" }),
  createTestNode({ id: 2, parentId: 1, label: "子" }),
];

describe("useExchangeExport", () => {
  it("閉包ノードから OPML・CSV・TSV を download へ渡す", () => {
    const downloadText = jest.fn();
    const { result } = renderHook(() => useExchangeExport({
      closedNodes: nodes,
      mapName: "旅行",
      downloadText,
    }));

    act(() => {
      result.current.exportOpml();
    });
    expect(downloadText).toHaveBeenLastCalledWith(encodeOpml(nodes), "旅行", "opml");

    act(() => {
      result.current.exportCsv();
    });
    expect(downloadText).toHaveBeenLastCalledWith(encodeCsv(nodes, ","), "旅行", "csv");

    act(() => {
      result.current.exportTsv();
    });
    expect(downloadText).toHaveBeenLastCalledWith(encodeCsv(nodes, "\t"), "旅行", "tsv");
  });

  it("download 失敗時はエラー通知を返す", () => {
    const downloadText = jest.fn(() => {
      throw new Error("fail");
    });
    const { result } = renderHook(() => useExchangeExport({
      closedNodes: nodes,
      mapName: "旅行",
      downloadText,
    }));

    act(() => {
      result.current.exportOpml();
    });
    expect(result.current.notice).toEqual({
      kind: "error",
      message: "OPMLファイルを書き出せませんでした。",
    });
  });
});