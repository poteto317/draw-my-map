import { withLoadedMapSvgImage } from "@/services/imageExport/loadMapSvgImage";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("withLoadedMapSvgImage", () => {
  let image: HTMLImageElement;
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;

  beforeEach(() => {
    image = {} as HTMLImageElement;
    jest.spyOn(globalThis, "Image").mockImplementation(() => image);
    createObjectURL = jest.fn(() => "blob:map-svg");
    revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: originalRevokeObjectUrl });
    jest.restoreAllMocks();
  });

  function expectReleased() {
    expect(image.onload).toBeNull();
    expect(image.onerror).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-svg");
  }

  it("同じImageをconsumerへ渡し、完了までSVGのURLを保持する", async () => {
    let complete!: (value: string) => void;
    const consume = jest.fn(() => new Promise<string>((resolve) => { complete = resolve; }));
    const promise = withLoadedMapSvgImage("<svg />", consume);
    expect(consume).not.toHaveBeenCalled();
    expect(globalThis.Image).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(createObjectURL.mock.calls[0][0].type).toBe("image/svg+xml;charset=utf-8");
    expect(image.src).toBe("blob:map-svg");
    image.onload?.(new Event("load"));
    expect(consume).toHaveBeenCalledWith(image);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    complete("consumed");
    await expect(promise).resolves.toBe("consumed");
    expectReleased();
  });

  it("error後のloadと重複errorを無視して一度だけ拒否・解放する", async () => {
    const consume = jest.fn();
    const promise = withLoadedMapSvgImage("<svg />", consume);
    const load = image.onload;
    const error = image.onerror;
    error?.call(image, new Event("error"));
    load?.call(image, new Event("load"));
    error?.call(image, new Event("error"));
    await expect(promise).rejects.toThrow("Failed to load SVG image");
    expect(consume).not.toHaveBeenCalled();
    expectReleased();
  });

  it.each(["load", "error"])("load採用後の%sを無視してconsumerを一度だけ実行する", async (event) => {
    let complete!: (value: string) => void;
    const consume = jest.fn(() => new Promise<string>((resolve) => { complete = resolve; }));
    const promise = withLoadedMapSvgImage("<svg />", consume);
    const load = image.onload;
    const error = image.onerror;
    load?.call(image, new Event("load"));
    if (event === "load") load?.call(image, new Event("load"));
    else error?.call(image, new Event("error"));
    expect(consume).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    complete("done");
    await expect(promise).resolves.toBe("done");
    load?.call(image, new Event("load"));
    error?.call(image, new Event("error"));
    expect(consume).toHaveBeenCalledTimes(1);
    expectReleased();
  });

  it.each(["reject", "throw"])("consumerの%sを拒否へ変換して解放する", async (mode) => {
    const failure = new Error("consumer failed");
    const consume = jest.fn(() => {
      if (mode === "throw") throw failure;
      return Promise.reject(failure);
    });
    const promise = withLoadedMapSvgImage("<svg />", consume);
    expect(() => image.onload?.(new Event("load"))).not.toThrow();
    await expect(promise).rejects.toBe(failure);
    expectReleased();
  });

  it("Image生成例外を拒否へ変換してURLを一度だけ解放する", async () => {
    const failure = new Error("Image constructor failed");
    jest.spyOn(globalThis, "Image").mockImplementation(() => { throw failure; });
    const consume = jest.fn();
    await expect(withLoadedMapSvgImage("<svg />", consume)).rejects.toBe(failure);
    expect(consume).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-svg");
  });

  it("src設定例外を拒否へ変換して解放する", async () => {
    const failure = new Error("src setter failed");
    Object.defineProperty(image, "src", { set: () => { throw failure; } });
    const consume = jest.fn();
    await expect(withLoadedMapSvgImage("<svg />", consume)).rejects.toBe(failure);
    expect(consume).not.toHaveBeenCalled();
    expectReleased();
  });

  it("Object URL生成例外を拒否へ変換する", async () => {
    const failure = new Error("URL creation failed");
    createObjectURL.mockImplementation(() => { throw failure; });
    await expect(withLoadedMapSvgImage("<svg />", jest.fn())).rejects.toBe(failure);
    expect(globalThis.Image).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });
});
