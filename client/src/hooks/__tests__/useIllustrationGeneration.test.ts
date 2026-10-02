import { act, renderHook } from "@testing-library/react";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("@/services/illustration/illustrationClient", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationClient");
  return { ...actual, requestIllustration: jest.fn() };
});

const mockRequest = requestIllustration as jest.MockedFunction<typeof requestIllustration>;
const nodes = [
  createTestNode({ id: 1, label: "目標" }),
  createTestNode({ id: 2, label: "予算" }),
  createTestNode({ id: 3, label: "   " }),
];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useIllustrationGeneration", () => {
  beforeEach(() => mockRequest.mockReset());

  it("初期状態は idle", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("生成中は generating、成功すると succeeded でdata URLを持つ", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(1));
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1 });
    expect(mockRequest).toHaveBeenCalledWith("目標", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await act(async () => pending.resolve({ dataUrl: "data:image/jpeg;base64,AAA" }));
    expect(result.current.generation).toEqual({
      status: "succeeded",
      nodeId: 1,
      dataUrl: "data:image/jpeg;base64,AAA",
    });
  });

  it("APIの失敗は failed で、種類に応じたメッセージを持つ", async () => {
    mockRequest.mockRejectedValue(new IllustrationRequestError("quota-exceeded"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 1,
      message: describeIllustrationError("quota-exceeded"),
    });
  });

  it("想定外の例外は upstream-error のメッセージにする", async () => {
    mockRequest.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toMatchObject({
      status: "failed",
      message: describeIllustrationError("upstream-error"),
    });
  });

  it("生成中の再要求は無視する（別のノードでも）", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(1));
    act(() => result.current.generateIllustration(1));
    act(() => result.current.generateIllustration(2));

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1 });
    await act(async () => pending.resolve({ dataUrl: "d" }));
  });

  it("完了後は、別のノードで、新しく生成できる", async () => {
    mockRequest.mockResolvedValueOnce({ dataUrl: "first" }).mockResolvedValueOnce({ dataUrl: "second" });
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    await act(async () => result.current.generateIllustration(1));
    await act(async () => result.current.generateIllustration(2));

    expect(mockRequest).toHaveBeenNthCalledWith(2, "予算", expect.anything());
    expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 2, dataUrl: "second" });
  });

  it("空白だけのラベルは、リクエストせずに failed にする", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(3));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 3,
      message: describeIllustrationError("invalid-label"),
    });
  });

  it("存在しないノードIDは何もしない", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes));

    act(() => result.current.generateIllustration(999));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("アンマウント時に進行中のリクエストを中断する", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useIllustrationGeneration(nodes));
    act(() => result.current.generateIllustration(1));
    const signal = mockRequest.mock.calls[0][1]!.signal as AbortSignal;
    const lastRendered = result.current.generation;

    unmount();
    await act(async () => pending.resolve({ dataUrl: "late" }));

    expect(signal.aborted).toBe(true);
    // アンマウント後は、最後に描画された値が変わらない
    expect(lastRendered).toEqual({ status: "generating", nodeId: 1 });
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1 });
  });

  it("nodes が同じなら、同じ関数を返す", () => {
    const { result, rerender } = renderHook(() => useIllustrationGeneration(nodes));
    const first = result.current.generateIllustration;

    rerender();

    expect(result.current.generateIllustration).toBe(first);
  });
});
