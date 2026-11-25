import OpenAI from "openai";
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

// OPENAI_BASE_URL・OPENAI_ORG_ID・OPENAI_PROJECT_ID を SDK に読ませない（L-752）
// OPENAI_CUSTOM_HEADERS は SDK が必ず読むので、サーバーの環境で設定しない（inventory §2.4）
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type OpenAIClientOptions = {
  apiKey: string;
  organization: null;
  project: null;
  baseURL: string;
  timeout: number;
  maxRetries: number;
  // SDK のログを OPENAI_LOG で変えさせない（プロンプトをログに出さない。L-017・L-752）
  logLevel: "off";
};

export type OpenAIResponseBody = {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens: number;
  reasoning: { effort: "low" };
  text: { format: { type: "json_schema"; name: string; schema: JsonSchemaObject; strict: true } };
};

// アダプタが使う SDK の面だけ。テストではフェイクを渡す（メソッドの書き方にして SDK の多重定義と互換にする）
export type OpenAIResponsesClient = {
  responses: {
    create(body: OpenAIResponseBody, options: { signal: AbortSignal }): Promise<unknown>;
  };
};

function statusOf(error: unknown): number | null {
  return error instanceof OpenAI.APIError && typeof error.status === "number" ? error.status : null;
}

// 子のクラスから先に見る: 中断・接続エラーは APIError の子、時間切れは接続エラーの子
function classifyError(error: unknown): AiAssistErrorKind {
  if (error instanceof OpenAI.APIUserAbortError) return "aborted";
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "timeout";
  if (error instanceof OpenAI.APIConnectionError) return "upstream-error";
  return aiAssistErrorKindFromStatus(statusOf(error));
}

// 推論の項目などが先に来るので、message の項目の content だけを集める
function messageParts(response: unknown): unknown[] {
  const output = readProperty(response, "output");
  if (!Array.isArray(output)) return [];
  return output.flatMap((item: unknown) => {
    if (readProperty(item, "type") !== "message") return [];
    const content = readProperty(item, "content");
    return Array.isArray(content) ? content : [];
  });
}

// SDK の便利な項目 output_text を優先し、無ければ output_text の部分をつなぐ（実行時に欠ける可能性を残すため typeof で確かめる）
function outputText(response: unknown, parts: readonly unknown[]): string {
  const helper = readProperty(response, "output_text");
  if (typeof helper === "string" && helper !== "") return helper;
  return parts
    .filter((part) => readProperty(part, "type") === "output_text")
    .map((part) => readProperty(part, "text"))
    .filter((text): text is string => typeof text === "string")
    .join("");
}

function failIncomplete(response: unknown): never {
  const reason = readProperty(readProperty(response, "incomplete_details"), "reason");
  if (reason === "max_output_tokens") throw aiAssistFailure("openai", "truncated");
  if (reason === "content_filter") throw aiAssistFailure("openai", "refused");
  throw aiAssistFailure("openai", "upstream-error");
}

// status → 拒否 → 本文 → JSON の順で判定する。解析つきヘルパーは使わない（L-633）
function readJson(response: unknown): unknown {
  const status = readProperty(response, "status");
  if (status === "incomplete") failIncomplete(response);
  if (status !== "completed") throw aiAssistFailure("openai", "upstream-error");
  const parts = messageParts(response);
  if (parts.some((part) => readProperty(part, "type") === "refusal")) throw aiAssistFailure("openai", "refused");
  const text = outputText(response, parts);
  if (text === "") throw aiAssistFailure("openai", "invalid-output");
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    throw aiAssistFailure("openai", "invalid-output");
  }
}

export function createOpenAITextGenerator(
  config: Extract<AiAssistConfig, { provider: "openai" }>,
  createClient: (options: OpenAIClientOptions) => OpenAIResponsesClient = (options) => new OpenAI(options),
): AiTextGenerator {
  const client = createClient({
    apiKey: config.apiKey,
    organization: null,
    project: null,
    baseURL: OPENAI_BASE_URL,
    timeout: AI_ASSIST_PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
    logLevel: "off",
  });
  return async (request) => {
    let response: unknown;
    try {
      response = await client.responses.create({
        model: config.model,
        instructions: request.system,
        input: request.user,
        max_output_tokens: request.maxOutputTokens,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name: request.schemaName, schema: request.schema, strict: true } },
      }, { signal: request.signal });
    } catch (error) {
      throw aiAssistFailure("openai", classifyError(error), statusOf(error));
    }
    return readJson(response);
  };
}
