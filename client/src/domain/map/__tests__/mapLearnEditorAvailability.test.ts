import {
  resolveLearnCrossFeatureLocks,
  type LearnCrossFeatureGuardInput,
} from "@/domain/map/mapLearnEditorAvailability";

const clear: LearnCrossFeatureGuardInput = {
  learningActive: false,
  playingPresentation: false,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
};

describe("resolveLearnCrossFeatureLocks", () => {
  it("通常時は学習由来の排他なし", () => {
    expect(resolveLearnCrossFeatureLocks(clear)).toEqual({
      structureEditBlocked: false,
      layoutEditBlocked: false,
      attributeEditBlocked: false,
      presentationStartBlockedByLearn: false,
      aiAssistBlockedByLearn: false,
      documentMutationBlocked: false,
    });
  });

  it("学習中はレイアウト・属性・プレゼン開始・AI を止める", () => {
    expect(resolveLearnCrossFeatureLocks({ ...clear, learningActive: true })).toEqual({
      structureEditBlocked: true,
      layoutEditBlocked: true,
      attributeEditBlocked: true,
      presentationStartBlockedByLearn: true,
      aiAssistBlockedByLearn: true,
      documentMutationBlocked: false,
    });
  });

  it("プレゼン再生中はレイアウト・属性のみ（学習と独立）", () => {
    expect(resolveLearnCrossFeatureLocks({ ...clear, playingPresentation: true })).toEqual({
      structureEditBlocked: false,
      layoutEditBlocked: true,
      attributeEditBlocked: true,
      presentationStartBlockedByLearn: false,
      aiAssistBlockedByLearn: false,
      documentMutationBlocked: false,
    });
  });

  it("保護モードはドキュメント変更を止める", () => {
    expect(resolveLearnCrossFeatureLocks({ ...clear, isProtectedMode: true })).toEqual({
      structureEditBlocked: false,
      layoutEditBlocked: false,
      attributeEditBlocked: false,
      presentationStartBlockedByLearn: false,
      aiAssistBlockedByLearn: false,
      documentMutationBlocked: true,
    });
  });
});