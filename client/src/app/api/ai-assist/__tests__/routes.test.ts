/** @jest-environment node */
import { POST as postBranchSummary } from "@/app/api/ai-assist/branch-summary/route";
import { POST as postImportance } from "@/app/api/ai-assist/importance/route";
import { GET as getStatus } from "@/app/api/ai-assist/status/route";

const mockAnthropicCreate = jest.fn();
const mockOpenAICreate = jest.fn();
jest.mock("@/server/aiAssist/anthropicTextGenerator", () => ({
  createAnthropicTextGenerator: (config: unknown) => mockAnthropicCreate(config),
}));
jest.mock("@/server/aiAssist/openaiTextGenerator", () => ({
  createOpenAITextGenerator: (config: unknown) => mockOpenAICreate(config),
}));

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AI_ASSIST_PROVIDER", "AI_ASSIST_ANTHROPIC_MODEL", "AI_ASSIST_OPENAI_MODEL", "AI_ASSIST_ALLOWED_HOSTS"];
const original = { ...process.env };
const branch = {
  rootId: 1,
  nodes: [
    { id: 1, parentId: null, label: "根", importance: "high" },
    { id: 2, parentId: 1, label: "子", importance: "low" },
  ],
};

function post(path: string, body: unknown, host = "localhost"): Request {
  return new Request(`http://${host}/api/ai-assist/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", host },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  mockAnthropicCreate.mockReset();
  mockOpenAICreate.mockReset();
});

afterEach(() => {
  process.env = { ...original };
});

describe("/api/ai-assist/*", () => {
  it("環境変数が無ければ status は available: false、2 つの POST は 503", async () => {
    expect(await getStatus(new Request("http://localhost/api/ai-assist/status", { headers: { host: "localhost" } })).json()).toEqual({ available: false });
    expect((await postBranchSummary(post("branch-summary", { branch }))).status).toBe(503);
    expect((await postImportance(post("importance", { branch, targetIds: [2] }))).status).toBe(503);
  });

  it("ANTHROPIC_API_KEY があれば Claude のアダプタへ配線する", async () => {
    process.env.ANTHROPIC_API_KEY = "a-key";
    mockAnthropicCreate.mockReturnValue(jest.fn().mockResolvedValue({ summary: "要約" }));

    const response = await postBranchSummary(post("branch-summary", { branch }));

    expect(await response.json()).toEqual({ summary: "要約" });
    expect(mockAnthropicCreate).toHaveBeenCalledWith({ provider: "anthropic", apiKey: "a-key", model: "claude-opus-5-5" });
    expect(mockOpenAICreate).not.toHaveBeenCalled();
  });

  it("AI_ASSIST_PROVIDER=openai なら OpenAI のアダプタへ配線する", async () => {
    process.env.AI_ASSIST_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "o-key";
    mockOpenAICreate.mockReturnValue(jest.fn().mockResolvedValue({ suggestions: [{ id: 2, importance: "high", reason: "主要" }] }));

    const response = await postImportance(post("importance", { branch, targetIds: [2] }));

    expect(await response.json()).toEqual({ suggestions: [{ id: 2, importance: "high", reason: "主要" }] });
    expect(mockOpenAICreate).toHaveBeenCalledWith({ provider: "openai", apiKey: "o-key", model: "gpt-5" });
    expect(mockAnthropicCreate).not.toHaveBeenCalled();
  });

  it("Host の許可リストは process.env の AI_ASSIST_ALLOWED_HOSTS から読む", async () => {
    process.env.ANTHROPIC_API_KEY = "a-key";
    mockAnthropicCreate.mockReturnValue(jest.fn().mockResolvedValue({ summary: "要約" }));
    const statusOf = (host: string) => getStatus(new Request(`http://${host}/api/ai-assist/status`, { headers: { host } })).status;

    expect(statusOf("192.168.1.10:3000")).toBe(403);
    expect((await postBranchSummary(post("branch-summary", { branch }, "192.168.1.10:3000"))).status).toBe(403);
    process.env.AI_ASSIST_ALLOWED_HOSTS = "192.168.1.10";
    expect(statusOf("192.168.1.10:3000")).toBe(200);
    expect((await postBranchSummary(post("branch-summary", { branch }, "192.168.1.10:3000"))).status).toBe(200);
  });
});
