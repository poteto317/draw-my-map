import { auth } from "@/auth";
import { toShareSession, type ShareSession } from "@/domain/share/shareSession";
import {
  createCollabClientsFromConfig,
  readCollabEnvConfig,
} from "@/server/collab/collabConfig";
import type { CollabApiDeps } from "@/server/collab/handleCollabApi";
import { processCollabRateLimiter } from "@/server/collab/collabRateLimit";
import {
  createUnimplementedCollabRoomClient,
  type CollabRoomClient,
} from "@/server/collab/collabRoomClient";
import { createHttpCollabRoomClient } from "@/server/collab/httpCollabRoomClient";

export async function sessionFromAuth(): Promise<ShareSession> {
  const session = await auth();
  return toShareSession(session?.user);
}

/** serviceSecret があるとき Worker HTTP、なければ未実装プレースホルダ */
export function createCollabRoomClientFromConfig(config: {
  wsOrigin: string;
  serviceSecret: string | null;
}): CollabRoomClient {
  if (!config.serviceSecret) {
    return createUnimplementedCollabRoomClient();
  }
  return createHttpCollabRoomClient({
    origin: config.wsOrigin,
    serviceSecret: config.serviceSecret,
  });
}

/** 本番ルート用。設定欠落時は null → 呼び出し側が 503 */
export function createCollabApiDepsFromEnv(
  env: Record<string, string | undefined> = process.env,
): CollabApiDeps | null {
  const config = readCollabEnvConfig(env);
  if (!config) return null;
  const { d1, r2 } = createCollabClientsFromConfig(config);

  return {
    getSession: sessionFromAuth,
    d1,
    r2,
    tokenSecret: config.share.tokenSecret,
    ticketSecret: config.ticketSecret,
    wsOrigin: config.wsOrigin,
    // プロセス共有リミッタ（リクエストごとに新規 create しない）
    rateLimiter: processCollabRateLimiter,
    room: createCollabRoomClientFromConfig(config),
  };
}

export function notConfiguredResponse(): Response {
  const response = Response.json({ ok: false, reason: "not-configured" }, { status: 503 });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
