import { normalizeVoiceTranscript } from "@/domain/voice/normalizeVoiceTranscript";

describe("normalizeVoiceTranscript", () => {
  it("前後空白と制御文字を除去する", () => {
    expect(normalizeVoiceTranscript("  あいう\u0001  ")).toBe("あいう");
  });

  it("空は null", () => {
    expect(normalizeVoiceTranscript("   ")).toBeNull();
  });
});