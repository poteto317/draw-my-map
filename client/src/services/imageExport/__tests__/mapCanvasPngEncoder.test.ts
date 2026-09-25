import { createMapPngEncoder } from "@/services/imageExport/mapCanvasPngEncoder";

describe("createMapPngEncoder", () => {
  let image: HTMLImageElement;
  let context: CanvasRenderingContext2D;
  let canvas: HTMLCanvasElement;
  let png: Blob;

  beforeEach(() => {
    image = {} as HTMLImageElement;
    png = new Blob(["png"], { type: "image/png" });
    context = { scale: jest.fn(), drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;
    canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => context),
      toBlob: jest.fn((callback: BlobCallback) => callback(png)),
    } as unknown as HTMLCanvasElement;
    jest.spyOn(document, "createElement").mockReturnValue(canvas);
  });

  afterEach(() => jest.restoreAllMocks());

  it("Canvasを2倍寸法で準備し、画像を論理寸法で描画してPNGを返す", async () => {
    const encode = createMapPngEncoder(320, 180);
    expect(document.createElement).toHaveBeenCalledWith("canvas");
    expect(canvas.getContext).toHaveBeenCalledWith("2d");
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.drawImage).not.toHaveBeenCalled();
    await expect(encode(image)).resolves.toBe(png);
    expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 320, 180);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
  });

  it("小数の論理寸法は2倍以上の整数ピクセルへ切り上げる", () => {
    createMapPngEncoder(320.25, 180.25);

    expect(canvas.width).toBe(641);
    expect(canvas.height).toBe(361);
  });

  it.each([
    [Number.MAX_VALUE, 180],
    [320, Number.MAX_VALUE],
  ])("2倍後のCanvas寸法が有限値でない場合は失敗する", (width, height) => {
    expect(() => createMapPngEncoder(width, height)).toThrow(
      new RangeError("PNG canvas dimensions must be finite"),
    );
  });

  it("2D context欠損を画像消費前に通知する", () => {
    jest.spyOn(canvas, "getContext").mockReturnValue(null);
    expect(() => createMapPngEncoder(320, 180)).toThrow("Canvas 2D context is unavailable");
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("drawImage例外を拒否して符号化を開始しない", async () => {
    const failure = new Error("draw failed");
    jest.spyOn(context, "drawImage").mockImplementation(() => { throw failure; });
    await expect(createMapPngEncoder(320, 180)(image)).rejects.toBe(failure);
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });

  it("toBlob例外を拒否へ変換する", async () => {
    const failure = new Error("toBlob failed");
    jest.spyOn(canvas, "toBlob").mockImplementation(() => { throw failure; });
    await expect(createMapPngEncoder(320, 180)(image)).rejects.toBe(failure);
  });

  it("null Blobを拒否する", async () => {
    jest.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(null));
    await expect(createMapPngEncoder(320, 180)(image)).rejects.toThrow("Failed to create PNG blob");
  });

  it("最初のBlob callbackだけを採用する", async () => {
    jest.spyOn(canvas, "toBlob").mockImplementation((callback) => {
      callback(png);
      callback(null);
      throw new Error("late toBlob failure");
    });
    await expect(createMapPngEncoder(320, 180)(image)).resolves.toBe(png);
  });
});
