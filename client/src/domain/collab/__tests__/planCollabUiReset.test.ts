import {
  planCollabUiResetDroppedGrace,
  planCollabUiResetToIdle,
} from "@/domain/collab/planCollabUiReset";

describe("planCollabUiReset", () => {
  it("idle リセットは tearDown と参加者・Undo クリアを計画する", () => {
    expect(planCollabUiResetToIdle()).toEqual({
      nextSession: { status: "idle" },
      tearDownRuntime: true,
      clearParticipantsAndPresence: true,
      clearUndoFlags: true,
      participantsState: "ready",
    });
  });

  it("dropped-grace は error セッションと同等のクリアを計画する", () => {
    expect(planCollabUiResetDroppedGrace()).toEqual({
      nextSession: { status: "error", error: "dropped-grace" },
      tearDownRuntime: true,
      clearParticipantsAndPresence: true,
      clearUndoFlags: true,
      participantsState: "ready",
    });
  });
});
