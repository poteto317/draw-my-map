import {
  ILLUSTRATION_LABEL_MAX_LENGTH,
  buildIllustrationPrompt,
  needsTranslation,
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

describe("needsTranslation", () => {
  it("ASCII の印字可能文字だけなら翻訳不要", () => {
    expect(needsTranslation("Budget plan 2026")).toBe(false);
    expect(needsTranslation("  idea  ")).toBe(false);
  });

  it("日本語を含めば翻訳が必要（混在も含む）", () => {
    expect(needsTranslation("予算")).toBe(true);
    expect(needsTranslation("Q3 目標")).toBe(true);
  });

  it("空・空白だけは翻訳不要", () => {
    expect(needsTranslation("")).toBe(false);
    expect(needsTranslation("   ")).toBe(false);
  });
});

describe("buildIllustrationPrompt", () => {
  it("英語の概念を、決まったテンプレートに埋め込む", () => {
    expect(buildIllustrationPrompt("The budget")).toBe(
      "A simple, clear flat-design illustration of an object or scene that symbolizes the concept: The budget. One large centered subject that fills most of the frame, plain white background, no text, no letters.",
    );
  });

  it("概念の前後の空白を除く", () => {
    expect(buildIllustrationPrompt("  idea ")).toContain("concept: idea.");
  });

  it("長すぎる概念は500文字に切り詰め、APIの上限（2048文字）に収める", () => {
    const prompt = buildIllustrationPrompt("a".repeat(5000));

    expect(prompt.length).toBeLessThanOrEqual(2048);
    expect(prompt).toContain("a".repeat(500));
    expect(prompt).not.toContain("a".repeat(501));
  });
});
