import {
  ILLUSTRATION_LABEL_MAX_LENGTH,
  buildIllustrationPrompt,
  validateIllustrationLabel,
} from "@/domain/illustration/illustrationPrompt";

describe("validateIllustrationLabel", () => {
  it("前後の空白を除いたラベルを返す", () => {
    expect(validateIllustrationLabel("  企画の背景  ")).toEqual({ ok: true, label: "企画の背景" });
  });

  it("空文字と空白だけのラベルは empty", () => {
    expect(validateIllustrationLabel("")).toEqual({ ok: false, reason: "empty" });
    expect(validateIllustrationLabel("   \n ")).toEqual({ ok: false, reason: "empty" });
  });

  it("上限ちょうどの長さは受け付ける", () => {
    const label = "あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH);
    expect(validateIllustrationLabel(label)).toEqual({ ok: true, label });
  });

  it("上限を超える長さは too-long", () => {
    const label = "あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH + 1);
    expect(validateIllustrationLabel(label)).toEqual({ ok: false, reason: "too-long" });
  });

  it("空白を除いた後の長さで上限を判定する", () => {
    const label = ` ${"あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH)} `;
    expect(validateIllustrationLabel(label)).toMatchObject({ ok: true });
  });
});

describe("buildIllustrationPrompt", () => {
  it("ラベルを含み、文字を描かない指示を含む英語のプロンプトを返す", () => {
    const prompt = buildIllustrationPrompt("企画の背景");

    expect(prompt).toContain("企画の背景");
    expect(prompt).toContain("no text");
    expect(prompt).toContain("white background");
  });

  it("上限の長さのラベルでも、APIの上限（2048文字）に収まる", () => {
    const prompt = buildIllustrationPrompt("あ".repeat(ILLUSTRATION_LABEL_MAX_LENGTH));

    expect(prompt.length).toBeLessThanOrEqual(2048);
  });
});
