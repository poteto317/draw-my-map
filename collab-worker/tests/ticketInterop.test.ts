/**
 * Next（node:crypto）と Worker（Web Crypto）の HMAC が一致することを固定ベクタで確認。
 * ベクタは client の issueCollabTicket と同アルゴリズムで生成したもの。
 */
import { createHmac } from "node:crypto";
import { verifyCollabTicket } from "../src/ticket";

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function issueLikeNext(
  claims: { sessionId: string; userId: string; exp: number },
  secret: string,
): string {
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(claims), "utf8"));
  const sig = toBase64Url(
    createHmac("sha256", secret).update(payloadB64, "utf8").digest(),
  );
  return `${payloadB64}.${sig}`;
}

describe("ticket interop (Next HMAC ↔ Worker verify)", () => {
  it("Node 発行チケットを Worker verify が受け入れる", async () => {
    const nowMs = Date.parse("2026-11-27T12:00:00.000Z");
    const secret = "interop-secret";
    const ticket = issueLikeNext(
      {
        sessionId: "s-interop",
        userId: "u-interop",
        exp: Math.floor(nowMs / 1000) + 60,
      },
      secret,
    );
    expect(await verifyCollabTicket(ticket, secret, nowMs)).toEqual({
      sessionId: "s-interop",
      userId: "u-interop",
      exp: Math.floor(nowMs / 1000) + 60,
    });
  });
});
