/** @jest-environment node */
import {
  AiAssistRequestError,
  describeAiAssistError,
  fetchAiAssistStatus,
  requestBranchSummary,
  requestImportanceSuggestions,
  type AiAssistClientErrorKind,
} from "@/services/aiAssist/aiAssistClient";
import type { AiBranchInput } from "@/domain/aiAssist/aiBranchInput";

const branch: AiBranchInput = {
  rootId: 1,
  nodes: [
    { id: 1, parentId: null, label: "根", importance: "high" },
    { id: 2, parentId: 1, label: "子", importance: "low" },
  ],
};

function reply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function options(fetchImpl: jest.Mock, signal = new AbortController().signal) {
  return { signal, fetchImpl: fetchImpl as unknown as typeof fetch };
}

async function kindOf(promise: Promise<unknown>): Promise<AiAssistClientErrorKind> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(AiAssistRequestError);
  return (error as AiAssistRequestError).kind;
}

// 中断されるまで応答しない fetch
function hangingFetch(): jest.Mock {
  return jest.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
}

describe("fetchAiAssistStatus", () => {
  it("GET で状態を読み、形を確かめて返す", async () => {
    const status = { available: true, provider: "openai", providerLabel: "OpenAI（GPT API）", model: "gpt-5" };
    const fetchImpl = jest.fn().mockResolvedValue(reply(status));

    await expect(fetchAiAssistStatus(options(fetchImpl))).resolves.toEqual(status);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/ai-assist/status");
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
  });

  it("available: false はそのまま返す", async () => {
    await expect(fetchAiAssistStatus(options(jest.fn().mockResolvedValue(reply({ available: false })))))
      .resolves.toEqual({ available: false });
  });

  it.each<[string, Response, AiAssistClientErrorKind]>([
    ["403 forbidden（許可していないホストで開いた）は forbidden", reply({ error: "forbidden" }, 403), "forbidden"],
    ["本文の無い 403 も状態コードから forbidden", new Response("", { status: 403 }), "forbidden"],
    ["読めない本文の 500 は upstream-error", new Response("<html>", { status: 500 }), "upstream-error"],
    ["200 で形が不正は upstream-error", reply({ available: true, provider: "gemini", providerLabel: "x", model: "y" }), "upstream-error"],
  ])("%s", async (_name, response, kind) => {
    expect(await kindOf(fetchAiAssistStatus(options(jest.fn().mockResolvedValue(response))))).toBe(kind);
  });

  it("forbidden の文言は、ホスト名の許可（AI_ASSIST_ALLOWED_HOSTS）と手順書を案内する", () => {
    const message = describeAiAssistError("forbidden");
    expect(message).toContain("AI_ASSIST_ALLOWED_HOSTS");
    expect(message).toContain("localhost");
    expect(message).toContain("docs/setup/ai-assist-setup.md");
  });

  it("通信の失敗は network", async () => {
    expect(await kindOf(fetchAiAssistStatus(options(jest.fn().mockRejectedValue(new TypeError("fail"))))))
      .toBe("network");
  });
});

