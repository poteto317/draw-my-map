import { useLayoutEffect } from "react";
import { renderHook } from "@testing-library/react";
import { useNodeLabelEditRequest } from "@/components/map/useNodeLabelEditRequest";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { NodeLabelEditRequest } from "@/types/nodeLabelEditRequest";

const rootNode = createTestNode({ id: 1 });
const childNode = createTestNode({ id: 2, parentId: 1 });

type HookProps = {
  request: NodeLabelEditRequest | null;
  documentRevision: number;
  nodes: readonly Node[];
};

function setup(initialProps: HookProps, hasActiveGesture = jest.fn(() => false)) {
  const cancelActiveGesture = jest.fn();
  const startEditing = jest.fn();
  const rendered = renderHook(
    (props: HookProps) =>
      useNodeLabelEditRequest({ ...props, hasActiveGesture, cancelActiveGesture, startEditing }),
    { initialProps },
  );
  return { ...rendered, hasActiveGesture, cancelActiveGesture, startEditing };
}

describe("useNodeLabelEditRequest", () => {
  it("新しいsequenceごとに1回だけ空の入力で編集を始め、同じ値の要求では繰り返さない", () => {
    const request = { nodeId: 2, sequence: 1, documentRevision: 0 };
    const nodes = [rootNode, childNode];
    const { rerender, startEditing } = setup({ request, documentRevision: 0, nodes });

    expect(startEditing).toHaveBeenCalledTimes(1);
    expect(startEditing).toHaveBeenCalledWith(2, "");

    rerender({ request, documentRevision: 0, nodes });
    expect(startEditing).toHaveBeenCalledTimes(1);

    rerender({ request: { ...request }, documentRevision: 0, nodes: [...nodes] });
    expect(startEditing).toHaveBeenCalledTimes(1);

    rerender({ request: { ...request, sequence: 2 }, documentRevision: 0, nodes });
    expect(startEditing).toHaveBeenCalledTimes(2);
  });

  it("requestがnullなら始めない", () => {
    const { startEditing } = setup({
      request: null,
      documentRevision: 0,
      nodes: [rootNode, childNode],
    });
    expect(startEditing).not.toHaveBeenCalled();
  });

  it("世代が違う要求では始めず、世代が戻っても始めない", () => {
    const request = { nodeId: 2, sequence: 1, documentRevision: 0 };
    const nodes = [rootNode, childNode];
    const { rerender, startEditing } = setup({ request, documentRevision: 1, nodes });
    expect(startEditing).not.toHaveBeenCalled();

    rerender({ request, documentRevision: 0, nodes });
    expect(startEditing).not.toHaveBeenCalled();
  });

  it("ノードが無い要求は始めず、後でノードが現れても始めない", () => {
    const request = { nodeId: 2, sequence: 1, documentRevision: 0 };
    const { rerender, startEditing } = setup({
      request,
      documentRevision: 0,
      nodes: [rootNode],
    });
    expect(startEditing).not.toHaveBeenCalled();

    rerender({ request, documentRevision: 0, nodes: [rootNode, childNode] });
    expect(startEditing).not.toHaveBeenCalled();
  });

  it("ジェスチャー中はキャンセルしてから編集を始める", () => {
    const request = { nodeId: 2, sequence: 1, documentRevision: 0 };
    const { cancelActiveGesture, startEditing } = setup(
      { request, documentRevision: 0, nodes: [rootNode, childNode] },
      jest.fn(() => true),
    );

    expect(cancelActiveGesture).toHaveBeenCalledTimes(1);
    expect(startEditing).toHaveBeenCalledTimes(1);
    expect(cancelActiveGesture.mock.invocationCallOrder[0]).toBeLessThan(
      startEditing.mock.invocationCallOrder[0],
    );
  });

  it("ジェスチャーが無ければキャンセルしない", () => {
    const { cancelActiveGesture, startEditing } = setup({
      request: { nodeId: 2, sequence: 1, documentRevision: 0 },
      documentRevision: 0,
      nodes: [rootNode, childNode],
    });
    expect(startEditing).toHaveBeenCalledTimes(1);
    expect(cancelActiveGesture).not.toHaveBeenCalled();
  });

  it("コールバックが変わるだけでは要求を処理し直さず、次の要求では最新のコールバックを使う", () => {
    const nodes = [rootNode, childNode];
    const firstStartEditing = jest.fn();
    const nextStartEditing = jest.fn();
    const nextCancelActiveGesture = jest.fn();
    const hasActiveGesture = jest.fn(() => false);
    const nextHasActiveGesture = jest.fn(() => true);
    type CallbackProps = HookProps & {
      hasActiveGesture: () => boolean;
      cancelActiveGesture: () => void;
      startEditing: (nodeId: number, initialText?: string) => void;
    };
    const request = { nodeId: 2, sequence: 1, documentRevision: 0 };
    const { rerender } = renderHook((props: CallbackProps) => useNodeLabelEditRequest(props), {
      initialProps: {
        request,
        documentRevision: 0,
        nodes,
        hasActiveGesture,
        cancelActiveGesture: jest.fn(),
        startEditing: firstStartEditing,
      },
    });
    expect(firstStartEditing).toHaveBeenCalledTimes(1);

    const nextCallbacks = {
      hasActiveGesture: nextHasActiveGesture,
      cancelActiveGesture: nextCancelActiveGesture,
      startEditing: nextStartEditing,
    };
    rerender({ request, documentRevision: 0, nodes, ...nextCallbacks });
    expect(nextStartEditing).not.toHaveBeenCalled();

    rerender({ request: { ...request, nodeId: 1, sequence: 2 }, documentRevision: 0, nodes, ...nextCallbacks });
    expect(firstStartEditing).toHaveBeenCalledTimes(1);
    expect(nextCancelActiveGesture).toHaveBeenCalledTimes(1);
    expect(nextStartEditing).toHaveBeenCalledWith(1, "");
  });

  it("世代が違う要求を捨てた後でも、同じ世代の新しい要求は処理する", () => {
    const nodes = [rootNode, childNode];
    const { rerender, startEditing } = setup({
      request: { nodeId: 2, sequence: 1, documentRevision: 0 },
      documentRevision: 1,
      nodes,
    });
    expect(startEditing).not.toHaveBeenCalled();

    rerender({ request: { nodeId: 2, sequence: 2, documentRevision: 1 }, documentRevision: 1, nodes });
    expect(startEditing).toHaveBeenCalledTimes(1);
    expect(startEditing).toHaveBeenCalledWith(2, "");
  });

  it("useLayoutEffectで処理するので、同じコミットの後ろのlayout effectの時点で編集が始まっている", () => {
    const startEditing = jest.fn();
    const calledAtLayoutEffect = jest.fn();
    renderHook(() => {
      useNodeLabelEditRequest({
        request: { nodeId: 2, sequence: 1, documentRevision: 0 },
        documentRevision: 0,
        nodes: [rootNode, childNode],
        hasActiveGesture: () => false,
        cancelActiveGesture: jest.fn(),
        startEditing,
      });
      useLayoutEffect(() => {
        calledAtLayoutEffect(startEditing.mock.calls.length);
      }, []);
    });

    expect(calledAtLayoutEffect).toHaveBeenCalledWith(1);
  });
});
