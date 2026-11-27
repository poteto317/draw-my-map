import {
  nextCollabSessionAfterClosed,
  planCollabConnectionTransition,
} from "@/domain/collab/planCollabConnectionTransition";

describe("planCollabConnectionTransition", () => {
  const base = {
    sessionId: "s1",
    role: "owner" as const,
    reconnectingSince: null as number | null,
    nowMs: 1000,
  };

  it("connecting: 通常は connecting、reconnectingSince ありなら grace UI 維持", () => {
    expect(planCollabConnectionTransition({ ...base, connection: "connecting" })).toMatchObject({
      nextSession: { status: "connecting" },
      participantsLoading: true,
      clearUndoFlags: true,
      clearParticipantsAndPresence: false,
      enterActive: false,
    });
    expect(
      planCollabConnectionTransition({
        ...base,
        connection: "connecting",
        reconnectingSince: 42,
      }),
    ).toMatchObject({
      nextSession: { status: "reconnecting", sessionId: "s1", since: 42 },
      nextReconnectingSince: 42,
      participantsLoading: true,
    });
  });

  it("active / reconnecting / error の副作用フラグ", () => {
    expect(planCollabConnectionTransition({ ...base, connection: "active" })).toMatchObject({
      nextSession: { status: "active", sessionId: "s1", role: "owner" },
      nextReconnectingSince: null,
      enterActive: true,
      participantsLoading: true,
      tearDownRuntime: false,
    });
    expect(
      planCollabConnectionTransition({ ...base, connection: "reconnecting" }),
    ).toMatchObject({
      nextSession: { status: "reconnecting", sessionId: "s1", since: 1000 },
      nextReconnectingSince: 1000,
      clearParticipantsAndPresence: false,
    });
    expect(planCollabConnectionTransition({ ...base, connection: "error" })).toMatchObject({
      nextSession: { status: "error", error: "connection-error" },
      clearParticipantsAndPresence: true,
      publishConnectionError: true,
      tearDownRuntime: true,
    });
  });
});

describe("nextCollabSessionAfterClosed", () => {
  it("error を保持し、それ以外は idle", () => {
    expect(
      nextCollabSessionAfterClosed({ status: "error", error: "dropped-grace" }),
    ).toEqual({ status: "error", error: "dropped-grace" });
    expect(nextCollabSessionAfterClosed({ status: "active", sessionId: "s", role: "owner" })).toEqual({
      status: "idle",
    });
    expect(nextCollabSessionAfterClosed({ status: "connecting" })).toEqual({ status: "idle" });
  });
});
