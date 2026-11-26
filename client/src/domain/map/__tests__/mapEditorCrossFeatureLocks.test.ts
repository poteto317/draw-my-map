import { resolveMapEditorCrossFeatureLocks } from "@/domain/map/mapEditorCrossFeatureLocks";

const base = {
  learningActive: false,
  playingPresentation: false,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
  voiceListening: false,
} as const;

describe("resolveMapEditorCrossFeatureLocks", () => {
  it("音声聞き取り中は構造・レイアウト・属性編集を止める", () => {
    const locks = resolveMapEditorCrossFeatureLocks({ ...base, voiceListening: true });
    expect(locks.structureEditBlocked).toBe(true);
    expect(locks.layoutEditBlocked).toBe(true);
    expect(locks.attributeEditBlocked).toBe(true);
    expect(locks.presentationStartBlockedByVoice).toBe(true);
  });

  it("学習中のロックと音声ロックを合成する", () => {
    const locks = resolveMapEditorCrossFeatureLocks({ ...base, learningActive: true, voiceListening: false });
    expect(locks.structureEditBlocked).toBe(true);
    expect(locks.presentationStartBlockedByLearn).toBe(true);
    expect(locks.presentationStartBlockedByVoice).toBe(false);
  });
});