/** @jest-environment node */
import { aiAssistErrorKindFromStatus } from "@/server/aiAssist/aiTextGenerator";

describe("aiAssistErrorKindFromStatus", () => {
  it("429 は rate-limited", () => {
    expect(aiAssistErrorKindFromStatus(429)).toBe("rate-limited");
  });

  it("401・403 は auth-failed", () => {
    expect(aiAssistErrorKindFromStatus(401)).toBe("auth-failed");
    expect(aiAssistErrorKindFromStatus(403)).toBe("auth-failed");
  });

  it("それ以外のステータスとステータスの無い誤りは upstream-error", () => {
    for (const status of [400, 404, 500, 529, null]) {
      expect(aiAssistErrorKindFromStatus(status)).toBe("upstream-error");
    }
  });
});
