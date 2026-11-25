/** @jest-environment node */
import { POST as postBranchSummary } from "@/app/api/ai-assist/branch-summary/route";
import { POST as postChildCandidates } from "@/app/api/ai-assist/child-candidates/route";
import { POST as postClassifyReorder } from "@/app/api/ai-assist/classify-reorder/route";
import { POST as postDuplicates } from "@/app/api/ai-assist/duplicates/route";
import { POST as postImportance } from "@/app/api/ai-assist/importance/route";
import { POST as postMissingPerspectives } from "@/app/api/ai-assist/missing-perspectives/route";
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
  it("環境変数が無ければ status は available: false、POST は 503", async () => {
    expect(await getStatus(new Request("http://localhost/api/ai-assist/status", { headers: { host: "localhost" } })).json()).toEqual({ available: false });
    expect((await postBranchSummary(post("branch-summary", { branch }))).status).toBe(503);
    expect((await postImportance(post("importance", { branch, targetIds: [2] }))).status).toBe(503);
    expect((await postChildCandidates(post("child-candidates", { branch }))).status).toBe(503);
    expect((await postClassifyReorder(post("classify-reorder", { branch }))).status).toBe(503);
    expect((await postDuplicates(post("duplicates", { branch, mapId: "map-a", visibleNodeIds: [1, 2] }))).status).toBe(503);
    expect((await postMissingPerspectives(post("missing-perspectives", { branch }))).status).toBe(503);
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

  it("Phase 33 の 4 ルートはフェイク generator で応答する", async () => {
    process.env.ANTHROPIC_API_KEY = "a-key";
    mockAnthropicCreate.mockReturnValue(jest.fn()
      .mockResolvedValueOnce({ candidates: [{ label: "案" }] })
      .mockResolvedValueOnce({ moves: [{ type: "reorder", parentId: 1, childIds: [2] }] })
      .mockResolvedValueOnce({ pairs: [{ primaryId: 2, secondaryId: 3, reason: "似" }] })
      .mockResolvedValueOnce({ items: [{ label: "不足", placement: "child" }] }));

    expect(await (await postChildCandidates(post("child-candidates", { branch }))).json()).toEqual({ candidates: [{ label: "案" }] });
    expect(await (await postClassifyReorder(post("classify-reorder", { branch }))).json()).toEqual({ moves: [{ type: "reorder", parentId: 1, childIds: [2] }] });
    const trio = {
      ...branch,
      nodes: [...branch.nodes, { id: 3, parentId: 1, label: "子2", importance: "medium" }],
    };
    expect(await (await postDuplicates(post("duplicates", { branch: trio, mapId: "map-a", visibleNodeIds: [1, 2, 3] }))).json()).toEqual({ pairs: [{ primaryId: 2, secondaryId: 3, reason: "似" }] });
    expect(await (await postMissingPerspectives(post("missing-perspectives", { branch }))).json()).toEqual({ items: [{ label: "不足", placement: "child" }] });
  });

  it("Phase 33 の 4 ルートは不正な body で 400", async () => {
    process.env.ANTHROPIC_API_KEY = "a-key";
    expect((await postChildCandidates(post("child-candidates", { notBranch: true }))).status).toBe(400);
    expect((await postClassifyReorder(post("classify-reorder", { branch: "x" }))).status).toBe(400);
    expect((await postDuplicates(post("duplicates", { branch }))).status).toBe(400);
    expect((await postMissingPerspectives(post("missing-perspectives", {}))).status).toBe(400);
  });

  it("Phase 33 の 4 ルートは出力検証に失敗すると 502", async () => {
    process.env.ANTHROPIC_API_KEY = "a-key";
    const invalid = jest.fn()
      .mockResolvedValueOnce({ candidates: [] })
      .mockResolvedValueOnce({ moves: [] })
      .mockResolvedValueOnce({ pairs: [] })
      .mockResolvedValueOnce({ items: [] });
    mockAnthropicCreate.mockReturnValue(invalid);
    const trio = {
      ...branch,
      nodes: [...branch.nodes, { id: 3, parentId: 1, label: "子2", importance: "medium" }],
    };
    expect((await postChildCandidates(post("child-candidates", { branch }))).status).toBe(502);
    expect((await postClassifyReorder(post("classify-reorder", { branch }))).status).toBe(502);
    expect((await postDuplicates(post("duplicates", { branch: trio, mapId: "map-a", visibleNodeIds: [1, 2, 3] }))).status).toBe(502);
    expect((await postMissingPerspectives(post("missing-perspectives", { branch }))).status).toBe(502);
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
