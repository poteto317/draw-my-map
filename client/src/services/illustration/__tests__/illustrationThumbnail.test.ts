import { ILLUSTRATION_THUMBNAIL_QUALITY, ILLUSTRATION_THUMBNAIL_SIZE } from "@/config/illustration";
import {
  calculateCoverCrop,
  createIllustrationThumbnail,
  IllustrationThumbnailError,
  type ThumbnailDeps,
} from "@/services/illustration/illustrationThumbnail";

describe("calculateCoverCrop", () => {
  it("正方形は、全体を使う", () => {
    expect(calculateCoverCrop(1024, 1024)).toEqual({ sx: 0, sy: 0, size: 1024 });
  });
  it("横長は、中央の正方形を使う", () => {
    expect(calculateCoverCrop(200, 100)).toEqual({ sx: 50, sy: 0, size: 100 });
  });
  it("縦長は、中央の正方形を使う", () => {
    expect(calculateCoverCrop(100, 300)).toEqual({ sx: 0, sy: 100, size: 100 });
  });
});

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
