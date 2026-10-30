import { readProperty } from "@/domain/shared/unknownRecord";
import {
  ImageGenerationError,
  type CloudflareConfig,
  type ImageGenerationErrorKind,
} from "@/server/illustration/cloudflareErrors";
import { runCloudflareModel } from "@/server/illustration/cloudflareRunModel";

// 循環importを避けるため、エラーと設定の型は cloudflareErrors.ts に置き、既存のimport元のためにここから再エクスポートする
export { ImageGenerationError };
export type { CloudflareConfig, ImageGenerationErrorKind };

const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export type GeneratedImage = { base64: string; mimeType: "image/jpeg" };
export type ImageGenerator = (prompt: string) => Promise<GeneratedImage>;

export function readCloudflareConfig(
  env: Record<string, string | undefined>,
): CloudflareConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  // アカウントIDはURLのパスに埋め込むため、英数字・ハイフン・アンダースコアのみ許可する
  if (!accountId || !apiToken || !/^[A-Za-z0-9_-]+$/.test(accountId)) return null;
  return { accountId, apiToken };
}

export function createCloudflareImageGenerator(
  config: CloudflareConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 60_000,
): ImageGenerator {
  return async (prompt) => {
    // 実際の API は seed を拒否する（HTTP 400, code 5006）ため、送らない
    const result = await runCloudflareModel(config, IMAGE_MODEL, { prompt, steps: 4 }, { fetchImpl, timeoutMs });
    const image = readProperty(result, "image");
    if (typeof image !== "string") {
      throw new ImageGenerationError("upstream-error", "画像生成の応答が不正です");
    }
    return { base64: image, mimeType: "image/jpeg" };
  };
}
