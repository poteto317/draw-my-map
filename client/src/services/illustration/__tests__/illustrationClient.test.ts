/** @jest-environment node */

import {
  IllustrationRequestError,
  describeIllustrationError,
  requestIllustration,
} from "@/services/illustration/illustrationClient";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("requestIllustration", () => {
  it("ラベルをPOSTし、画像のdata URLを返す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: "ABC", mimeType: "image/jpeg" }));

    const image = await requestIllustration("目標", { fetchImpl });

    expect(image).toEqual({ dataUrl: "data:image/jpeg;base64,ABC" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/illustrations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ label: "目標" });
  });

  it("signalをfetchへ渡す", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: "A", mimeType: "image/jpeg" }));
    const controller = new AbortController();

    await requestIllustration("目標", { fetchImpl, signal: controller.signal });

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it.each([
    [400, "invalid-label"],
    [503, "not-configured"],
    [429, "quota-exceeded"],
    [422, "content-rejected"],
    [502, "upstream-error"],
    [500, "upstream-error"],
  ])("HTTP %i は %s として投げる", async (status, kind) => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ error: "x" }, status));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({
      name: "IllustrationRequestError",
      kind,
    });
  });

  it("成功応答でも、画像が文字列でなければ upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: 1, mimeType: "image/jpeg" }));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it.each(["image/png", "image/webp"])("mimeType %s は受け入れる", async (mimeType) => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: "A", mimeType }));

    await expect(requestIllustration("x", { fetchImpl })).resolves.toEqual({
      dataUrl: `data:${mimeType};base64,A`,
    });
  });

  it.each(["text/html", "image/svg+xml", ""])("許可されないmimeType（%j）は upstream-error", async (mimeType) => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ image: "A", mimeType }));

    await expect(requestIllustration("x", { fetchImpl })).rejects.toMatchObject({ kind: "upstream-error" });
  });

  it("JSONでない成功応答は upstream-error", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(new Response("oops", { status: 200 }));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({
      kind: "upstream-error",
    });
  });

  it("fetchの例外は network", async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(requestIllustration("目標", { fetchImpl })).rejects.toMatchObject({ kind: "network" });
  });

  it("中断（AbortError）は変換せず、そのまま投げる", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchImpl = jest.fn().mockRejectedValue(abortError);

    const error = await requestIllustration("目標", { fetchImpl }).catch((e) => e);

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(IllustrationRequestError);
  });
});

describe("describeIllustrationError", () => {
  it.each([
    ["invalid-label", "ノードのテキストが空、または長すぎるため、イラストを生成できません。"],
    ["not-configured", "イラスト生成の設定（Cloudflareの認証情報）が見つかりません。README の手順で設定してください。"],
    ["quota-exceeded", "無料の利用上限に達しました（1日の無料枠を使い切ったか、一時的な制限です）。時間をおいて（無料枠は毎日 0:00 UTC にリセット）、再度お試しください。"],
    ["upstream-error", "イラストの生成に失敗しました。時間をおいて、再度お試しください。"],
    ["content-rejected", "画像生成AIが、内容を不適切と判定しました（誤判定のことがあります）。もう一度お試しください。ノードのテキストを少し変えると、通ることもあります。"],
    ["network", "通信に失敗しました。接続を確認して、再度お試しください。"],
    ["image-processing", "生成した画像を処理できませんでした。もう一度お試しください。"],
  ] as const)("%s のメッセージ", (kind, message) => {
    expect(describeIllustrationError(kind)).toBe(message);
  });
});
