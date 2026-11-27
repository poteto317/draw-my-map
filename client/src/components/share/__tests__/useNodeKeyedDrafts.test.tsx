import { act, renderHook } from "@testing-library/react";
import { useNodeKeyedDrafts } from "@/components/share/useNodeKeyedDrafts";

describe("useNodeKeyedDrafts", () => {
  it("ノード ID ごとに下書きを持ち、別ノードへ切り替えて戻っても残る（L-859 / L-775）", () => {
    const { result } = renderHook(() => useNodeKeyedDrafts());
    expect(result.current.draftFor(1)).toBe("");
    act(() => {
      result.current.setDraft(1, "A の下書き");
    });
    act(() => {
      result.current.setDraft(2, "B の下書き");
    });
    expect(result.current.draftFor(1)).toBe("A の下書き");
    expect(result.current.draftFor(2)).toBe("B の下書き");
  });

  it("空文字を入れるとそのノードの分だけ消える", () => {
    const { result } = renderHook(() => useNodeKeyedDrafts());
    act(() => {
      result.current.setDraft(1, "A");
      result.current.setDraft(2, "B");
    });
    act(() => {
      result.current.setDraft(1, "");
    });
    expect(result.current.draftFor(1)).toBe("");
    expect(result.current.draftFor(2)).toBe("B");
  });
});
