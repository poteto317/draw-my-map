import type { CollabSessionUi } from "@/domain/collab/collabSessionUi";

/**
 * leave / end / mapId 切替 / dropped-grace で共有する UI リセット計画（副作用なし）。
 * フックは tearDown と setState の適用だけを行う。
 */
export type PlanCollabUiResetResult = {
  nextSession: CollabSessionUi;
  tearDownRuntime: true;
  clearParticipantsAndPresence: true;
  clearUndoFlags: true;
  participantsState: "ready";
};

/** 正常終了・退出・マップ切替後の idle へ */
export function planCollabUiResetToIdle(): PlanCollabUiResetResult {
  return {
    nextSession: { status: "idle" },
    tearDownRuntime: true,
    clearParticipantsAndPresence: true,
    clearUndoFlags: true,
    participantsState: "ready",
  };
}

/** 再接続 grace 超過後の error（dropped-grace）へ */
export function planCollabUiResetDroppedGrace(): PlanCollabUiResetResult {
  return {
    nextSession: { status: "error", error: "dropped-grace" },
    tearDownRuntime: true,
    clearParticipantsAndPresence: true,
    clearUndoFlags: true,
    participantsState: "ready",
  };
}
