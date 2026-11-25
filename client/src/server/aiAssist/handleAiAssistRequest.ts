import { AI_ASSIST_PROVIDER_LABELS, readAiAssistAllowedHosts, readAiAssistConfig } from "@/server/aiAssist/aiAssistConfig";
import { checkAiAssistRequestOrigin } from "@/server/aiAssist/aiAssistRequestOrigin";
import type { AiAssistTask } from "@/server/aiAssist/aiAssistTasks";
import {
  AiAssistError,
  type AiAssistConfig,
  type AiAssistErrorKind,
  type AiTextGenerator,
} from "@/server/aiAssist/aiTextGenerator";

export const AI_ASSIST_MAX_BODY_BYTES = 256 * 1024;

export type AiAssistRouteDeps = {
  env: Record<string, string | undefined>;
  createGenerator: (config: AiAssistConfig) => AiTextGenerator;
};

// aborted（ブラウザの中断）は読む相手がいないが、返す値を 1 つに決めておく。truncated は invalid-output にまとめる
const FAILURE_RESPONSES: Readonly<Record<AiAssistErrorKind, { code: string; status: number }>> = {
  "rate-limited": { code: "rate-limited", status: 429 },
  "auth-failed": { code: "auth-failed", status: 502 },
  timeout: { code: "timeout", status: 504 },
  aborted: { code: "upstream-error", status: 502 },
  refused: { code: "refused", status: 422 },
  truncated: { code: "invalid-output", status: 502 },
  "invalid-output": { code: "invalid-output", status: 502 },
  "upstream-error": { code: "upstream-error", status: 502 },
};

function errorResponse(code: string, status: number): Response {
  return Response.json({ error: code }, { status });
}

function failureResponse(error: unknown): Response {
  if (error instanceof AiAssistError) {
    const { code, status } = FAILURE_RESPONSES[error.kind];
    return errorResponse(code, status);
  }
  // 想定外の例外は内部の情報を返さない（L-017）
  return errorResponse("upstream-error", 502);
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return undefined;
  }
}

type ReadBodyResult = { kind: "ok"; text: string } | { kind: "too-large" } | { kind: "error" };

// 本文を少しずつ読み、合計が上限を超えた時点で読むのをやめる。Content-Length の無い分割転送でも、
// 上限を大きく超える本文を全部メモリへ読み込まない
async function readBodyWithinLimit(request: Request): Promise<ReadBodyResult> {
  if (request.body === null) return { kind: "ok", text: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > AI_ASSIST_MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { kind: "too-large" };
      }
      chunks.push(value);
    }
  } catch {
    return { kind: "error" };
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", text: new TextDecoder().decode(bytes) };
}

// 送信元の確認 → 本文のサイズ → 形の検証 → 設定 → 生成 → 出力の検証（設計 §4.6）
export async function handleAiAssistRequest<Body>(
  request: Request,
  task: AiAssistTask<Body>,
  { env, createGenerator }: AiAssistRouteDeps,
): Promise<Response> {
  // 拒んだときは本文を読まず、generator も作らない
  if (!checkAiAssistRequestOrigin(request, "POST", readAiAssistAllowedHosts(env))) return errorResponse("forbidden", 403);
  // 申告された長さが上限を超えれば本文を読まない。申告は偽れる（無いこともある）ので、読みながらバイト数でも判定する
  if (Number(request.headers.get("content-length") ?? 0) > AI_ASSIST_MAX_BODY_BYTES) {
    return errorResponse("too-large", 413);
  }

  const read = await readBodyWithinLimit(request);
  if (read.kind === "too-large") return errorResponse("too-large", 413);
  if (read.kind === "error") return errorResponse("invalid-request", 400);
  const text = read.text;

  const body = task.parseBody(parseJson(text));
  if (body === null) return errorResponse("invalid-request", 400);

  const config = readAiAssistConfig(env);
  if (config === null) return errorResponse("not-configured", 503);

  let output: unknown;
  try {
    output = await createGenerator(config)({ ...task.buildRequest(body), signal: request.signal });
  } catch (error) {
    return failureResponse(error);
  }
  const validated = task.validateOutput(output, body);
  if (validated === null) return errorResponse("invalid-output", 502);
  return Response.json(validated);
}

// 提供元・モデル名を返すため、GET にも送信元の確認を掛ける
export function handleAiAssistStatusRequest(
  request: Request,
  { env }: { env: Record<string, string | undefined> },
): Response {
  if (!checkAiAssistRequestOrigin(request, "GET", readAiAssistAllowedHosts(env))) return errorResponse("forbidden", 403);
  const config = readAiAssistConfig(env);
  if (config === null) return Response.json({ available: false });
  return Response.json({
    available: true,
    provider: config.provider,
    providerLabel: AI_ASSIST_PROVIDER_LABELS[config.provider],
    model: config.model,
  });
}
