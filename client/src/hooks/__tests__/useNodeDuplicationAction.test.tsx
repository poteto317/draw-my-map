import { act, renderHook } from "@testing-library/react";
import { useNodeDuplicationAction } from "@/hooks/useNodeDuplicationAction";

const SUCCESS_NOTICE = { kind: "status", message: "枝を複製しました。Fキーで選択ノードへ移動できます。" };
const FAILURE_NOTICE = { kind: "error", message: "枝を複製できませんでした。" };

type Props = {
  selectedNodeId: number | null;
  documentRevision: number;
  duplicateSubtree: (sourceId: number) => number | null;
};

function renderAction(initialProps: Props) {
  return renderHook((props: Props) => useNodeDuplicationAction(props), { initialProps });
}

describe("useNodeDuplicationAction", () => {
  it("初期状態では通知を持たない", () => {
    const { result } = renderAction({ selectedNodeId: 1, documentRevision: 0, duplicateSubtree: jest.fn() });

    expect(result.current.notice).toBeNull();
  });

  it("未選択なら複製せず、通知も出さない", () => {
    const duplicateSubtree = jest.fn(() => 5);
    const { result } = renderAction({ selectedNodeId: null, documentRevision: 0, duplicateSubtree });

    act(() => result.current.duplicateSelected());

    expect(duplicateSubtree).not.toHaveBeenCalled();
    expect(result.current.notice).toBeNull();
  });

  it("選択ノードを複製し、成功したら成功通知を出す", () => {
    const duplicateSubtree = jest.fn(() => 5);
    const { result } = renderAction({ selectedNodeId: 3, documentRevision: 0, duplicateSubtree });

    act(() => result.current.duplicateSelected());

    expect(duplicateSubtree).toHaveBeenCalledTimes(1);
    expect(duplicateSubtree).toHaveBeenCalledWith(3);
    expect(result.current.notice).toEqual(SUCCESS_NOTICE);
  });

  it("複製がnullを返したらエラー通知を出す", () => {
    const duplicateSubtree = jest.fn(() => null);
    const { result } = renderAction({ selectedNodeId: 3, documentRevision: 0, duplicateSubtree });

    act(() => result.current.duplicateSelected());

    expect(duplicateSubtree).toHaveBeenCalledWith(3);
    expect(result.current.notice).toEqual(FAILURE_NOTICE);
  });

  it("documentRevisionが変わると通知を消す", () => {
    const duplicateSubtree = jest.fn(() => 5);
    const { result, rerender } = renderAction({ selectedNodeId: 3, documentRevision: 0, duplicateSubtree });
    act(() => result.current.duplicateSelected());
    expect(result.current.notice).toEqual(SUCCESS_NOTICE);

    rerender({ selectedNodeId: null, documentRevision: 1, duplicateSubtree });

    expect(result.current.notice).toBeNull();
  });

  it("失敗通知もdocumentRevisionの変化で消す", () => {
    const duplicateSubtree = jest.fn(() => null);
    const { result, rerender } = renderAction({ selectedNodeId: 3, documentRevision: 4, duplicateSubtree });
    act(() => result.current.duplicateSelected());

    rerender({ selectedNodeId: 3, documentRevision: 5, duplicateSubtree });

    expect(result.current.notice).toBeNull();
  });

  it("成功後にnodesや選択が変わっても、documentRevisionが同じなら通知を残す", () => {
    const duplicateSubtree = jest.fn(() => 5);
    const { result, rerender } = renderAction({ selectedNodeId: 3, documentRevision: 2, duplicateSubtree });
    act(() => result.current.duplicateSelected());

    rerender({ selectedNodeId: 5, documentRevision: 2, duplicateSubtree });
    expect(result.current.notice).toEqual(SUCCESS_NOTICE);
    rerender({ selectedNodeId: null, documentRevision: 2, duplicateSubtree: jest.fn(() => 9) });

    expect(result.current.notice).toEqual(SUCCESS_NOTICE);
  });

  it("次の複製要求で、成功通知を失敗通知へ置き換える", () => {
    const duplicateSubtree = jest.fn<number | null, [number]>()
      .mockReturnValueOnce(5)
      .mockReturnValueOnce(null);
    const { result, rerender } = renderAction({ selectedNodeId: 3, documentRevision: 0, duplicateSubtree });
    act(() => result.current.duplicateSelected());
    expect(result.current.notice).toEqual(SUCCESS_NOTICE);
    rerender({ selectedNodeId: 5, documentRevision: 0, duplicateSubtree });

    act(() => result.current.duplicateSelected());

    expect(duplicateSubtree).toHaveBeenLastCalledWith(5);
    expect(result.current.notice).toEqual(FAILURE_NOTICE);
  });

  it("次の複製要求で、失敗通知を成功通知へ置き換える", () => {
    const duplicateSubtree = jest.fn<number | null, [number]>()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(6);
    const { result } = renderAction({ selectedNodeId: 3, documentRevision: 0, duplicateSubtree });
    act(() => result.current.duplicateSelected());
    expect(result.current.notice).toEqual(FAILURE_NOTICE);

    act(() => result.current.duplicateSelected());

    expect(result.current.notice).toEqual(SUCCESS_NOTICE);
  });

  it("documentRevisionが変わった後の複製要求では、新しい通知を表示する", () => {
    const duplicateSubtree = jest.fn(() => 5);
    const { result, rerender } = renderAction({ selectedNodeId: 3, documentRevision: 0, duplicateSubtree });
    act(() => result.current.duplicateSelected());
    rerender({ selectedNodeId: 3, documentRevision: 1, duplicateSubtree });
    expect(result.current.notice).toBeNull();

    act(() => result.current.duplicateSelected());

    expect(result.current.notice).toEqual(SUCCESS_NOTICE);
  });
});
