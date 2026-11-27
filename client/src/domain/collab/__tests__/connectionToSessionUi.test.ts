import { connectionToSessionUi } from "@/domain/collab/connectionToSessionUi";

describe("connectionToSessionUi", () => {
  const base = { sessionId: "s1", role: "owner" as const };

  it("connecting / active / reconnecting / error を写像する", () => {
    expect(connectionToSessionUi({ ...base, connection: "connecting" })).toEqual({
      status: "connecting",
    });
    expect(connectionToSessionUi({ ...base, connection: "active" })).toEqual({
      status: "active",
      sessionId: "s1",
      role: "owner",
    });
    expect(
      connectionToSessionUi({
        ...base,
        connection: "reconnecting",
        reconnectingSince: 42,
      }),
    ).toEqual({ status: "reconnecting", sessionId: "s1", since: 42 });
    expect(connectionToSessionUi({ ...base, connection: "error" })).toEqual({
      status: "error",
      error: "connection-error",
    });
  });

  it("closed → idle（正常）または error（異常）", () => {
    expect(connectionToSessionUi({ ...base, connection: "closed" })).toEqual({
      status: "idle",
    });
    expect(
      connectionToSessionUi({
        ...base,
        connection: "closed",
        closedAsError: "dropped-grace",
      }),
    ).toEqual({ status: "error", error: "dropped-grace" });
  });
});
