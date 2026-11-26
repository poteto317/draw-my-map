import type { LearnCrossFeatureGuardInput, LearnCrossFeatureLocks } from "@/domain/map/mapLearnEditorAvailability";
import { resolveLearnCrossFeatureLocks } from "@/domain/map/mapLearnEditorAvailability";
import {
  isPresentationStartBlockedByVoice,
  isVoiceStructureEditBlocked,
} from "@/domain/map/mapVoiceGuards";

export type MapEditorCrossFeatureGuardInput = LearnCrossFeatureGuardInput & {
  readonly voiceListening: boolean;
};

export type MapEditorCrossFeatureLocks = LearnCrossFeatureLocks & {
  readonly presentationStartBlockedByVoice: boolean;
};

/** 学習・プレゼン・音声の排他を MapEditor 配線の1箇所にまとめる */
export function resolveMapEditorCrossFeatureLocks(
  input: MapEditorCrossFeatureGuardInput,
): MapEditorCrossFeatureLocks {
  const learn = resolveLearnCrossFeatureLocks(input);
  const voiceStructureEditBlocked = isVoiceStructureEditBlocked(input.voiceListening);
  const presentationStartBlockedByVoice = isPresentationStartBlockedByVoice(input.voiceListening);
  return {
    structureEditBlocked: learn.structureEditBlocked || voiceStructureEditBlocked,
    layoutEditBlocked: learn.layoutEditBlocked || voiceStructureEditBlocked,
    attributeEditBlocked: learn.attributeEditBlocked || voiceStructureEditBlocked,
    presentationStartBlockedByLearn: learn.presentationStartBlockedByLearn,
    presentationStartBlockedByVoice,
    aiAssistBlockedByLearn: learn.aiAssistBlockedByLearn,
    documentMutationBlocked: learn.documentMutationBlocked,
  };
}