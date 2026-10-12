import { renderHook } from "@testing-library/react";
import { useDocumentRestoreInteractionReset } from "@/components/map/useDocumentRestoreInteractionReset";

type Callbacks = {
  cancelEditing: jest.Mock;
  cancelActiveGesture: jest.Mock;
  closeContextMenu: jest.Mock;
};

function createCallbacks(): Callbacks {
  return {
    cancelEditing: jest.fn(),
    cancelActiveGesture: jest.fn(),
    closeContextMenu: jest.fn(),
  };
}

function renderRestore(initial: { documentRevision: number; callbacks: Callbacks }) {
  return renderHook(
    ({ documentRevision, callbacks }) => useDocumentRestoreInteractionReset({ documentRevision, ...callbacks }),
    { initialProps: initial },
  );
}

function expectCalledTimes(callbacks: Callbacks, times: number) {
  expect(callbacks.cancelEditing).toHaveBeenCalledTimes(times);
  expect(callbacks.cancelActiveGesture).toHaveBeenCalledTimes(times);
  expect(callbacks.closeContextMenu).toHaveBeenCalledTimes(times);
}

describe("useDocumentRestoreInteractionReset", () => {
  it("初回マウントでは編集・ジェスチャー・メニューを閉じない", () => {
    const callbacks = createCallbacks();

    renderRestore({ documentRevision: 0, callbacks });

    expectCalledTimes(callbacks, 0);
  });

  it("documentRevisionが変わるたびに編集・ジェスチャー・メニューを1回ずつ閉じる", () => {
    const callbacks = createCallbacks();
    const { rerender } = renderRestore({ documentRevision: 0, callbacks });

    rerender({ documentRevision: 1, callbacks });
    expectCalledTimes(callbacks, 1);

    rerender({ documentRevision: 2, callbacks });
    expectCalledTimes(callbacks, 2);
  });

  it("documentRevisionが同じなら、再描画やcallback参照の変更だけでは閉じない", () => {
    const callbacks = createCallbacks();
    const { rerender } = renderRestore({ documentRevision: 3, callbacks });

    rerender({ documentRevision: 3, callbacks });
    const nextCallbacks = createCallbacks();
    rerender({ documentRevision: 3, callbacks: nextCallbacks });

    expectCalledTimes(callbacks, 0);
    expectCalledTimes(nextCallbacks, 0);
  });

  it("documentRevisionの変化時は、その時点の最新のcallbackで閉じる", () => {
    const initialCallbacks = createCallbacks();
    const { rerender } = renderRestore({ documentRevision: 0, callbacks: initialCallbacks });
    const latestCallbacks = createCallbacks();

    rerender({ documentRevision: 1, callbacks: latestCallbacks });

    expectCalledTimes(initialCallbacks, 0);
    expectCalledTimes(latestCallbacks, 1);
  });
});
