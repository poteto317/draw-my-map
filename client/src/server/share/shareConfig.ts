import { createD1Client, type D1Client } from "@/services/share/d1Client";
import { createR2Client, type R2Client } from "@/services/share/r2Client";

export type ShareEnvConfig = {
  tokenSecret: string;
  d1: {
    accountId: string;
    apiToken: string;
    databaseId: string;
  };
  r2: {
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    endpoint: string;
  };
};

function nonEmpty(value: string | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

/** 共有用 env。欠落時は null（ルートは 503） */
export function readShareEnvConfig(
  env: Record<string, string | undefined>,
): ShareEnvConfig | null {
  const tokenSecret = nonEmpty(env.CF_SHARE_TOKEN_SECRET) ?? nonEmpty(env.AUTH_SECRET);
  const accountId = nonEmpty(env.CF_SHARE_ACCOUNT_ID);
  const apiToken = nonEmpty(env.CF_SHARE_API_TOKEN);
  const databaseId = nonEmpty(env.CF_SHARE_D1_DATABASE_ID);
  const accessKeyId = nonEmpty(env.CF_SHARE_R2_ACCESS_KEY_ID);
  const secretAccessKey = nonEmpty(env.CF_SHARE_R2_SECRET_ACCESS_KEY);
  const bucket = nonEmpty(env.CF_SHARE_R2_BUCKET);
  const endpoint = nonEmpty(env.CF_SHARE_R2_ENDPOINT);

  if (
    !tokenSecret ||
    !accountId ||
    !apiToken ||
    !databaseId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket ||
    !endpoint
  ) {
    return null;
  }

  return {
    tokenSecret,
    d1: { accountId, apiToken, databaseId },
    r2: { accessKeyId, secretAccessKey, bucket, endpoint },
  };
}

export function createShareClientsFromConfig(config: ShareEnvConfig): {
  d1: D1Client;
  r2: R2Client;
} {
  return {
    d1: createD1Client(config.d1),
    r2: createR2Client(config.r2),
  };
}

/**
 * 共有リンク URL の origin。
 * 優先: CF_SHARE_PUBLIC_ORIGIN → AUTH_URL → NEXT_PUBLIC_APP_URL。
 * フォールバック: request.url の origin（x-forwarded-* は検証なしのため使わない）。
 * リクエストも無ければ http://localhost:3000。
 */
export function resolveSharePublicOrigin(
  env: Record<string, string | undefined>,
  request?: Request,
): string {
  const fromEnv =
    nonEmpty(env.CF_SHARE_PUBLIC_ORIGIN) ??
    nonEmpty(env.AUTH_URL) ??
    nonEmpty(env.NEXT_PUBLIC_APP_URL);
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      return fromEnv.replace(/\/$/, "");
    }
  }
  if (request) return new URL(request.url).origin;
  return "http://localhost:3000";
}
