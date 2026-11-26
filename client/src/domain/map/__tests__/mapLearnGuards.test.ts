import {
  MAP_LEARN_MESSAGES,
  learnGenerateMutationOutcomeMessage,
  learnMutationPlacementFailedMessage,
  learnRevealBlockedMessage,
  learnRevealMutationOutcomeMessage,
  learnResetBlockedMessage,
  learnResetMutationOutcomeMessage,
  learnStartBlockedMessage,
  resolveLearnRevealBlocked,
  resolveLearnGenerateBlocked,
  resolveLearnResetBlocked,
  resolveLearnStartBlocked,
} from "@/domain/map/mapLearnGuards";

const guards = {
  learningActive: false,
  playingPresentation: false,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
  selectedNodeIds: [] as readonly number[],
};

describe("mapLearnGuards", () => {
  it("プレゼン中は学習開始を拒否", () => {
    expect(resolveLearnStartBlocked({ ...guards, playingPresentation: true })).toBe("presentation");
    expect(learnStartBlockedMessage("presentation")).toBe(MAP_LEARN_MESSAGES.presentation);
  });

  it("学習中のみ開示可", () => {
    expect(resolveLearnRevealBlocked(
      { ...guards, learningActive: false, selectedNodeIds: [1] },
      1,
      new Set(),
    )).toBe("not-learning");
    expect(resolveLearnRevealBlocked(
      { ...guards, learningActive: true, selectedNodeIds: [1, 2] },
      1,
      new Set(),
    )).toBe("multi-selection");
    expect(learnRevealBlockedMessage("multi-selection")).toBe(MAP_LEARN_MESSAGES.selectOne);
  });

  it("保護中はカード生成不可", () => {
    expect(resolveLearnGenerateBlocked({
      ...guards,
      learningActive: true,
      isProtectedMode: true,
    })).toBe("protected");
  });

  it("保護中はリセット不可", () => {
    expect(resolveLearnResetBlocked({
      ...guards,
      learningActive: true,
      isProtectedMode: true,
    })).toBe("protected");
    expect(learnResetBlockedMessage("protected")).toBe(MAP_LEARN_MESSAGES.protected);
  });

  it("永続化失敗は種別ごとに文言を返す", () => {
    expect(learnMutationPlacementFailedMessage("reveal")).toBe(MAP_LEARN_MESSAGES.revealPlacementFailed);
    expect(learnRevealMutationOutcomeMessage("placement-failed")).toBe(MAP_LEARN_MESSAGES.revealPlacementFailed);
    expect(learnResetMutationOutcomeMessage("placement-failed")).toBe(MAP_LEARN_MESSAGES.resetPlacementFailed);
    expect(learnGenerateMutationOutcomeMessage("placement-failed")).toBe(MAP_LEARN_MESSAGES.generatePlacementFailed);
  });

  it("node-missing は開示ブロック文言へ直結する", () => {
    expect(learnRevealMutationOutcomeMessage("node-missing")).toBe(MAP_LEARN_MESSAGES.selectOne);
  });
});