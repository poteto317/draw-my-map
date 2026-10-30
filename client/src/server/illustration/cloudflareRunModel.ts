import { readProperty } from "@/domain/shared/unknownRecord";
import { ImageGenerationError, type CloudflareConfig } from "@/server/illustration/cloudflareErrors";

// 公式ドキュメントに無料枠超過時の応答仕様の記載がないため、HTTP 429 とメッセージで保守的に判定する
const QUOTA_MESSAGE_PATTERN = /neuron|allocation|quota|limit/i;

// FLUX.1 schnell は、無害なプロンプトも、ランダムに NSFW と誤判定して拒否する（HTTP 400, code 8007）
const CONTENT_REJECTED_CODE = 8007;
const CONTENT_REJECTED_PATTERN = /NSFW/i;

// 応答の本文は { success, result, errors: [{ code, message }] } の形を想定するが、形は保証されないため unknown のまま読む
function firstError(body: unknown): unknown {
  return readProperty(readProperty(body, "errors"), "0");
}

function firstErrorMessage(body: unknown): string {
  const message = readProperty(firstError(body), "message");
  return typeof message === "string" ? message : "";
}

function isContentRejected(body: unknown): boolean {
  return readProperty(firstError(body), "code") === CONTENT_REJECTED_CODE
    || CONTENT_REJECTED_PATTERN.test(firstErrorMessage(body));
}

function isSuccessBody(body: unknown): boolean {
  return readProperty(body, "success") === true;
}

// Workers AI のモデルを1回呼び、応答の result を返す。失敗は ImageGenerationError に分類する
export async function runCloudflareModel(
  config: CloudflareConfig,
  model: string,
  input: unknown,
  { fetchImpl = fetch, timeoutMs = 60_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<unknown> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/ai/run/${model}`;

  // 上流が応答しないと、処理中の状態が続いてしまうため、時間切れで中断する
  // タイマーは、応答ヘッダーの受信後も、本文の読み込みが終わるまで解除しない
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  let body: unknown;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    body = await response.json().catch((error: unknown) => {
      // 時間切れによる中断は、JSONの不正とは区別する。ただし 429 は、ステータスだけで判定できるため、本文なしで続ける
      if (controller.signal.aborted && response.status !== 429) throw error;
      return null;
    });
  } catch {
    // 例外のメッセージにトークンが含まれ得るため、固定の文言にする
    throw new ImageGenerationError("upstream-error", "AIの呼び出しに失敗しました");
  } finally {
    clearTimeout(timer);
  }

  const errorMessage = firstErrorMessage(body);

  // 内容の誤判定は、無料枠・一般の失敗より先に判定する（再試行の対象にするため）
  if (response.status !== 429 && (!response.ok || !isSuccessBody(body)) && isContentRejected(body)) {
    throw new ImageGenerationError("content-rejected", "画像生成AIが、内容を不適切と判定しました");
  }

  if (response.status === 429 || (!response.ok && QUOTA_MESSAGE_PATTERN.test(errorMessage))) {
    throw new ImageGenerationError("quota-exceeded", "AIの無料枠を使い切りました");
  }
  if (!response.ok || !isSuccessBody(body)) {
    throw new ImageGenerationError("upstream-error", "AIの応答が不正です");
  }
  return readProperty(body, "result");
}
