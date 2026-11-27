import {
  createShareClientsFromConfig,
  readShareEnvConfig,
  type ShareEnvConfig,
} from "@/server/share/shareConfig";
import type { D1Client } from "@/services/share/d1Client";
import type { R2Client } from "@/services/share/r2Client";

export type CollabEnvConfig = {
  share: ShareEnvConfig;
  ticketSecret: string;
  /** wsUrl の origin 正本（x-forwarded-* は使わない） */
  wsOrigin: string;
  /**
   * Next → collab-worker 管理 API（seed/export/connections）用。
   * 無ければ room client は未実装のまま（Task 3 前と同様）。
   */
  serviceSecret: string | null;
};

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

/**
 * 共同編集用 env。
 * D1/R2 は共有（CF_SHARE_*）を再利用。チケット秘密と WS origin は Collab 専用。
 */
export function readCollabEnvConfig(
  env: Record<string, string | undefined>,
): CollabEnvConfig | null {
  const share = readShareEnvConfig(env);
  const ticketSecret =
    nonEmpty(env.CF_COLLAB_TICKET_SECRET) ?? nonEmpty(env.AUTH_SECRET);
  const wsOriginRaw = nonEmpty(env.CF_COLLAB_WS_ORIGIN);
  if (!share || !ticketSecret || !wsOriginRaw) return null;

  let wsOrigin: string;
  try {
    wsOrigin = new URL(wsOriginRaw).origin;
  } catch {
    wsOrigin = wsOriginRaw.replace(/\/$/, "");
  }

  const serviceSecret = nonEmpty(env.CF_COLLAB_SERVICE_SECRET);
  return { share, ticketSecret, wsOrigin, serviceSecret };
}

export function createCollabClientsFromConfig(config: CollabEnvConfig): {
  d1: D1Client;
  r2: R2Client;
} {
  return createShareClientsFromConfig(config.share);
}

/**
 * wsUrl 用 origin。env のみ（L-1231）。request / x-forwarded-host は見ない。
 */
export function resolveCollabWsOrigin(
  env: Record<string, string | undefined>,
): string | null {
  const config = readCollabEnvConfig(env);
  return config?.wsOrigin ?? null;
}
