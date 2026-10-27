import { act, renderHook } from "@testing-library/react";
import { useRevisionScopedNotice } from "@/hooks/useRevisionScopedNotice";
import type { OperationNotice } from "@/types/operationNotice";

const STATUS: OperationNotice = { kind: "status", message: "完了しました。" };
const ERROR: OperationNotice = { kind: "error", message: "失敗しました。" };

function renderNotice(documentRevision: number) {
  return renderHook(
    ({ revision }: { revision: number }) => useRevisionScopedNotice(revision),
    { initialProps: { revision: documentRevision } },
  );
}

describe("useRevisionScopedNotice", () => {
  it("初期状態では通知を持たない", () => {
    const { result } = renderNotice(0);

    expect(result.current.notice).toBeNull();
  });

  it("出した通知を返し、次の通知で置き換える", () => {
    const { result } = renderNotice(0);

    act(() => result.current.publishNotice(STATUS));
    expect(result.current.notice).toEqual(STATUS);

    act(() => result.current.publishNotice(ERROR));
    expect(result.current.notice).toEqual(ERROR);
  });

  it("documentRevisionが変わると通知を隠す", () => {
    const { result, rerender } = renderNotice(0);
    act(() => result.current.publishNotice(STATUS));

    rerender({ revision: 1 });
    expect(result.current.notice).toBeNull();
  });

  it("documentRevisionが変わらない再描画では通知を残す", () => {
    const { result, rerender } = renderNotice(3);
    act(() => result.current.publishNotice(STATUS));

    rerender({ revision: 3 });
    expect(result.current.notice).toEqual(STATUS);
  });

  it("revisionが変わった後に出した通知は新しいrevisionで表示する", () => {
    const { result, rerender } = renderNotice(0);
    act(() => result.current.publishNotice(STATUS));
    rerender({ revision: 2 });

    act(() => result.current.publishNotice(ERROR));
    expect(result.current.notice).toEqual(ERROR);
  });

  it("clearNoticeで枠を空にし、続けて出した通知は表示する", () => {
    const { result } = renderNotice(0);
    act(() => result.current.publishNotice(STATUS));

    act(() => result.current.clearNotice());
    expect(result.current.notice).toBeNull();

    act(() => result.current.publishNotice(ERROR));
    expect(result.current.notice).toEqual(ERROR);
  });

  it("clearNoticeの参照はdocumentRevisionが変わっても同じ", () => {
    const { result, rerender } = renderNotice(0);
    const before = result.current.clearNotice;

    rerender({ revision: 1 });
    expect(result.current.clearNotice).toBe(before);
  });
});
