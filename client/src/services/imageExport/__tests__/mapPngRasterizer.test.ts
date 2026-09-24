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

  it("loaderが読み込んだImageをencoderへ渡して最終PNGを返す", async () => {
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
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 320, 180);
    expect(ImageMock).toHaveBeenCalledTimes(1);
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

});
