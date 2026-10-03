import type { Texture } from "pixi.js";

// data URL の画像を、デコードしてから Texture にする（描画の時点で、同期的に使えるようにするため）
export async function loadIllustrationTexture(
  TextureClass: typeof Texture,
  dataUrl: string,
): Promise<Texture> {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return TextureClass.from(image);
}
