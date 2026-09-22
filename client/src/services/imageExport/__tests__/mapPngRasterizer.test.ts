import { rasterizeMapSvgToPng } from "@/services/imageExport/mapPngRasterizer";

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

describe("mapPngRasterizer", () => {
  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    jest.restoreAllMocks();
  });

  it("SVGを2倍のピクセル寸法でPNGへ変換してobject URLを解放する", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    const scale = jest.fn();
    const drawImage = jest.fn();
    const context = { scale, drawImage } as unknown as CanvasRenderingContext2D;
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => context),
      toBlob: jest.fn((callback: BlobCallback) => callback(png)),
    } as unknown as HTMLCanvasElement;
    jest.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") {
        return canvas;
      }
      throw new Error(`Unexpected element: ${tagName}`);
    }) as typeof document.createElement);

    const image = {} as HTMLImageElement;
    const ImageMock = jest.spyOn(globalThis, "Image")
      .mockImplementation(() => image);
    const createObjectURL = jest.fn((blob: Blob) => {
      void blob;
      return "blob:map-svg";
    });
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const promise = rasterizeMapSvgToPng("<svg />", 320, 180);
    image.onload?.(new Event("load"));

    await expect(promise).resolves.toBe(png);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(scale).toHaveBeenCalledWith(2, 2);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 320, 180);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(ImageMock).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const svgBlob = createObjectURL.mock.calls[0][0];
    expect(svgBlob).toBeInstanceOf(Blob);
    expect(svgBlob.type).toBe("image/svg+xml;charset=utf-8");
    expect(image.src).toBe("blob:map-svg");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-svg");
  });

  it("2Dコンテキストを取得できない場合は画像を作らず変換を拒否する", async () => {
    const canvas = {
      getContext: jest.fn(() => null),
    } as unknown as HTMLCanvasElement;
    jest.spyOn(document, "createElement").mockReturnValue(canvas);
    const ImageMock = jest.spyOn(globalThis, "Image");
    const createObjectURL = jest.fn(() => "blob:map-svg");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const promise = rasterizeMapSvgToPng("<svg />", 320, 180);

    await expect(promise).rejects.toThrow("Canvas 2D context is unavailable");
    expect(ImageMock).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it("SVG画像を読み込めない場合は変換を拒否してobject URLを解放する", async () => {
    const context = {
      scale: jest.fn(),
      drawImage: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      getContext: jest.fn(() => context),
    } as unknown as HTMLCanvasElement;
    jest.spyOn(document, "createElement").mockReturnValue(canvas);
    const image = {} as HTMLImageElement;
    jest.spyOn(globalThis, "Image").mockImplementation(() => image);
    const createObjectURL = jest.fn(() => "blob:map-svg");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const promise = rasterizeMapSvgToPng("<svg />", 320, 180);
    expect(image.onerror).toEqual(expect.any(Function));
    image.onerror?.(new Event("error"));

    await expect(promise).rejects.toThrow("Failed to load SVG image");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-svg");
  });

  it("canvas描画が失敗した場合は変換を拒否してobject URLを解放する", async () => {
    const drawError = new Error("draw failed");
    const context = {
      scale: jest.fn(),
      drawImage: jest.fn(() => {
        throw drawError;
      }),
    } as unknown as CanvasRenderingContext2D;
    const toBlob = jest.fn();
    const canvas = {
      getContext: jest.fn(() => context),
      toBlob,
    } as unknown as HTMLCanvasElement;
    jest.spyOn(document, "createElement").mockReturnValue(canvas);
    const image = {} as HTMLImageElement;
    jest.spyOn(globalThis, "Image").mockImplementation(() => image);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:map-svg"),
    });
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const promise = rasterizeMapSvgToPng("<svg />", 320, 180);
    expect(() => image.onload?.(new Event("load"))).not.toThrow();

    await expect(promise).rejects.toBe(drawError);
    expect(toBlob).not.toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-svg");
  });

  it("canvasがPNG Blobを生成できない場合は変換を拒否してobject URLを解放する", async () => {
    const context = {
      scale: jest.fn(),
      drawImage: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      getContext: jest.fn(() => context),
      toBlob: jest.fn((callback: BlobCallback) => callback(null)),
    } as unknown as HTMLCanvasElement;
    jest.spyOn(document, "createElement").mockReturnValue(canvas);
    const image = {} as HTMLImageElement;
    jest.spyOn(globalThis, "Image").mockImplementation(() => image);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: jest.fn(() => "blob:map-svg"),
    });
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const promise = rasterizeMapSvgToPng("<svg />", 320, 180);
    image.onload?.(new Event("load"));

    await expect(promise).rejects.toThrow("Failed to create PNG blob");
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:map-svg");
  });
});
