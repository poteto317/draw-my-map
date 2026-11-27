import { issueCollabTicket, verifyCollabTicket } from "../src/ticket";

describe("collab-worker ticket", () => {
  const secret = "shared-ticket-secret";

  it("発行と検証が一致し、改ざんは null", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const ticket = await issueCollabTicket(
      { sessionId: "s1", userId: "u1" },
      secret,
      nowMs,
      60,
    );
    expect(await verifyCollabTicket(ticket, secret, nowMs)).toEqual({
      sessionId: "s1",
      userId: "u1",
      exp: Math.floor(nowMs / 1000) + 60,
    });
    expect(await verifyCollabTicket(ticket + "x", secret, nowMs)).toBeNull();
    expect(await verifyCollabTicket(ticket, "other", nowMs)).toBeNull();
  });

  it("失敗結果に ticket 平文を含めない", async () => {
    const nowMs = Date.now();
    const ticket = await issueCollabTicket(
      { sessionId: "s1", userId: "u1" },
      secret,
      nowMs,
    );
    const result = await verifyCollabTicket("bad." + ticket, secret, nowMs);
    expect(result).toBeNull();
    expect(JSON.stringify(result)).not.toContain(ticket);
  });
});
