import { act, renderHook } from "@testing-library/react";
import { useBranchExtractDialog } from "@/hooks/useBranchExtractDialog";
import { createTestNode } from "@/testing/createTestNode";

const nodes = [
  createTestNode({ id: 1, parentId: null, label: "親" }),
  createTestNode({ id: 2, parentId: 1, label: "枝" }),
];

describe("useBranchExtractDialog", () => {
  it("成功で onExtractBranchToNewMap を呼び閉じる", () => {
    const onExtractBranchToNewMap = jest.fn(() => ({
      ok: true as const,
      remounted: false,
      notice: { kind: "status" as const, message: "ok" },
      saveRetryNotice: null,
    }));
    const { result } = renderHook(() => useBranchExtractDialog({
      nodes,
      selectedNodeId: 2,
      documentRevision: 1,
      onExtractBranchToNewMap,
    }));

    act(() => result.current.open());
    expect(result.current.screen).toBe("open");
    act(() => result.current.submit());
    expect(onExtractBranchToNewMap).toHaveBeenCalledWith(2);
    expect(result.current.screen).toBe("closed");
    expect(result.current.focusRequest).toBe("header");
  });

  it("失敗時はエラーを表示して開いたまま", () => {
    const onExtractBranchToNewMap = jest.fn(() => ({
      ok: false as const,
      notice: { kind: "error" as const, message: "拒否" },
    }));
    const { result } = renderHook(() => useBranchExtractDialog({
      nodes,
      selectedNodeId: 2,
      documentRevision: 1,
      onExtractBranchToNewMap,
    }));

    act(() => {
      result.current.open();
    });
    act(() => {
      result.current.submit();
    });
    expect(result.current.screen).toBe("open");
    expect(result.current.error.message).toBe("拒否");
  });

  it("選択 id が nodes に無いときは開かない", () => {
    const onExtractBranchToNewMap = jest.fn();
    const { result } = renderHook(() => useBranchExtractDialog({
      nodes,
      selectedNodeId: 99,
      documentRevision: 1,
      onExtractBranchToNewMap,
    }));

    act(() => result.current.open());
    expect(result.current.screen).toBe("closed");
    expect(onExtractBranchToNewMap).not.toHaveBeenCalled();
  });

  it("開いたあと source が消えたら送信不可", () => {
    const onExtractBranchToNewMap = jest.fn(() => ({
      ok: true as const,
      remounted: false,
      notice: { kind: "status" as const, message: "ok" },
      saveRetryNotice: null,
    }));
    const { result, rerender } = renderHook(
      ({ nodeList }: { nodeList: typeof nodes }) => useBranchExtractDialog({
        nodes: nodeList,
        selectedNodeId: 2,
        documentRevision: 1,
        onExtractBranchToNewMap,
      }),
      { initialProps: { nodeList: nodes } },
    );

    act(() => result.current.open());
    rerender({ nodeList: [nodes[0]] });
    expect(result.current.canSubmit).toBe(false);
    act(() => result.current.submit());
    expect(onExtractBranchToNewMap).not.toHaveBeenCalled();
  });
});