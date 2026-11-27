import {
  postParticipantDrop,
  resolveParticipantDropTarget,
} from "../src/participantDrop";

describe("resolveParticipantDropTarget", () => {
  it("URL と sessionId があれば ok", () => {
    expect(
      resolveParticipantDropTarget({
        url: "https://app.example/api/collab/drop-participant",
        sessionId: "s1",
      }),
    ).toEqual({
      ok: true,
      url: "https://app.example/api/collab/drop-participant",
      sessionId: "s1",
    });
  });

  it("URL 欠落は participant-drop-misconfigured", () => {
    expect(
      resolveParticipantDropTarget({
        url: undefined,
        sessionId: "s1",
      }),
    ).toEqual({ ok: false, reason: "participant-drop-misconfigured" });
    expect(
      resolveParticipantDropTarget({
        url: "",
        sessionId: "s1",
      }),
    ).toEqual({ ok: false, reason: "participant-drop-misconfigured" });
  });

  it("sessionId 欠落も participant-drop-misconfigured", () => {
    expect(
      resolveParticipantDropTarget({
        url: "https://app.example/drop",
        sessionId: null,
      }),
    ).toEqual({ ok: false, reason: "participant-drop-misconfigured" });
  });
});

describe("postParticipantDrop", () => {
  it("service secret と session/user ヘッダで POST する", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(null, { status: 200 });
    };
    expect(
      await postParticipantDrop({
        url: "https://app.example/api/collab/drop-participant",
        serviceSecret: "svc",
        sessionId: "s1",
        userId: "u1",
        fetchImpl,
      }),
    ).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://app.example/api/collab/drop-participant");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer svc");
    expect(headers["x-collab-session-id"]).toBe("s1");
    expect(headers["x-collab-user-id"]).toBe("u1");
  });

  it("非2xx と例外は false", async () => {
    expect(
      await postParticipantDrop({
        url: "https://app.example/drop",
        serviceSecret: "svc",
        sessionId: "s1",
        userId: "u1",
        fetchImpl: async () => new Response(null, { status: 500 }),
      }),
    ).toBe(false);
    expect(
      await postParticipantDrop({
        url: "https://app.example/drop",
        serviceSecret: "svc",
        sessionId: "s1",
        userId: "u1",
        fetchImpl: async () => {
          throw new Error("network");
        },
      }),
    ).toBe(false);
  });
});
