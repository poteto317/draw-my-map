import type { DocumentEditGuardInput } from "@/domain/map/mapDocumentEditGuards";
import {
  isAiAssistBlockedByLearn,
  isLearnDocumentMutationBlocked,
  isLearnStructureEditBlocked,
  isPresentationStartBlockedByLearn,
  type LearnSessionGuardInput,
} from "@/domain/map/mapLearnGuards";

export type LearnCrossFeatureGuardInput = LearnSessionGuardInput & DocumentEditGuardInput;

export type LearnCrossFeatureLocks = {
  structureEditBlocked: boolean;
  layoutEditBlocked: boolean;
  attributeEditBlocked: boolean;
  presentationStartBlockedByLearn: boolean;
  aiAssistBlockedByLearn: boolean;
  documentMutationBlocked: boolean;
};

/** 学習モードと他機能（レイアウト編集・プレゼン・AI 等）の排他を1箇所から返す */
export function resolveLearnCrossFeatureLocks(
  input: LearnCrossFeatureGuardInput,
): LearnCrossFeatureLocks {
  const structureEditBlocked = isLearnStructureEditBlocked(input.learningActive);
  return {
    structureEditBlocked,
    layoutEditBlocked: structureEditBlocked || input.playingPresentation,
    attributeEditBlocked: structureEditBlocked || input.playingPresentation,
    presentationStartBlockedByLearn: isPresentationStartBlockedByLearn(input.learningActive),
    aiAssistBlockedByLearn: isAiAssistBlockedByLearn(input.learningActive),
    documentMutationBlocked: isLearnDocumentMutationBlocked(input),
  };
}