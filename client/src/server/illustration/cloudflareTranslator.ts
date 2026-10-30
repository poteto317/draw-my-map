import { readProperty } from "@/domain/shared/unknownRecord";
import { ImageGenerationError, type CloudflareConfig } from "@/server/illustration/cloudflareErrors";
import { runCloudflareModel } from "@/server/illustration/cloudflareRunModel";

export type Translator = (text: string) => Promise<string>;

const TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b";

// FLUX は日本語が混じると文字を描いてしまうため、先に英語へ翻訳する
export function createCloudflareTranslator(
  config: CloudflareConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 30_000,
): Translator {
  return async (text) => {
    const result = await runCloudflareModel(
      config,
      TRANSLATION_MODEL,
      { text, source_lang: "japanese", target_lang: "english" },
      { fetchImpl, timeoutMs },
    );
    const translated = readProperty(result, "translated_text");
    if (typeof translated !== "string" || translated.trim() === "") {
      throw new ImageGenerationError("upstream-error", "翻訳の応答が不正です");
    }
    return translated.trim();
  };
}
