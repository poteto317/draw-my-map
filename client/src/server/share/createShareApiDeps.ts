import { auth } from "@/auth";
import { toShareSession, type ShareSession } from "@/domain/share/shareSession";
import type { ShareApiDeps } from "@/server/share/handleShareApi";
import {
  createShareClientsFromConfig,
  readShareEnvConfig,
  resolveSharePublicOrigin,
} from "@/server/share/shareConfig";
import {
  processShareOwnerRateLimiter,
  processShareViewRateLimiter,
} from "@/server/share/shareRateLimit";

export async function sessionFromAuth(): Promise<ShareSession> {
  const session = await auth();
  return toShareSession(session?.user);
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
    d1,
    r2,
    tokenSecret: config.tokenSecret,
    publicOrigin: resolveSharePublicOrigin(env, request),
    // プロセス共有リミッタ（リクエストごとに新規 create しない）
    ownerRateLimiter: processShareOwnerRateLimiter,
    viewRateLimiter: processShareViewRateLimiter,
  };
}

export function notConfiguredResponse(): Response {
  return Response.json({ ok: false, reason: "not-configured" }, { status: 503 });
}
