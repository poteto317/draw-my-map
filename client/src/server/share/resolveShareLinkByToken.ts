import {
  parseShareLinkPermission,
  type ShareLinkPermission,
} from "@/domain/share/shareLinkPermission";
import type { ShareResult } from "@/domain/share/shareResult";
import { tokenHash } from "@/domain/share/tokenHash";
import type {
  ShareLinkRecord,
  SharedMapRecord,
  ShareStore,
} from "@/server/share/shareStore";

export type ResolvedShareLink = {
  link: ShareLinkRecord;
  map: SharedMapRecord;
  permission: ShareLinkPermission;
};

/**
 * 平文トークンから有効なリンクと公開中のマップを引く。
 * 空トークン・不明・失効・未知の permission・マップ無し・未公開はすべて not-found（存在を漏らさない）。
 */
export async function resolveShareLinkByToken(
  store: ShareStore,
  token: string,
  tokenSecret: string,
): Promise<ShareResult<ResolvedShareLink>> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "not-found" };
  }
  try {
    const link = await store.findLinkByTokenHash(tokenHash(token, tokenSecret));
    if (!link || link.revokedAt !== null) {
      return { ok: false, reason: "not-found" };
    }
    const permission = parseShareLinkPermission(link.permission);
    if (permission === null) {
      return { ok: false, reason: "not-found" };
    }
    const map = await store.getMap(link.sharedMapId);
    if (!map || map.currentRevisionId === null) {
      return { ok: false, reason: "not-found" };
    }
    return { ok: true, value: { link, map, permission } };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}
