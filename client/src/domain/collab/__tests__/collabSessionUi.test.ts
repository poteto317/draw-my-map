import {
  isCollabTabConflictGuardEnabled,
  type CollabSessionUi,
} from "@/domain/collab/collabSessionUi";

describe("isCollabTabConflictGuardEnabled（inventory E2）", () => {
  it("idle のみ有効、active 中は無効", () => {
    const idle: CollabSessionUi = { status: "idle" };
    const active: CollabSessionUi = { status: "active", sessionId: "s1", role: "owner" };
    const connecting: CollabSessionUi = { status: "connecting" };
    const reconnecting: CollabSessionUi = {
      status: "reconnecting",
      sessionId: "s1",
      since: 1,
    };
    const error: CollabSessionUi = { status: "error", error: "dropped-grace" };

    expect(isCollabTabConflictGuardEnabled(idle)).toBe(true);
    expect(isCollabTabConflictGuardEnabled(active)).toBe(false);
    expect(isCollabTabConflictGuardEnabled(connecting)).toBe(false);
    expect(isCollabTabConflictGuardEnabled(reconnecting)).toBe(false);
    expect(isCollabTabConflictGuardEnabled(error)).toBe(false);
  });
});
