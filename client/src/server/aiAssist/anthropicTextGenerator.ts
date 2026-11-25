import Anthropic from "@anthropic-ai/sdk";
import { readProperty } from "@/domain/shared/unknownRecord";
import {
  AI_ASSIST_PROVIDER_TIMEOUT_MS,
  aiAssistErrorKindFromStatus,
  aiAssistFailure,
  type AiAssistConfig,
  type AiAssistErrorKind,
  type AiTextGenerator,
  type JsonSchemaObject,
} from "@/server/aiAssist/aiTextGenerator";

// ANTHROPIC_BASE_URL などのシェル変数で送信先が変わらないよう、明示して渡す（L-752）
// ANTHROPIC_CUSTOM_HEADERS は SDK が必ず読むので、サーバーの環境で設定しない（inventory §2.4）
export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

export type AnthropicClientOptions = {
  apiKey: string;
  authToken: null;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  // SDK のログを ANTHROPIC_LOG で変えさせない（プロンプトをログに出さない。L-017・L-752）
  logLevel: "off";
};

export type AnthropicMessageBody = {
  model: string;
  max_tokens: number;
  system: string;
  messages: [{ role: "user"; content: string }];
  output_config: { format: { type: "json_schema"; schema: JsonSchemaObject }; effort: "low" };
};

// アダプタが使う SDK の面だけ。テストではフェイクを渡す（メソッドの書き方にして SDK の多重定義と互換にする）
export type AnthropicMessagesClient = {
  messages: {
    create(body: AnthropicMessageBody, options: { signal: AbortSignal }): Promise<unknown>;
  };
};

function statusOf(error: unknown): number | null {
  return error instanceof Anthropic.APIError && typeof error.status === "number" ? error.status : null;
}

// 子のクラスから先に見る: 中断・接続エラーは APIError の子、時間切れは接続エラーの子
function classifyError(error: unknown): AiAssistErrorKind {
  if (error instanceof Anthropic.APIUserAbortError) return "aborted";
  if (error instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (error instanceof Anthropic.APIConnectionError) return "upstream-error";
  return aiAssistErrorKindFromStatus(statusOf(error));
}

// stop_reason → text のブロック → JSON の順で判定する。解析つきヘルパーは使わない（L-633）
function readJson(response: unknown): unknown {
  const stopReason = readProperty(response, "stop_reason");
  if (stopReason === "refusal") throw aiAssistFailure("anthropic", "refused");
  if (stopReason === "max_tokens") throw aiAssistFailure("anthropic", "truncated");
  if (stopReason !== "end_turn") throw aiAssistFailure("anthropic", "upstream-error");
  const content = readProperty(response, "content");
  // 思考のブロックが先に来るので、先頭のブロックを決め打ちしない
  const textBlock = Array.isArray(content)
    ? content.find((block: unknown) => readProperty(block, "type") === "text")
    : undefined;
  const text = readProperty(textBlock, "text");
  if (typeof text !== "string") throw aiAssistFailure("anthropic", "invalid-output");
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw aiAssistFailure("anthropic", "invalid-output");
  }
}

export function createAnthropicTextGenerator(
  config: Extract<AiAssistConfig, { provider: "anthropic" }>,
  createClient: (options: AnthropicClientOptions) => AnthropicMessagesClient = (options) => new Anthropic(options),
): AiTextGenerator {
  const client = createClient({
    apiKey: config.apiKey,
    authToken: null,
    baseURL: ANTHROPIC_BASE_URL,
    timeout: AI_ASSIST_PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
    logLevel: "off",
  });
  return async (request) => {
    let response: unknown;
    try {
      response = await client.messages.create({
        model: config.model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        output_config: { format: { type: "json_schema", schema: request.schema }, effort: "low" },
      }, { signal: request.signal });
    } catch (error) {
      throw aiAssistFailure("anthropic", classifyError(error), statusOf(error));
    }
    return readJson(response);
  };
}
