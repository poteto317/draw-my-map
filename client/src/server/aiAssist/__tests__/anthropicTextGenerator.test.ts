/** @jest-environment node */
import Anthropic from "@anthropic-ai/sdk";
import {
  ANTHROPIC_BASE_URL,
  createAnthropicTextGenerator,
  type AnthropicMessageBody,
} from "@/server/aiAssist/anthropicTextGenerator";
import { AiAssistError, type AiAssistErrorKind, type AiTextRequest } from "@/server/aiAssist/aiTextGenerator";

const SECRET_KEY = "sk-ant-test-secret-key";
const SECRET_PROMPT = "利用者の秘密のメモ本文";
const CONFIG = { provider: "anthropic", apiKey: SECRET_KEY, model: "claude-opus-5-5" } as const;
const SCHEMA = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } } as const;

function textRequest(signal = new AbortController().signal): AiTextRequest {
  return { system: "システム", user: SECRET_PROMPT, schemaName: "branch_summary", schema: SCHEMA, maxOutputTokens: 4000, signal };
}

function fakeClient(create: jest.Mock) {
  const createClient = jest.fn(() => ({ messages: { create } }));
  return { createClient, generate: createAnthropicTextGenerator(CONFIG, createClient) };
}

function message(overrides: Record<string, unknown>) {
  return { stop_reason: "end_turn", content: [{ type: "text", text: "{\"summary\":\"要約\"}" }], ...overrides };
}

type SdkErrorName = "abort" | "timeout" | "connection" | 400 | 401 | 403 | 404 | 429 | 500 | 529;

// SDK の誤りを作る。版によってコンストラクタが違えば、この関数の中だけを Task 1 の記録に合わせる
function sdkError(name: SdkErrorName): Error {
  if (name === "abort") return new Anthropic.APIUserAbortError();
  if (name === "timeout") return new Anthropic.APIConnectionTimeoutError();
  if (name === "connection") return new Anthropic.APIConnectionError({ message: `接続失敗 ${SECRET_KEY} ${SECRET_PROMPT}` });
  return Anthropic.APIError.generate(
    name,
    { type: "error", error: { type: "x", message: `${SECRET_KEY} ${SECRET_PROMPT}` } },
    `${SECRET_KEY} ${SECRET_PROMPT}`,
    new Headers(),
  );
}

let warn: jest.SpyInstance;

beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

// 誤りの文言とログにキー・プロンプト・SDK の文言が出ないこと（L-027。全失敗経路で確かめる）
function expectNoSecrets(error: unknown) {
  const logged = JSON.stringify(warn.mock.calls);
  for (const secret of [SECRET_KEY, SECRET_PROMPT]) {
    expect(String((error as Error).message)).not.toContain(secret);
    expect(logged).not.toContain(secret);
  }
}

async function failureOf(promise: Promise<unknown>): Promise<AiAssistError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(AiAssistError);
  expectNoSecrets(error);
  return error as AiAssistError;
}

describe("createAnthropicTextGenerator", () => {
  it("キー・明示のベース URL・authToken: null・120 秒・再試行なし・SDK のログ off でクライアントを作る（L-752）", () => {
    const { createClient } = fakeClient(jest.fn());
    expect(createClient).toHaveBeenCalledWith({
      apiKey: SECRET_KEY,
      authToken: null,
      baseURL: ANTHROPIC_BASE_URL,
      timeout: 120_000,
      maxRetries: 0,
      logLevel: "off",
    });
  });

  it("モデル・上限・システム・ユーザー・スキーマ・effort: low と signal を送り、thinking・temperature は送らない", async () => {
    const create = jest.fn().mockResolvedValue(message({}));
    const { generate } = fakeClient(create);
    const controller = new AbortController();

    await generate(textRequest(controller.signal));

    const expected: AnthropicMessageBody = {
      model: "claude-opus-5-5",
      max_tokens: 4000,
      system: "システム",
      messages: [{ role: "user", content: SECRET_PROMPT }],
      output_config: { format: { type: "json_schema", schema: SCHEMA }, effort: "low" },
    };
    expect(create).toHaveBeenCalledWith(expected, { signal: controller.signal });
    // toHaveBeenCalledWith は等価で比べるので、同じ signal の参照を渡すことを別に固定する
    expect(create.mock.calls[0][1].signal).toBe(controller.signal);
    expect(create.mock.calls[0][0]).not.toHaveProperty("thinking");
    expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("思考のブロックが先にあっても、text のブロックの JSON を解析して返す", async () => {
    const create = jest.fn().mockResolvedValue(message({
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: "{\"summary\":\"要約\"}" }],
    }));
    await expect(fakeClient(create).generate(textRequest())).resolves.toEqual({ summary: "要約" });
  });

  it.each<[string, Record<string, unknown>, AiAssistErrorKind]>([
    ["拒否", { stop_reason: "refusal" }, "refused"],
    ["出力の上限", { stop_reason: "max_tokens" }, "truncated"],
    ["想定外の終わり方", { stop_reason: "pause_turn" }, "upstream-error"],
    ["text のブロックが無い", { content: [{ type: "thinking", thinking: "" }] }, "invalid-output"],
    ["JSON でない", { content: [{ type: "text", text: `{${SECRET_PROMPT}` }] }, "invalid-output"],
  ])("%s → %s（stop_reason → text → JSON の順。L-633）", async (_name, overrides, kind) => {
    const create = jest.fn().mockResolvedValue(message(overrides));
    expect((await failureOf(fakeClient(create).generate(textRequest()))).kind).toBe(kind);
  });

  it.each<[SdkErrorName, AiAssistErrorKind, number | null]>([
    ["abort", "aborted", null],
    ["timeout", "timeout", null],
    ["connection", "upstream-error", null],
    [429, "rate-limited", 429],
    [401, "auth-failed", 401],
    [403, "auth-failed", 403],
    [400, "upstream-error", 400],
    [404, "upstream-error", 404],
    [500, "upstream-error", 500],
    [529, "upstream-error", 529],
  ])("SDK の誤り %s → %s（中断・時間切れを接続エラーより先に見る）", async (name, kind, status) => {
    const create = jest.fn().mockRejectedValue(sdkError(name));
    expect((await failureOf(fakeClient(create).generate(textRequest()))).kind).toBe(kind);
    expect(warn).toHaveBeenCalledWith(`[ai-assist] provider=anthropic kind=${kind} status=${status ?? "-"}`);
  });

  it("SDK 以外の例外は upstream-error", async () => {
    const create = jest.fn().mockRejectedValue(new Error(`${SECRET_KEY} ${SECRET_PROMPT}`));
    expect((await failureOf(fakeClient(create).generate(textRequest()))).kind).toBe("upstream-error");
  });
});
