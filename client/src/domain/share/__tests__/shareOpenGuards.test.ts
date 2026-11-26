import {
  resolveShareOpenBlocked,
  shareOpenBlockedMessage,
} from "@/domain/share/shareOpenGuards";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

const base = {
  hasMapConflict: false,
  isMapExternallyDeleted: false,
  learningActive: false,
  playingPresentation: false,
} as const;

describe("resolveShareOpenBlocked", () => {
  it("平常時は null", () => {
    expect(resolveShareOpenBlocked(base)).toBeNull();
  });

  it("競合と外部削除は conflict（同じ文言）", () => {
    expect(resolveShareOpenBlocked({ ...base, hasMapConflict: true })).toBe("conflict");
    expect(resolveShareOpenBlocked({ ...base, isMapExternallyDeleted: true })).toBe("conflict");
    expect(shareOpenBlockedMessage("conflict")).toBe(SHARE_MESSAGES.conflictBlocked);
  });

  it("学習・プレゼンを優先順位どおり塞ぐ", () => {
    expect(resolveShareOpenBlocked({ ...base, learningActive: true })).toBe("learning");
    expect(resolveShareOpenBlocked({ ...base, playingPresentation: true })).toBe("presentation");
    expect(shareOpenBlockedMessage("learning")).toBe(SHARE_MESSAGES.learnBlocked);
    expect(shareOpenBlockedMessage("presentation")).toBe(SHARE_MESSAGES.presentationBlocked);
  });

  it("競合が学習より優先", () => {
    expect(resolveShareOpenBlocked({
      ...base,
      hasMapConflict: true,
      learningActive: true,
      playingPresentation: true,
    })).toBe("conflict");
  });
});
