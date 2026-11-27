import { auth } from "@/auth";
import {
  toShareCommenter,
  toShareSession,
  type ShareCommenter,
  type ShareSession,
} from "@/domain/share/shareSession";
import type { ShareApiDeps } from "@/server/share/handleShareApi";
import {
  createShareClientsFromConfig,
  readShareEnvConfig,
  resolveSharePublicOrigin,
} from "@/server/share/shareConfig";
import {
  processShareCommentWriteRateLimiter,
  processShareOwnerRateLimiter,
  processShareViewRateLimiter,
} from "@/server/share/shareRateLimit";

export async function sessionFromAuth(): Promise<ShareSession> {
  const session = await auth();
  return toShareSession(session?.user);
}

/** コメント投稿者。email は使わない（toShareCommenter） */
export async function commenterFromAuth(): Promise<ShareCommenter | null> {
  const session = await auth();
  return toShareCommenter(session?.user);
}

/** 本番ルート用。設定欠落時は null → 呼び出し側が 503 */
export function createShareApiDepsFromEnv(
  env: Record<string, string | undefined> = process.env,
  request?: Request,
): ShareApiDeps | null {
  const config = readShareEnvConfig(env);
  if (!config) return null;
  const { d1, r2 } = createShareClientsFromConfig(config);

  return {
    getSession: sessionFromAuth,
    getCommenter: commenterFromAuth,
    d1,
    r2,
    tokenSecret: config.tokenSecret,
    publicOrigin: resolveSharePublicOrigin(env, request),
    // プロセス共有リミッタ（リクエストごとに新規 create しない）
    ownerRateLimiter: processShareOwnerRateLimiter,
    viewRateLimiter: processShareViewRateLimiter,
    commentWriteRateLimiter: processShareCommentWriteRateLimiter,
  };
}

export function notConfiguredResponse(): Response {
  return Response.json({ ok: false, reason: "not-configured" }, { status: 503 });
}
