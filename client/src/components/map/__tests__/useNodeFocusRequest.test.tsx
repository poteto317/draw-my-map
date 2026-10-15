import { renderHook } from "@testing-library/react";
import { useNodeFocusRequest } from "@/components/map/useNodeFocusRequest";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeFocusRequest } from "@/types/nodeFocusRequest";

const screen = { width: 800, height: 600 };
const firstNode = createTestNode({ id: 1, x: 50, y: 30, label: "ノード1" });

type HookProps = {
  request: NodeFocusRequest | null;
  documentRevision: number;
  nodes: readonly Node[];
  screen: typeof screen | null;
};

function setup(initialProps: HookProps, hasActiveGesture = jest.fn(() => false)) {
  const calls: string[] = [];
  const cancelActiveGesture = jest.fn(() => calls.push("cancel"));
  const onFocusNode = jest.fn(() => calls.push("focus"));
  const rendered = renderHook(
    (props: HookProps) => useNodeFocusRequest({
      ...props,
      hasActiveGesture,
      cancelActiveGesture,
      onFocusNode,
    }),
    { initialProps },
  );
  return { ...rendered, hasActiveGesture, cancelActiveGesture, onFocusNode, calls };
}

describe("useNodeFocusRequest", () => {
  it("新しいsequenceごとに最新座標へ1回移動し、同じ要求とnodes更新では繰り返さない", () => {
    const request = { nodeId: 1, sequence: 1, documentRevision: 4 };
    const { rerender, onFocusNode } = setup({
      request,
      documentRevision: 4,
      nodes: [firstNode],
      screen,
    });

    expect(onFocusNode).toHaveBeenCalledWith(firstNode, screen);
    rerender({ request, documentRevision: 4, nodes: [{ ...firstNode, x: 200 }], screen });
    expect(onFocusNode).toHaveBeenCalledTimes(1);

    const latestNode = { ...firstNode, x: 300 };
    rerender({
      request: { ...request, sequence: 2 },
      documentRevision: 4,
      nodes: [latestNode],
      screen,
    });
    expect(onFocusNode).toHaveBeenLastCalledWith(latestNode, screen);
    expect(onFocusNode).toHaveBeenCalledTimes(2);
  });

  it("screen準備までは保留し、対象が残っていれば準備後に1回だけ移動する", () => {
    const request = { nodeId: 1, sequence: 1, documentRevision: 0 };
    const { rerender, onFocusNode } = setup({
      request,
      documentRevision: 0,
      nodes: [firstNode],
      screen: null,
    });

    expect(onFocusNode).not.toHaveBeenCalled();
    const latestNode = { ...firstNode, x: 240 };
    rerender({ request, documentRevision: 0, nodes: [latestNode], screen });
    expect(onFocusNode).toHaveBeenCalledWith(latestNode, screen);
    rerender({ request, documentRevision: 0, nodes: [latestNode], screen });
    expect(onFocusNode).toHaveBeenCalledTimes(1);
  });

  it("対象不在を処理済みにして、同じIDが後から現れても移動しない", () => {
    const request = { nodeId: 1, sequence: 1, documentRevision: 0 };
    const { rerender, onFocusNode } = setup({ request, documentRevision: 0, nodes: [], screen });

    rerender({ request, documentRevision: 0, nodes: [firstNode], screen });
    expect(onFocusNode).not.toHaveBeenCalled();
  });

  it("screen待ちの間に対象が消えた要求を処理済みにする", () => {
    const request = { nodeId: 1, sequence: 1, documentRevision: 0 };
    const { rerender, onFocusNode } = setup({
      request,
      documentRevision: 0,
      nodes: [firstNode],
      screen: null,
    });

    rerender({ request, documentRevision: 0, nodes: [], screen: null });
    rerender({ request, documentRevision: 0, nodes: [firstNode], screen });
    expect(onFocusNode).not.toHaveBeenCalled();
  });

  it("世代が進んだ旧要求では移動もgesture取消も行わず、新世代の新要求は処理する", () => {
    const oldRequest = { nodeId: 1, sequence: 1, documentRevision: 0 };
    const hasActiveGesture = jest.fn(() => true);
    const { rerender, cancelActiveGesture, onFocusNode, calls } = setup({
      request: oldRequest,
      documentRevision: 0,
      nodes: [firstNode],
      screen: null,
    }, hasActiveGesture);

    rerender({ request: oldRequest, documentRevision: 1, nodes: [firstNode], screen });
    expect(cancelActiveGesture).not.toHaveBeenCalled();
    expect(onFocusNode).not.toHaveBeenCalled();

    rerender({
      request: { nodeId: 1, sequence: 2, documentRevision: 1 },
      documentRevision: 1,
      nodes: [firstNode],
      screen,
    });
    expect(calls).toEqual(["cancel", "focus"]);
  });

  it("requestがnullなら何もしない", () => {
    const { hasActiveGesture, cancelActiveGesture, onFocusNode } = setup({
      request: null,
      documentRevision: 0,
      nodes: [firstNode],
      screen,
    });

    expect(hasActiveGesture).not.toHaveBeenCalled();
    expect(cancelActiveGesture).not.toHaveBeenCalled();
    expect(onFocusNode).not.toHaveBeenCalled();
  });
});
