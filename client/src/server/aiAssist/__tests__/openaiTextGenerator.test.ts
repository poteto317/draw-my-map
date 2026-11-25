/** @jest-environment node */
import OpenAI from "openai";
import {
  OPENAI_BASE_URL,
  createOpenAITextGenerator,
  type OpenAIResponseBody,
} from "@/server/aiAssist/openaiTextGenerator";
import { AiAssistError, type AiAssistErrorKind, type AiTextRequest } from "@/server/aiAssist/aiTextGenerator";

const SECRET_KEY = "sk-openai-test-secret-key";
const SECRET_PROMPT = "利用者の秘密のメモ本文";
const CONFIG = { provider: "openai", apiKey: SECRET_KEY, model: "gpt-5" } as const;
const SCHEMA = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string" } } } as const;

function textRequest(signal = new AbortController().signal): AiTextRequest {
  return { system: "システム", user: SECRET_PROMPT, schemaName: "branch_summary", schema: SCHEMA, maxOutputTokens: 4000, signal };
}

function fakeClient(create: jest.Mock) {
  const createClient = jest.fn(() => ({ responses: { create } }));
  return { createClient, generate: createOpenAITextGenerator(CONFIG, createClient) };
}

function response(overrides: Record<string, unknown>) {
  return {
    status: "completed",
    incomplete_details: null,
    output: [{ type: "message", content: [{ type: "output_text", text: "{\"summary\":\"要約\"}" }] }],
    output_text: "{\"summary\":\"要約\"}",
    ...overrides,
  };
}

type SdkErrorName = "abort" | "timeout" | "connection" | 400 | 401 | 403 | 404 | 429 | 500;

// SDK の誤りを作る。版によってコンストラクタが違えば、この関数の中だけを Task 1 の記録に合わせる
function sdkError(name: SdkErrorName): Error {
  if (name === "abort") return new OpenAI.APIUserAbortError();
  if (name === "timeout") return new OpenAI.APIConnectionTimeoutError();
  if (name === "connection") return new OpenAI.APIConnectionError({ message: `接続失敗 ${SECRET_KEY} ${SECRET_PROMPT}` });
  return OpenAI.APIError.generate(name, { error: { message: `${SECRET_KEY} ${SECRET_PROMPT}` } }, `${SECRET_KEY} ${SECRET_PROMPT}`, new Headers());
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

describe("createOpenAITextGenerator", () => {
  it("キー・organization: null・project: null・明示のベース URL・120 秒・再試行なし・SDK のログ off でクライアントを作る（L-752）", () => {
    const { createClient } = fakeClient(jest.fn());
    expect(createClient).toHaveBeenCalledWith({
      apiKey: SECRET_KEY,
      organization: null,
      project: null,
      baseURL: OPENAI_BASE_URL,
      timeout: 120_000,
      maxRetries: 0,
      logLevel: "off",
    });
  });

  it("Responses API に strict な json_schema・上限・reasoning: low と signal を送り、temperature・stream は送らない", async () => {
    const create = jest.fn().mockResolvedValue(response({}));
    const controller = new AbortController();

    await fakeClient(create).generate(textRequest(controller.signal));

    const expected: OpenAIResponseBody = {
      model: "gpt-5",
      instructions: "システム",
      input: SECRET_PROMPT,
      max_output_tokens: 4000,
      reasoning: { effort: "low" },
      text: { format: { type: "json_schema", name: "branch_summary", schema: SCHEMA, strict: true } },
    };
    expect(create).toHaveBeenCalledWith(expected, { signal: controller.signal });
    // toHaveBeenCalledWith は等価で比べるので、同じ signal の参照を渡すことを別に固定する
    expect(create.mock.calls[0][1].signal).toBe(controller.signal);
    expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
    expect(create.mock.calls[0][0]).not.toHaveProperty("stream");
  });

  it("output_text の JSON を解析して返す。output_text が無ければ出力の output_text の部分をつなぐ", async () => {
    await expect(fakeClient(jest.fn().mockResolvedValue(response({}))).generate(textRequest())).resolves.toEqual({ summary: "要約" });
    const withoutHelper = response({});
    delete (withoutHelper as Record<string, unknown>).output_text;
    await expect(fakeClient(jest.fn().mockResolvedValue(withoutHelper)).generate(textRequest())).resolves.toEqual({ summary: "要約" });
    const split = response({
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: "{\"summary\":" }, { type: "output_text", text: "\"要約\"}" }] },
      ],
    });
    delete (split as Record<string, unknown>).output_text;
    await expect(fakeClient(jest.fn().mockResolvedValue(split)).generate(textRequest())).resolves.toEqual({ summary: "要約" });
  });

  it.each<[string, Record<string, unknown>, AiAssistErrorKind]>([
    ["出力の上限で途中", { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }, "truncated"],
    ["内容のフィルター", { status: "incomplete", incomplete_details: { reason: "content_filter" } }, "refused"],
    ["その他の途中", { status: "incomplete", incomplete_details: { reason: "other" } }, "upstream-error"],
    ["途中で理由なし", { status: "incomplete", incomplete_details: null }, "upstream-error"],
    ["失敗の状態", { status: "failed" }, "upstream-error"],
    ["状態なし", { status: undefined }, "upstream-error"],
    ["拒否の出力", { output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }], output_text: "" }, "refused"],
    ["出力が空", { output: [], output_text: "" }, "invalid-output"],
    ["JSON でない", { output_text: `{${SECRET_PROMPT}` }, "invalid-output"],
  ])("%s → %s（status → 拒否 → 本文 → JSON の順。L-633）", async (_name, overrides, kind) => {
    const create = jest.fn().mockResolvedValue(response(overrides));
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
  ])("SDK の誤り %s → %s（中断・時間切れを接続エラーより先に見る）", async (name, kind, status) => {
    const create = jest.fn().mockRejectedValue(sdkError(name));
    expect((await failureOf(fakeClient(create).generate(textRequest()))).kind).toBe(kind);
    expect(warn).toHaveBeenCalledWith(`[ai-assist] provider=openai kind=${kind} status=${status ?? "-"}`);
  });

  it("SDK 以外の例外は upstream-error", async () => {
    const create = jest.fn().mockRejectedValue(new Error(`${SECRET_KEY} ${SECRET_PROMPT}`));
    expect((await failureOf(fakeClient(create).generate(textRequest()))).kind).toBe("upstream-error");
  });
});
