/** @jest-environment node */

import {
  issueCollabTicket,
  verifyCollabTicket,
} from "@/server/collab/collabTicket";

describe("collabTicket", () => {
  const secret = "ticket-secret";

  it("発行した ticket を検証できる", () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const ticket = issueCollabTicket(
      { sessionId: "s1", userId: "u1" },
      secret,
      nowMs,
      60,
    );
    expect(ticket.includes(".")).toBe(true);
    const claims = verifyCollabTicket(ticket, secret, nowMs);
    expect(claims).toEqual({
      sessionId: "s1",
      userId: "u1",
      exp: Math.floor(nowMs / 1000) + 60,
    });
  });

  it("改ざん・期限切れ・別秘密は null", () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const ticket = issueCollabTicket(
      { sessionId: "s1", userId: "u1" },
      secret,
      nowMs,
      60,
    );
    expect(verifyCollabTicket(ticket + "x", secret, nowMs)).toBeNull();
    expect(verifyCollabTicket(ticket, "other", nowMs)).toBeNull();
    expect(verifyCollabTicket(ticket, secret, nowMs + 61_000)).toBeNull();
  });

  it("exp が now 以下なら拒否する", () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const nowSec = Math.floor(nowMs / 1000);
    const atNow = issueCollabTicket(
      { sessionId: "s1", userId: "u1", exp: nowSec },
      secret,
      nowMs,
    );
    expect(verifyCollabTicket(atNow, secret, nowMs)).toBeNull();

    const past = issueCollabTicket(
      { sessionId: "s1", userId: "u1", exp: nowSec - 1 },
      secret,
      nowMs,
    );
    expect(verifyCollabTicket(past, secret, nowMs)).toBeNull();

    const future = issueCollabTicket(
      { sessionId: "s1", userId: "u1", exp: nowSec + 1 },
      secret,
      nowMs,
    );
    expect(verifyCollabTicket(future, secret, nowMs)?.exp).toBe(nowSec + 1);
  });
});
