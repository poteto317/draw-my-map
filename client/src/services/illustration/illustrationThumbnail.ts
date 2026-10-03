import { ILLUSTRATION_THUMBNAIL_QUALITY, ILLUSTRATION_THUMBNAIL_SIZE } from "@/config/illustration";
import { calculateCoverCrop } from "@/domain/illustration/illustrationCrop";
import { isIllustrationDataUrl } from "@/domain/illustration/illustrationDataUrl";

export class IllustrationThumbnailError extends Error {
  constructor() {
    super("illustration thumbnail failed");
    this.name = "IllustrationThumbnailError";
  }
}

export type ThumbnailDeps = {
  loadImage: (dataUrl: string) => Promise<{ image: CanvasImageSource; width: number; height: number }>;
  createCanvas: () => HTMLCanvasElement;
};

const defaultDeps: ThumbnailDeps = {
  loadImage: async (dataUrl) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  },
  createCanvas: () => document.createElement("canvas"),
};

// 生成画像（1024px 程度）を、保存・表示に十分な大きさの JPEG に縮小する
export async function createIllustrationThumbnail(
  dataUrl: string,
  deps: ThumbnailDeps = defaultDeps,
): Promise<string> {
  try {
    const { image, width, height } = await deps.loadImage(dataUrl);
    if (!(width > 0) || !(height > 0)) throw new IllustrationThumbnailError();

    const canvas = deps.createCanvas();
    canvas.width = ILLUSTRATION_THUMBNAIL_SIZE;
    canvas.height = ILLUSTRATION_THUMBNAIL_SIZE;
    const context = canvas.getContext("2d");
    if (context === null) throw new IllustrationThumbnailError();

    const { sx, sy, size } = calculateCoverCrop(width, height);
    context.drawImage(image, sx, sy, size, size, 0, 0, ILLUSTRATION_THUMBNAIL_SIZE, ILLUSTRATION_THUMBNAIL_SIZE);
    const thumbnail = canvas.toDataURL("image/jpeg", ILLUSTRATION_THUMBNAIL_QUALITY);
    if (!isIllustrationDataUrl(thumbnail)) throw new IllustrationThumbnailError();
    return thumbnail;
  } catch (error) {
    throw error instanceof IllustrationThumbnailError ? error : new IllustrationThumbnailError();
  }
}
