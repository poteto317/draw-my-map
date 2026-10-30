import { ILLUSTRATION_THUMBNAIL_QUALITY, ILLUSTRATION_THUMBNAIL_SIZE } from "@/config/illustration";
import {
  createIllustrationThumbnail,
  IllustrationThumbnailError,
  type ThumbnailDeps,
} from "@/services/illustration/illustrationThumbnail";

function createDeps(toDataURL: () => string) {
  const drawImage = jest.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => ({ drawImage })),
    toDataURL: jest.fn(toDataURL),
  } as unknown as HTMLCanvasElement;
  const image = {} as CanvasImageSource;
  const deps: ThumbnailDeps = {
    loadImage: jest.fn().mockResolvedValue({ image, width: 200, height: 100 }),
    createCanvas: () => canvas,
  };
  return { deps, canvas, drawImage, image };
}

describe("createIllustrationThumbnail", () => {
  it("中央を正方形に切り出し、128pxの JPEG にして返す", async () => {
    const { deps, canvas, drawImage, image } = createDeps(() => "data:image/jpeg;base64,AAAA");
    await expect(createIllustrationThumbnail("data:image/png;base64,SRC", deps)).resolves.toBe("data:image/jpeg;base64,AAAA");
    expect(canvas.width).toBe(ILLUSTRATION_THUMBNAIL_SIZE);
    expect(canvas.height).toBe(ILLUSTRATION_THUMBNAIL_SIZE);
    expect(drawImage).toHaveBeenCalledWith(image, 50, 0, 100, 100, 0, 0, ILLUSTRATION_THUMBNAIL_SIZE, ILLUSTRATION_THUMBNAIL_SIZE);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", ILLUSTRATION_THUMBNAIL_QUALITY);
  });

  it("画像を読み込めないときは IllustrationThumbnailError", async () => {
    const { deps } = createDeps(() => "data:image/jpeg;base64,AAAA");
    (deps.loadImage as jest.Mock).mockRejectedValue(new Error("decode"));
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });

  it("2D コンテキストが無いときは IllustrationThumbnailError", async () => {
    const { deps, canvas } = createDeps(() => "data:image/jpeg;base64,AAAA");
    (canvas.getContext as jest.Mock).mockReturnValue(null);
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });

  it("出力が data URL の条件を満たさないとき（例: 空の canvas）は IllustrationThumbnailError", async () => {
    const { deps } = createDeps(() => "data:,");
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });

  it("元の画像の大きさが 0 のときは IllustrationThumbnailError", async () => {
    const { deps } = createDeps(() => "data:image/jpeg;base64,AAAA");
    (deps.loadImage as jest.Mock).mockResolvedValue({ image: {}, width: 0, height: 0 });
    await expect(createIllustrationThumbnail("x", deps)).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });
});

describe("createIllustrationThumbnail（既定の依存: Image と canvas 要素）", () => {
  const imagePrototype = HTMLImageElement.prototype;
  const canvasPrototype = HTMLCanvasElement.prototype;
  const originalDescriptors = {
    decode: Object.getOwnPropertyDescriptor(imagePrototype, "decode"),
    naturalWidth: Object.getOwnPropertyDescriptor(imagePrototype, "naturalWidth"),
    naturalHeight: Object.getOwnPropertyDescriptor(imagePrototype, "naturalHeight"),
  };

  function stubImage(decode: () => Promise<void>, width: number, height: number) {
    const decodedSources: string[] = [];
    Object.defineProperty(imagePrototype, "decode", {
      configurable: true,
      value(this: HTMLImageElement) {
        decodedSources.push(this.src);
        return decode();
      },
    });
    Object.defineProperty(imagePrototype, "naturalWidth", { configurable: true, get: () => width });
    Object.defineProperty(imagePrototype, "naturalHeight", { configurable: true, get: () => height });
    return decodedSources;
  }

  afterEach(() => {
    for (const [key, descriptor] of Object.entries(originalDescriptors)) {
      if (descriptor) Object.defineProperty(imagePrototype, key, descriptor);
      else delete (imagePrototype as unknown as Record<string, unknown>)[key];
    }
    jest.restoreAllMocks();
  });

  it("Image で data URL を読み込み、natural の大きさで切り出して canvas 要素へ描く", async () => {
    const decodedSources = stubImage(() => Promise.resolve(), 100, 300);
    const drawImage = jest.fn();
    // getContext は引数ごとのオーバーロードがあり、spyOn の型は最後のもの（webgpu）になるため never で渡す
    jest.spyOn(canvasPrototype, "getContext").mockReturnValue({ drawImage } as never);
    jest.spyOn(canvasPrototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,BBBB");

    await expect(createIllustrationThumbnail("data:image/png;base64,SRC")).resolves.toBe("data:image/jpeg;base64,BBBB");
    expect(decodedSources).toEqual(["data:image/png;base64,SRC"]);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      0,
      100,
      100,
      100,
      0,
      0,
      ILLUSTRATION_THUMBNAIL_SIZE,
      ILLUSTRATION_THUMBNAIL_SIZE,
    );
  });

  it("Image の decode が失敗したときは IllustrationThumbnailError", async () => {
    stubImage(() => Promise.reject(new Error("decode failed")), 100, 100);

    await expect(createIllustrationThumbnail("data:image/png;base64,SRC")).rejects.toBeInstanceOf(IllustrationThumbnailError);
  });
});
