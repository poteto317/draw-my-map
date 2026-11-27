import { createHmac, timingSafeEqual } from "node:crypto";
import type { CollabTicketClaims } from "@/server/collab/collabTypes";

/** 短命チケットの既定 TTL（秒） */
export const COLLAB_TICKET_TTL_SECONDS = 60;

function toBase64Url(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  try {
    return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return null;
  }
}

function signPayload(payloadB64: string, secret: string): string {
  return toBase64Url(createHmac("sha256", secret).update(payloadB64, "utf8").digest());
}

/** HMAC 付き短命チケットを発行する。呼び出し側は平文をログに出さない */
export function issueCollabTicket(
  claims: Omit<CollabTicketClaims, "exp"> & { exp?: number },
  secret: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = COLLAB_TICKET_TTL_SECONDS,
): string {
  const full: CollabTicketClaims = {
    sessionId: claims.sessionId,
    userId: claims.userId,
    exp: claims.exp ?? Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const payloadB64 = toBase64Url(Buffer.from(JSON.stringify(full), "utf8"));
  const sig = signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}

/** 署名・期限を検証する。失敗理由に ticket 平文は含めない */
export function verifyCollabTicket(
  ticket: string,
  secret: string,
  nowMs: number = Date.now(),
): CollabTicketClaims | null {
  if (typeof ticket !== "string" || ticket.length === 0) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = signPayload(payloadB64, secret);
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  const raw = fromBase64Url(payloadB64);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString("utf8")) as unknown;
  } catch {
    return null;
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as CollabTicketClaims).sessionId !== "string" ||
    typeof (parsed as CollabTicketClaims).userId !== "string" ||
    typeof (parsed as CollabTicketClaims).exp !== "number"
  ) {
    return null;
  }
  const claims = parsed as CollabTicketClaims;
  if (claims.sessionId.length === 0 || claims.userId.length === 0) return null;
  // exp == now も期限切れ（残り 0 秒は拒否）
  if (claims.exp <= Math.floor(nowMs / 1000)) return null;
  return claims;
}
