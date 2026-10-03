import { act, renderHook, waitFor } from "@testing-library/react";
import { loadIllustrationTexture } from "@/components/map/pixi/illustrationTextureLoader";
import type { PixiRuntime } from "@/components/map/pixi/pixiTypes";
import { useIllustrationTextures } from "@/components/map/useIllustrationTextures";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";
import type { Texture } from "pixi.js";

jest.mock("@/components/map/pixi/illustrationTextureLoader");

const mockedLoad = jest.mocked(loadIllustrationTexture);
const IMAGE = "data:image/jpeg;base64,AAAA";
const OTHER_IMAGE = "data:image/jpeg;base64,BBBB";
const TextureClass = {};
const runtime = { app: {}, constructors: { Texture: TextureClass } } as unknown as PixiRuntime;
const illustratedNode = createTestNode({ id: 1, illustration: IMAGE });

function createTexture() {
  return { destroy: jest.fn() } as unknown as Texture & { destroy: jest.Mock };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useIllustrationTextures", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("イラストのあるノードのテクスチャを読み込んで、data URL をキーに返す", async () => {
    const texture = createTexture();
    mockedLoad.mockResolvedValue(texture);

    const { result } = renderHook(() => useIllustrationTextures(runtime, [illustratedNode]));

    await waitFor(() => expect(result.current.get(IMAGE)).toBe(texture));
    expect(mockedLoad).toHaveBeenCalledWith(TextureClass, IMAGE);
  });

  it("同じ data URL は、1回だけ読み込む", async () => {
    mockedLoad.mockResolvedValue(createTexture());
    const nodes = [illustratedNode, createTestNode({ id: 2, illustration: IMAGE })];

    const { result, rerender } = renderHook(
      ({ currentNodes }: { currentNodes: Node[] }) => useIllustrationTextures(runtime, currentNodes),
      { initialProps: { currentNodes: nodes } },
    );
    await waitFor(() => expect(result.current.has(IMAGE)).toBe(true));
    rerender({ currentNodes: [...nodes] });

    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it("読み込み中に nodes が変わっても、そのテクスチャが最終的に返る", async () => {
    const texture = createTexture();
    const deferred = createDeferred<Texture>();
    mockedLoad.mockReturnValueOnce(deferred.promise);

    const { result, rerender } = renderHook(
      ({ currentNodes }: { currentNodes: Node[] }) => useIllustrationTextures(runtime, currentNodes),
      { initialProps: { currentNodes: [illustratedNode] } },
    );
    rerender({ currentNodes: [illustratedNode, createTestNode({ id: 2 })] });

    await act(async () => {
      deferred.resolve(texture);
      await deferred.promise;
    });

    expect(result.current.get(IMAGE)).toBe(texture);
    expect(texture.destroy).not.toHaveBeenCalled();
    expect(mockedLoad).toHaveBeenCalledTimes(1);
  });

  it("複数の画像のテクスチャをすべて返す", async () => {
    const first = createTexture();
    const second = createTexture();
    mockedLoad.mockImplementation(async (_TextureClass, url) => (url === IMAGE ? first : second));

    const { result } = renderHook(() => useIllustrationTextures(runtime, [
      illustratedNode,
      createTestNode({ id: 2, illustration: OTHER_IMAGE }),
    ]));

    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get(IMAGE)).toBe(first);
    expect(result.current.get(OTHER_IMAGE)).toBe(second);
  });

  it("読み込みに失敗しても、例外を投げず、そのテクスチャは無いまま", async () => {
    const failure = Promise.reject(new Error("decode failed"));
    mockedLoad.mockReturnValue(failure);

    const { result } = renderHook(() => useIllustrationTextures(runtime, [illustratedNode]));
    await act(async () => {
      await failure.catch(() => undefined);
    });

    expect(result.current.size).toBe(0);
  });

  it("runtime が null の間は、何も読み込まない", () => {
    const { result } = renderHook(() => useIllustrationTextures(null, [illustratedNode]));

    expect(mockedLoad).not.toHaveBeenCalled();
    expect(result.current.size).toBe(0);
  });

  it("アンマウント時に、テクスチャを destroy する", async () => {
    const texture = createTexture();
    mockedLoad.mockResolvedValue(texture);
    const { result, unmount } = renderHook(() => useIllustrationTextures(runtime, [illustratedNode]));
    await waitFor(() => expect(result.current.has(IMAGE)).toBe(true));

    unmount();

    expect(texture.destroy).toHaveBeenCalledWith(true);
  });

  it("アンマウント後に読み込みが終わったテクスチャは、すぐに destroy する", async () => {
    const texture = createTexture();
    const deferred = createDeferred<Texture>();
    mockedLoad.mockReturnValueOnce(deferred.promise);
    const { unmount } = renderHook(() => useIllustrationTextures(runtime, [illustratedNode]));

    unmount();
    await act(async () => {
      deferred.resolve(texture);
      await deferred.promise;
    });

    expect(texture.destroy).toHaveBeenCalledWith(true);
  });

  it("runtime が変わると、前の runtime のテクスチャを destroy して、新しい runtime で読み込み直す", async () => {
    const first = createTexture();
    const second = createTexture();
    mockedLoad.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const nextRuntime = { app: {}, constructors: { Texture: {} } } as unknown as PixiRuntime;
    const { result, rerender } = renderHook(
      ({ currentRuntime }: { currentRuntime: PixiRuntime }) =>
        useIllustrationTextures(currentRuntime, [illustratedNode]),
      { initialProps: { currentRuntime: runtime } },
    );
    await waitFor(() => expect(result.current.get(IMAGE)).toBe(first));

    rerender({ currentRuntime: nextRuntime });

    expect(first.destroy).toHaveBeenCalledWith(true);
    expect(result.current.has(IMAGE)).toBe(false);
    await waitFor(() => expect(result.current.get(IMAGE)).toBe(second));
    expect(mockedLoad).toHaveBeenCalledTimes(2);
  });
});
