import {
  MAP_VOICE_MESSAGES,
  resolveVoiceStartBlocked,
  voiceStartBlockedMessage,
  isVoiceStructureEditBlocked,
  resolveVoiceExclusiveStopRequested,
} from "@/domain/map/mapVoiceGuards";
import { groupSelection, nodesSelection, relationSelection } from "@/domain/map/mapCanvasSelectionGuards";

const base = {
  listening: false,
  speechSupported: true,
  isProtectedMode: false,
  hasConflict: false,
  isExternallyDeleted: false,
  learningActive: false,
  playingPresentation: false,
  modalBlockingVoiceStart: false,
  canvasSelection: nodesSelection([]),
  relationPartnerOpen: false,
};

describe("mapVoiceGuards", () => {
  it("未対応ブラウザは拒否", () => {
    expect(resolveVoiceStartBlocked({ ...base, speechSupported: false })).toBe("unsupported");
    expect(voiceStartBlockedMessage("unsupported")).toBe(MAP_VOICE_MESSAGES.unsupported);
  });

  it("inventory 代表の開始拒否と日本語 reason", () => {
    expect(resolveVoiceStartBlocked({ ...base, isProtectedMode: true })).toBe("protected");
    expect(resolveVoiceStartBlocked({ ...base, hasConflict: true })).toBe("conflict");
    expect(resolveVoiceStartBlocked({ ...base, isExternallyDeleted: true })).toBe("externally-deleted");
    expect(resolveVoiceStartBlocked({ ...base, learningActive: true })).toBe("learning");
    expect(resolveVoiceStartBlocked({ ...base, playingPresentation: true })).toBe("presentation");
    expect(resolveVoiceStartBlocked({ ...base, modalBlockingVoiceStart: true })).toBe("dialog-open");
    expect(resolveVoiceStartBlocked({ ...base, canvasSelection: relationSelection(1) })).toBe("canvas-selection");
    expect(resolveVoiceStartBlocked({ ...base, canvasSelection: groupSelection(2) })).toBe("canvas-selection");
    expect(resolveVoiceStartBlocked({ ...base, relationPartnerOpen: true })).toBe("relation-partner");
    expect(voiceStartBlockedMessage("protected")).toBe(MAP_VOICE_MESSAGES.protected);
    expect(voiceStartBlockedMessage("dialog-open")).toBe(MAP_VOICE_MESSAGES.dialogOpen);
  });

  it("listening 中の再開始はブロック理由に含めない（no-op 側）", () => {
    expect(resolveVoiceStartBlocked({ ...base, listening: true, isProtectedMode: true })).toBe(null);
  });

  it("listening 中は構造編集を塞ぐ", () => {
    expect(isVoiceStructureEditBlocked(true)).toBe(true);
    expect(isVoiceStructureEditBlocked(false)).toBe(false);
  });

  it("排他停止はモーダル・学習・プレゼンのいずれかで真", () => {
    expect(resolveVoiceExclusiveStopRequested({
      modalBlockingVoiceStart: false,
      learningActive: false,
      playingPresentation: false,
    })).toBe(false);
    expect(resolveVoiceExclusiveStopRequested({
      modalBlockingVoiceStart: true,
      learningActive: false,
      playingPresentation: false,
    })).toBe(true);
  });
});