describe("requestBranchSummary", () => {
  it("枝を JSON で POST し、応答を検証し直した要約を返す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ summary: " 要約 " }));

    await expect(requestBranchSummary(branch, options(fetchImpl))).resolves.toBe("要約");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/ai-assist/branch-summary");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ branch });
  });

  it("呼び出し元の中断を fetch へ伝え、AbortError をそのまま投げる", async () => {
    const fetchImpl = hangingFetch();
    const controller = new AbortController();
    const promise = requestBranchSummary(branch, options(fetchImpl, controller.signal));
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("呼び出し前に中断済みの signal なら AbortError で、fetch に渡した signal も中断済み", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ summary: "要約" }));
    const controller = new AbortController();
    controller.abort();

    await expect(requestBranchSummary(branch, options(fetchImpl, controller.signal))).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it.each<[string, Response, AiAssistClientErrorKind]>([
    ["JSON でない 502（HTML）", new Response("<html>bad gateway</html>", { status: 502 }), "upstream-error"],
    ["空の本文の 200", new Response("", { status: 200 }), "invalid-output"],
  ])("%s → %s", async (_name, response, kind) => {
    expect(await kindOf(requestBranchSummary(branch, options(jest.fn().mockResolvedValue(response))))).toBe(kind);
  });

  it.each<[number, unknown, AiAssistClientErrorKind]>([
    [503, { error: "not-configured" }, "not-configured"],
    [502, { error: "auth-failed" }, "auth-failed"],
    [429, { error: "rate-limited" }, "rate-limited"],
    [504, { error: "timeout" }, "timeout"],
    [422, { error: "refused" }, "refused"],
    [502, { error: "invalid-output" }, "invalid-output"],
    [403, { error: "forbidden" }, "forbidden"],
    [413, { error: "too-large" }, "too-large"],
    [400, { error: "invalid-request" }, "invalid-request"],
    [502, { error: "upstream-error" }, "upstream-error"],
    [503, null, "not-configured"],
    [429, null, "rate-limited"],
    [500, { error: "unknown-code" }, "upstream-error"],
  ])("%i %j → %s（code を優先し、無ければステータスで決める）", async (status, body, kind) => {
    expect(await kindOf(requestBranchSummary(branch, options(jest.fn().mockResolvedValue(reply(body, status))))))
      .toBe(kind);
  });

  it("200 でも要約が検証に通らなければ invalid-output", async () => {
    expect(await kindOf(requestBranchSummary(branch, options(jest.fn().mockResolvedValue(reply({ summary: "" }))))))
      .toBe("invalid-output");
  });

  describe("150 秒の打ち切り", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("応答が無ければ timeout", async () => {
      const promise = kindOf(requestBranchSummary(branch, options(hangingFetch())));
      await jest.advanceTimersByTimeAsync(150_000);
      expect(await promise).toBe("timeout");
    });

    it("成功した後はタイマーを残さず、呼び出し元を中断しても fetch に渡した signal は中断されない", async () => {
      const fetchImpl = jest.fn().mockResolvedValue(reply({ summary: "要約" }));
      const controller = new AbortController();

      await expect(requestBranchSummary(branch, options(fetchImpl, controller.signal))).resolves.toBe("要約");
      expect(jest.getTimerCount()).toBe(0);
      controller.abort();
      expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false);
    });

    it("本文の読み込みも打ち切りで守る（L-054）", async () => {
      const fetchImpl = jest.fn((_url: string, init: RequestInit) => Promise.resolve({
        ok: true,
        status: 200,
        text: () => new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
      }));
      const promise = kindOf(requestBranchSummary(branch, options(fetchImpl)));
      await jest.advanceTimersByTimeAsync(150_000);
      expect(await promise).toBe("timeout");
    });
  });
});

describe("requestImportanceSuggestions", () => {
  it("targetIds を添えて POST し、targetIds で検証し直す", async () => {
    const suggestions = [{ id: 2, importance: "high", reason: "主要" }];
    const fetchImpl = jest.fn().mockResolvedValue(reply({ suggestions }));

    await expect(requestImportanceSuggestions(branch, [2], options(fetchImpl))).resolves.toEqual(suggestions);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/ai-assist/importance");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ branch, targetIds: [2] });
  });

  it("対象外の ID を含む応答は invalid-output", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(reply({ suggestions: [{ id: 1, importance: "high", reason: "" }] }));
    expect(await kindOf(requestImportanceSuggestions(branch, [2], options(fetchImpl)))).toBe("invalid-output");
  });
});

describe("describeAiAssistError", () => {
  it("原因が複数ある 429 を断定しない（L-245）", () => {
    expect(describeAiAssistError("rate-limited")).toBe(
      "AI の利用上限に達しました（短時間の送りすぎか、契約の上限の可能性があります）。時間をおいて再度お試しください。",
    );
  });

  it("設定の手順の場所を示す", () => {
    expect(describeAiAssistError("not-configured")).toContain("docs/setup/ai-assist-setup.md");
  });
});
