// AI 支援の提供元（Claude API・OpenAI API）を差し替える共通のインターフェース。SDK に依存しない

export const AI_ASSIST_PROVIDER_TIMEOUT_MS = 120_000;

// additionalProperties: false・全項目の required を付けた JSON スキーマ
export type JsonSchemaObject = { readonly type: "object"; readonly [key: string]: unknown };

export type AiTextRequest = {
  system: string;
  user: string;
  schemaName: string;
  schema: JsonSchemaObject;
  maxOutputTokens: number;
  signal: AbortSignal;
};

// 応答の JSON を解析した値（形は呼び出し側が検証する）
export type AiTextGenerator = (request: AiTextRequest) => Promise<unknown>;

export type AiAssistErrorKind =
  | "rate-limited" | "auth-failed" | "timeout" | "aborted"
  | "refused" | "truncated" | "invalid-output" | "upstream-error";

// 文言は種類だけから作る。SDK の例外の文言・応答本文・キー・プロンプトを入れない（L-017・L-634）
export class AiAssistError extends Error {
  readonly kind: AiAssistErrorKind;

  constructor(kind: AiAssistErrorKind) {
    super(`AI 支援の呼び出しに失敗しました: ${kind}`);
    this.name = "AiAssistError";
    this.kind = kind;
  }
}

// HTTP ステータスの読み方は提供元をまたいで同じ。SDK の誤りのクラスの判定（中断・接続・時間切れ）は各アダプタで行う
export function aiAssistErrorKindFromStatus(status: number | null): AiAssistErrorKind {
  if (status === 429) return "rate-limited";
  if (status === 401 || status === 403) return "auth-failed";
  return "upstream-error";
}

export type AiAssistProvider = "anthropic" | "openai";

export type AiAssistConfig =
  | { provider: "anthropic"; apiKey: string; model: string }
  | { provider: "openai"; apiKey: string; model: string };

// 失敗をログに残して誤りを作る。ログは提供元・種類・HTTP ステータスだけ（L-029）
export function aiAssistFailure(
  provider: AiAssistProvider,
  kind: AiAssistErrorKind,
  status: number | null = null,
): AiAssistError {
  console.warn(`[ai-assist] provider=${provider} kind=${kind} status=${status ?? "-"}`);
  return new AiAssistError(kind);
}
