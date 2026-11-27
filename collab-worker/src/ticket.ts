export type CollabTicketClaims = {
  sessionId: string;
  userId: string;
  exp: number;
};

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const b64 = padded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]!);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signPayload(payloadB64: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payloadB64),
  );
  return toBase64Url(mac);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i)! ^ b.charCodeAt(i)!;
  return diff === 0;
}

/** HMAC チケット検証。失敗理由に ticket 平文を含めない */
export async function verifyCollabTicket(
  ticket: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<CollabTicketClaims | null> {
  if (typeof ticket !== "string" || ticket.length === 0) return null;
  const parts = ticket.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expected = await signPayload(payloadB64, secret);
  if (!timingSafeEqualStr(sig, expected)) return null;

  const raw = fromBase64Url(payloadB64);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw)) as unknown;
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
  if (claims.exp <= Math.floor(nowMs / 1000)) return null;
  return claims;
}

/** テスト用発行（Worker 本番では Next が発行する） */
export async function issueCollabTicket(
  claims: Omit<CollabTicketClaims, "exp"> & { exp?: number },
  secret: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = 60,
): Promise<string> {
  const full: CollabTicketClaims = {
    sessionId: claims.sessionId,
    userId: claims.userId,
    exp: claims.exp ?? Math.floor(nowMs / 1000) + ttlSeconds,
  };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await signPayload(payloadB64, secret);
  return `${payloadB64}.${sig}`;
}
