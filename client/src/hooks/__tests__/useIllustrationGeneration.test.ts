import { act, renderHook } from "@testing-library/react";
import { useIllustrationGeneration } from "@/hooks/useIllustrationGeneration";
import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";
import {
  IllustrationThumbnailError,
  createIllustrationThumbnail,
} from "@/services/illustration/illustrationThumbnail";
import { createTestNode } from "@/testing/createTestNode";

jest.mock("@/services/illustration/illustrationClient", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationClient");
  return { ...actual, requestIllustration: jest.fn() };
});

jest.mock("@/services/illustration/illustrationThumbnail", () => {
  const actual = jest.requireActual("@/services/illustration/illustrationThumbnail");
  return { ...actual, createIllustrationThumbnail: jest.fn() };
});

const mockThumbnail = createIllustrationThumbnail as jest.MockedFunction<typeof createIllustrationThumbnail>;
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
  beforeEach(() => {
    mockRequest.mockReset();
    mockThumbnail.mockReset();
    mockThumbnail.mockImplementation(async (url) => `thumb:${url}`);
  });

  it("初期状態は idle", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("生成中は generating、成功すると succeeded でdata URLを持つ", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    act(() => result.current.generateIllustration(1));
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1, label: "目標" });
    expect(mockRequest).toHaveBeenCalledWith("目標", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    await act(async () => pending.resolve({ dataUrl: "data:image/jpeg;base64,AAA" }));
    expect(result.current.generation).toEqual({
      status: "succeeded",
      nodeId: 1,
      label: "目標",
      dataUrl: "thumb:data:image/jpeg;base64,AAA",
    });
  });

  it("生成時点のノードの生のテキスト（正規化前）を、generating と succeeded に保存する", async () => {
    const padded = [createTestNode({ id: 5, label: "  猫  " })];
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(padded, 0));

    act(() => result.current.generateIllustration(5));
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 5, label: "  猫  " });

    await act(async () => pending.resolve({ dataUrl: "d" }));
    expect(result.current.generation).toEqual({
      status: "succeeded",
      nodeId: 5,
      label: "  猫  ",
      dataUrl: "thumb:d",
    });
  });

  it("生成中にノードのテキストが変わっても、完了時の状態は生成開始時のテキストを持つ", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ list }) => useIllustrationGeneration(list, 0), {
      initialProps: { list: [createTestNode({ id: 1, label: "目標" })] },
    });
    act(() => result.current.generateIllustration(1));

    rerender({ list: [createTestNode({ id: 1, label: "目標（変更後）" })] });
    await act(async () => pending.resolve({ dataUrl: "d" }));

    expect(result.current.generation).toMatchObject({ status: "succeeded", label: "目標" });
  });

  it("APIの失敗は failed で、種類に応じたメッセージを持つ", async () => {
    mockRequest.mockRejectedValue(new IllustrationRequestError("quota-exceeded"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 1,
      message: describeIllustrationError("quota-exceeded"),
    });
  });

  it("content-rejected の失敗は failed で、専用のメッセージを持つ", async () => {
    mockRequest.mockRejectedValue(new IllustrationRequestError("content-rejected"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 1,
      message: describeIllustrationError("content-rejected"),
    });
  });

  it("想定外の例外は upstream-error のメッセージにする", async () => {
    mockRequest.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toMatchObject({
      status: "failed",
      message: describeIllustrationError("upstream-error"),
    });
  });

  it("生成中の再要求は無視する（別のノードでも）", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    act(() => result.current.generateIllustration(1));
    act(() => result.current.generateIllustration(1));
    act(() => result.current.generateIllustration(2));

    expect(mockRequest).toHaveBeenCalledTimes(1);
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1, label: "目標" });
    await act(async () => pending.resolve({ dataUrl: "d" }));
  });

  it("完了後は、別のノードで、新しく生成できる", async () => {
    mockRequest.mockResolvedValueOnce({ dataUrl: "first" }).mockResolvedValueOnce({ dataUrl: "second" });
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    await act(async () => result.current.generateIllustration(1));
    await act(async () => result.current.generateIllustration(2));

    expect(mockRequest).toHaveBeenNthCalledWith(2, "予算", expect.anything());
    expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 2, label: "予算", dataUrl: "thumb:second" });
  });

  it("空白だけのラベルは、リクエストせずに failed にする", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    act(() => result.current.generateIllustration(3));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 3,
      message: describeIllustrationError("invalid-label"),
    });
  });

  it("存在しないノードIDは何もしない", () => {
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    act(() => result.current.generateIllustration(999));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("アンマウント時に進行中のリクエストを中断する", async () => {
    const pending = deferred<{ dataUrl: string }>();
    mockRequest.mockReturnValue(pending.promise);
    const { result, unmount } = renderHook(() => useIllustrationGeneration(nodes, 0));
    act(() => result.current.generateIllustration(1));
    const signal = mockRequest.mock.calls[0][1]!.signal as AbortSignal;
    const lastRendered = result.current.generation;

    unmount();
    await act(async () => pending.resolve({ dataUrl: "late" }));

    expect(signal.aborted).toBe(true);
    // アンマウント後は、最後に描画された値が変わらない
    expect(lastRendered).toEqual({ status: "generating", nodeId: 1, label: "目標" });
    expect(result.current.generation).toEqual({ status: "generating", nodeId: 1, label: "目標" });
  });

  it("成功時は、縮小した画像を state に持つ", async () => {
    mockRequest.mockResolvedValue({ dataUrl: "data:image/png;base64,RAW" });
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    await act(async () => result.current.generateIllustration(1));

    expect(mockThumbnail).toHaveBeenCalledWith("data:image/png;base64,RAW");
    expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 1, label: "目標", dataUrl: "thumb:data:image/png;base64,RAW" });
  });

  it("縮小に失敗したときは image-processing のメッセージで failed になる", async () => {
    mockRequest.mockResolvedValue({ dataUrl: "data:image/png;base64,RAW" });
    mockThumbnail.mockRejectedValue(new IllustrationThumbnailError());
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));

    await act(async () => result.current.generateIllustration(1));

    expect(result.current.generation).toEqual({
      status: "failed",
      nodeId: 1,
      message: describeIllustrationError("image-processing"),
    });
  });

  it("dismissGeneration で idle に戻る", async () => {
    mockRequest.mockResolvedValue({ dataUrl: "data:image/png;base64,RAW" });
    const { result } = renderHook(() => useIllustrationGeneration(nodes, 0));
    await act(async () => result.current.generateIllustration(1));
    expect(result.current.generation).toMatchObject({ status: "succeeded" });

    act(() => result.current.dismissGeneration());

    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("縮小の途中でマップが置き換わったら、結果を捨てる", async () => {
    const thumbnail = deferred<string>();
    mockRequest.mockResolvedValue({ dataUrl: "data:image/png;base64,RAW" });
    mockThumbnail.mockReturnValue(thumbnail.promise);
    const { result, rerender } = renderHook(
      ({ revision }: { revision: number }) => useIllustrationGeneration(nodes, revision),
      { initialProps: { revision: 0 } },
    );
    await act(async () => result.current.generateIllustration(1));
    expect(mockThumbnail).toHaveBeenCalledTimes(1);

    rerender({ revision: 1 });
    await act(async () => thumbnail.resolve("thumb:late"));

    expect(result.current.generation).toEqual({ status: "idle" });
  });

  it("nodes が同じなら、同じ関数を返す", () => {
    const { result, rerender } = renderHook(() => useIllustrationGeneration(nodes, 0));
    const first = result.current.generateIllustration;

    rerender();

    expect(result.current.generateIllustration).toBe(first);
  });

  describe("Undo／Redoによる復元（revision の変化）", () => {
    function renderWithRevision() {
      return renderHook(
        ({ revision }: { revision: number }) => useIllustrationGeneration(nodes, revision),
        { initialProps: { revision: 0 } },
      );
    }

    it("Undo→Redoで同じIDとラベルに戻っても旧応答Aを捨ててidleを保ち、新しい生成Bは開始・成功できる", async () => {
      const responseA = deferred<{ dataUrl: string }>();
      const responseB = deferred<{ dataUrl: string }>();
      mockRequest.mockReturnValueOnce(responseA.promise).mockReturnValueOnce(responseB.promise);
      const { result, rerender } = renderWithRevision();
      act(() => result.current.generateIllustration(1));

      rerender({ revision: 1 });
      rerender({ revision: 2 });
      await act(async () => responseA.resolve({ dataUrl: "A" }));
      expect(result.current.generation).toEqual({ status: "idle" });

      act(() => result.current.generateIllustration(1));
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(result.current.generation).toEqual({ status: "generating", nodeId: 1, label: "目標" });
      await act(async () => responseB.resolve({ dataUrl: "B" }));
      expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 1, label: "目標", dataUrl: "thumb:B" });
    });

    it("成功済みのプレビューはrevisionの変化で消え、同じノードに戻っても復活しない", async () => {
      mockRequest.mockResolvedValue({ dataUrl: "preview" });
      const withoutTarget = nodes.filter((node) => node.id !== 1);
      const { result, rerender } = renderHook(
        ({ list, revision }: { list: typeof nodes; revision: number }) => useIllustrationGeneration(list, revision),
        { initialProps: { list: nodes, revision: 0 } },
      );
      await act(async () => result.current.generateIllustration(1));
      expect(result.current.generation).toMatchObject({ status: "succeeded" });

      // Undo で対象ノードがない状態へ戻る
      rerender({ list: withoutTarget, revision: 1 });
      expect(result.current.generation).toEqual({ status: "idle" });

      // Redo で同じIDとラベルのノードへ戻る
      rerender({ list: nodes, revision: 2 });
      expect(result.current.generation).toEqual({ status: "idle" });
    });
  });

  describe("マップの置き換え（documentRevision の変化）", () => {
    function renderWithRevision() {
      return renderHook(
        ({ revision }: { revision: number }) => useIllustrationGeneration(nodes, revision),
        { initialProps: { revision: 0 } },
      );
    }

    it("成功の状態は、documentRevision が変わると idle に戻る", async () => {
      mockRequest.mockResolvedValue({ dataUrl: "old" });
      const { result, rerender } = renderWithRevision();
      await act(async () => result.current.generateIllustration(1));
      expect(result.current.generation).toMatchObject({ status: "succeeded" });

      rerender({ revision: 1 });

      expect(result.current.generation).toEqual({ status: "idle" });
    });

    it("失敗の状態も、documentRevision が変わると idle に戻る", async () => {
      mockRequest.mockRejectedValue(new IllustrationRequestError("quota-exceeded"));
      const { result, rerender } = renderWithRevision();
      await act(async () => result.current.generateIllustration(1));
      expect(result.current.generation).toMatchObject({ status: "failed" });

      rerender({ revision: 1 });

      expect(result.current.generation).toEqual({ status: "idle" });
    });

    it("documentRevision が同じなら、状態を保つ", async () => {
      mockRequest.mockResolvedValue({ dataUrl: "kept" });
      const { result, rerender } = renderWithRevision();
      await act(async () => result.current.generateIllustration(1));

      rerender({ revision: 0 });

      expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 1, label: "目標", dataUrl: "thumb:kept" });
    });

    it("生成中に documentRevision が変わると、リクエストを中断して idle に戻し、遅れて届いた結果を無視する", async () => {
      const pending = deferred<{ dataUrl: string }>();
      mockRequest.mockReturnValue(pending.promise);
      const { result, rerender } = renderWithRevision();
      act(() => result.current.generateIllustration(1));
      const signal = mockRequest.mock.calls[0][1]!.signal as AbortSignal;

      rerender({ revision: 1 });

      expect(signal.aborted).toBe(true);
      expect(result.current.generation).toEqual({ status: "idle" });

      await act(async () => pending.resolve({ dataUrl: "late" }));
      expect(result.current.generation).toEqual({ status: "idle" });
    });

    it("中断した古いリクエストが遅れて失敗（AbortError）しても、後から始めた生成中の状態を上書きしない", async () => {
      const first = deferred<{ dataUrl: string }>();
      const second = deferred<{ dataUrl: string }>();
      mockRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { result, rerender } = renderWithRevision();
      act(() => result.current.generateIllustration(1));
      rerender({ revision: 1 });
      act(() => result.current.generateIllustration(2));

      await act(async () => first.reject(new DOMException("aborted", "AbortError")));

      expect(result.current.generation).toEqual({ status: "generating", nodeId: 2, label: "予算" });
    });

    it("中断した古いリクエストが遅れて成功しても、後から始めた生成中の状態を上書きしない", async () => {
      const first = deferred<{ dataUrl: string }>();
      const second = deferred<{ dataUrl: string }>();
      mockRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { result, rerender } = renderWithRevision();
      act(() => result.current.generateIllustration(1));
      rerender({ revision: 1 });
      act(() => result.current.generateIllustration(2));

      await act(async () => first.resolve({ dataUrl: "old" }));

      expect(result.current.generation).toEqual({ status: "generating", nodeId: 2, label: "予算" });
    });

    it("中断後は、すぐに新しい生成を受け付け、古いリクエストの完了で新しいロックを壊さない", async () => {
      const first = deferred<{ dataUrl: string }>();
      const second = deferred<{ dataUrl: string }>();
      mockRequest.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const { result, rerender } = renderWithRevision();
      act(() => result.current.generateIllustration(1));
      rerender({ revision: 1 });

      act(() => result.current.generateIllustration(1));
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(result.current.generation).toEqual({ status: "generating", nodeId: 1, label: "目標" });

      await act(async () => first.resolve({ dataUrl: "old" }));
      act(() => result.current.generateIllustration(2));
      expect(mockRequest).toHaveBeenCalledTimes(2);

      await act(async () => second.resolve({ dataUrl: "new" }));
      expect(result.current.generation).toEqual({ status: "succeeded", nodeId: 1, label: "目標", dataUrl: "thumb:new" });
    });
  });
});
