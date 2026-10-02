export type GeneratedImage = { base64: string; mimeType: "image/jpeg" };
export type ImageGenerator = (prompt: string) => Promise<GeneratedImage>;
export type ImageGenerationErrorKind = "quota-exceeded" | "upstream-error";
export type CloudflareConfig = { accountId: string; apiToken: string };

export class ImageGenerationError extends Error {
  readonly kind: ImageGenerationErrorKind;

  constructor(kind: ImageGenerationErrorKind, message: string) {
    super(message);
    this.name = "ImageGenerationError";
    this.kind = kind;
  }
}

// 公式ドキュメントに無料枠超過時の応答仕様の記載がないため、HTTP 429 とメッセージで保守的に判定する
const QUOTA_MESSAGE_PATTERN = /neuron|allocation|quota|limit/i;

export function readCloudflareConfig(
  env: Record<string, string | undefined>,
): CloudflareConfig | null {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = env.CLOUDFLARE_API_TOKEN?.trim();
  // アカウントIDはURLのパスに埋め込むため、英数字・ハイフン・アンダースコアのみ許可する
  if (!accountId || !apiToken || !/^[A-Za-z0-9_-]+$/.test(accountId)) return null;
  return { accountId, apiToken };
}

type CloudflareResponseBody = {
  success?: boolean;
  result?: { image?: unknown };
  errors?: Array<{ message?: unknown }>;
};

function firstErrorMessage(body: CloudflareResponseBody | null): string {
  const message = body?.errors?.[0]?.message;
  return typeof message === "string" ? message : "";
}

export function createCloudflareImageGenerator(
  config: CloudflareConfig,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 60_000,
): ImageGenerator {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

  return async (prompt) => {
    // 上流が応答しないと、生成中の状態が続いてしまうため、時間切れで中断する
    // タイマーは、応答ヘッダーの受信後も、本文の読み込みが終わるまで解除しない
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    let body: CloudflareResponseBody | null;
    try {
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        // 実際の API は seed を拒否する（HTTP 400, code 5006）ため、送らない
        body: JSON.stringify({ prompt, steps: 4 }),
        signal: controller.signal,
      });
      body = (await response.json().catch((error: unknown) => {
        // 時間切れによる中断は、JSONの不正とは区別する。ただし 429 は、ステータスだけで判定できるため、本文なしで続ける
        if (controller.signal.aborted && response.status !== 429) throw error;
        return null;
      })) as CloudflareResponseBody | null;
    } catch {
      // 例外のメッセージにトークンが含まれ得るため、固定の文言にする
      throw new ImageGenerationError("upstream-error", "画像生成の呼び出しに失敗しました");
    } finally {
      clearTimeout(timer);
    }

    const errorMessage = firstErrorMessage(body);

    if (response.status === 429 || (!response.ok && QUOTA_MESSAGE_PATTERN.test(errorMessage))) {
      throw new ImageGenerationError("quota-exceeded", "画像生成の無料枠を使い切りました");
    }
    if (!response.ok || body?.success !== true || typeof body.result?.image !== "string") {
      throw new ImageGenerationError("upstream-error", "画像生成の応答が不正です");
    }
    return { base64: body.result.image, mimeType: "image/jpeg" };
  };
}
