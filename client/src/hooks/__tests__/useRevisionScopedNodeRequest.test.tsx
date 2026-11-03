import { act, renderHook } from "@testing-library/react";
import { useRevisionScopedNodeRequest } from "@/hooks/useRevisionScopedNodeRequest";

function renderRequest(documentRevision: number) {
  return renderHook(
    ({ revision }: { revision: number }) => useRevisionScopedNodeRequest(revision),
    { initialProps: { revision: documentRevision } },
  );
}

describe("useRevisionScopedNodeRequest", () => {
  it("初期状態では要求を持たない", () => {
    const { result } = renderRequest(0);

    expect(result.current.request).toBeNull();
  });

  it("発行した要求に、現在の documentRevision と1から始まる sequence を添える", () => {
    const { result } = renderRequest(3);

    act(() => result.current.issueRequest(5));

    expect(result.current.request).toEqual({ nodeId: 5, sequence: 1, documentRevision: 3 });
  });

  it("同じノードへの要求でも sequence を1つずつ進める", () => {
    const { result } = renderRequest(0);

    act(() => result.current.issueRequest(5));
    act(() => result.current.issueRequest(5));
    expect(result.current.request).toEqual({ nodeId: 5, sequence: 2, documentRevision: 0 });

    act(() => result.current.issueRequest(8));
    expect(result.current.request).toEqual({ nodeId: 8, sequence: 3, documentRevision: 0 });
  });

  it("documentRevision が変わると、前の要求を隠す", () => {
    const { result, rerender } = renderRequest(0);
    act(() => result.current.issueRequest(5));

    rerender({ revision: 1 });

    expect(result.current.request).toBeNull();
  });

  it("documentRevision が変わった後の要求は、新しい documentRevision で sequence を続ける", () => {
    const { result, rerender } = renderRequest(0);
    act(() => result.current.issueRequest(5));
    rerender({ revision: 1 });

    act(() => result.current.issueRequest(6));

    expect(result.current.request).toEqual({ nodeId: 6, sequence: 2, documentRevision: 1 });
  });

  it("documentRevision が変わらない再描画では、要求と issueRequest を保つ", () => {
    const { result, rerender } = renderRequest(0);
    act(() => result.current.issueRequest(5));
    const { request, issueRequest } = result.current;

    rerender({ revision: 0 });

    expect(result.current.request).toBe(request);
    expect(result.current.issueRequest).toBe(issueRequest);
  });
});

it("clearは要求だけ破棄し同一イベントとrevision変更後も単調な連番を保つ", () => {
  const { result, rerender } = renderRequest(0);
  act(() => result.current.issueRequest(1));
  act(() => result.current.clearRequest());
  expect(result.current.request).toBeNull();
  act(() => result.current.clearRequest());
  expect(result.current.request).toBeNull();
  act(() => result.current.issueRequest(2));
  expect(result.current.request?.sequence).toBe(2);
  act(() => { result.current.clearRequest(); result.current.issueRequest(3); });
  expect(result.current.request).toEqual({ nodeId: 3, sequence: 3, documentRevision: 0 });
  rerender({ revision: 1 });
  act(() => result.current.issueRequest(4));
  expect(result.current.request).toEqual({ nodeId: 4, sequence: 4, documentRevision: 1 });
});
