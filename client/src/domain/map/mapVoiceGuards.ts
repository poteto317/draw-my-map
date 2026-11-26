import type { DocumentEditGuardInput } from "@/domain/map/mapDocumentEditGuards";
import { MAP_LEARN_MESSAGES } from "@/domain/map/mapLearnGuards";
import { isNodeTargetOperationBlocked } from "@/domain/map/mapCanvasSelectionGuards";
import type { MapCanvasSelection } from "@/types/mapCanvasSelection";

export const MAP_VOICE_MESSAGES = {
  unsupported: "このブラウザでは音声入力を利用できません",
  protected: MAP_LEARN_MESSAGES.protected,
  conflict: MAP_LEARN_MESSAGES.conflict,
  externallyDeleted: MAP_LEARN_MESSAGES.externallyDeleted,
  presentation: MAP_LEARN_MESSAGES.playingPresentationBlock,
  learning: MAP_LEARN_MESSAGES.learningBlock,
  dialogOpen: "ダイアログ表示中は音声入力を開始できません",
  canvasSelection: "関連線またはグループの選択中は音声入力を開始できません",
  relationPartner: "関連線の作成中は音声入力を開始できません",
  stoppedExclusive: "他の操作のため音声入力を停止しました",
  listeningBlock: "音声入力中は使えません",
  recognitionError: "音声認識でエラーが発生しました。",
} as const;

export type VoiceStartFailureReason =
  | "unsupported"
  | "protected"
  | "conflict"
  | "externally-deleted"
  | "presentation"
  | "learning"
  | "dialog-open"
  | "canvas-selection"
  | "relation-partner";

export type VoiceSessionGuardInput = {
  readonly listening: boolean;
  readonly speechSupported: boolean;
};

export type VoiceStartGuardInput = VoiceSessionGuardInput &
  DocumentEditGuardInput & {
    readonly learningActive: boolean;
    readonly playingPresentation: boolean;
    readonly modalBlockingVoiceStart: boolean;
    readonly canvasSelection: MapCanvasSelection;
    readonly relationPartnerOpen: boolean;
  };

export function resolveVoiceStartBlocked(input: VoiceStartGuardInput): VoiceStartFailureReason | null {
  if (!input.speechSupported) return "unsupported";
  if (input.listening) return null;
  if (input.isExternallyDeleted) return "externally-deleted";
  if (input.hasConflict) return "conflict";
  if (input.isProtectedMode) return "protected";
  if (input.playingPresentation) return "presentation";
  if (input.learningActive) return "learning";
  if (input.modalBlockingVoiceStart) return "dialog-open";
  if (input.relationPartnerOpen) return "relation-partner";
  if (isNodeTargetOperationBlocked(input.canvasSelection)) return "canvas-selection";
  return null;
}

export function voiceStartBlockedMessage(reason: VoiceStartFailureReason): string {
  switch (reason) {
    case "unsupported":
      return MAP_VOICE_MESSAGES.unsupported;
    case "protected":
      return MAP_VOICE_MESSAGES.protected;
    case "conflict":
      return MAP_VOICE_MESSAGES.conflict;
    case "externally-deleted":
      return MAP_VOICE_MESSAGES.externallyDeleted;
    case "presentation":
      return MAP_VOICE_MESSAGES.presentation;
    case "learning":
      return MAP_VOICE_MESSAGES.learning;
    case "dialog-open":
      return MAP_VOICE_MESSAGES.dialogOpen;
    case "canvas-selection":
      return MAP_VOICE_MESSAGES.canvasSelection;
    case "relation-partner":
      return MAP_VOICE_MESSAGES.relationPartner;
    default: {
      const neverReason: never = reason;
      return neverReason;
    }
  }
}

export function isVoiceStructureEditBlocked(listening: boolean): boolean {
  return listening;
}

export function isLearnStartBlockedByVoice(listening: boolean): boolean {
  return listening;
}

export function isPresentationStartBlockedByVoice(listening: boolean): boolean {
  return listening;
}

/** モーダル・学習・プレゼンが音声聞き取りを打ち切る条件（useMapEditorVoice の exclusiveStopRequested 正本） */
export function resolveVoiceExclusiveStopRequested(input: {
  readonly modalBlockingVoiceStart: boolean;
  readonly learningActive: boolean;
  readonly playingPresentation: boolean;
}): boolean {
  return input.modalBlockingVoiceStart
    || input.learningActive
    || input.playingPresentation;
}