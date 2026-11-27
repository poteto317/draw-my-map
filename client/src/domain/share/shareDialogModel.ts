import {
  parseShareLinkPermission,
  type ShareLinkPermission,
} from "@/domain/share/shareLinkPermission";
import type { ShareLocalMetaRead } from "@/domain/share/shareLocalMeta";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

/** ダイアログ一覧行に必要な最小リンク形 */
export type ShareDialogLinkRef = {
  readonly id: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  /** サーバーの生値。表示前に parseShareLinkPermission で解釈する */
  readonly permission: string;
};

/** ダイアログがマップ照合に使う一覧項目の最小形 */
export type ShareDialogListItemRef = {
  readonly id: string;
  readonly localMapId: string;
  readonly links: readonly ShareDialogLinkRef[];
};

/** ローカルメタの要約文言（未共有・読取失敗・公開／リンク状態） */
export function formatShareLocalMetaSummary(localMeta: ShareLocalMetaRead): string {
  if (localMeta.status === "missing") {
    return SHARE_MESSAGES.notShared;
  }
  if (localMeta.status === "read-error") {
    return SHARE_MESSAGES.localMetaReadError;
  }
  const { lastPublishedAt, linkActive } = localMeta.value;
  const published = lastPublishedAt
    ? `${SHARE_MESSAGES.lastPublished}: ${lastPublishedAt}`
    : SHARE_MESSAGES.neverPublished;
  const link = linkActive ? SHARE_MESSAGES.linkActive : SHARE_MESSAGES.linkInactive;
  return `${published} / ${link}`;
}

/**
 * このマップの有効リンクだけを返す。
 * localMeta が present でない・一覧に無いときは空（未共有導線に倒さない）。
 */
export function listActiveShareLinksForMap(
  shareList: readonly ShareDialogListItemRef[],
  mapId: string,
  localMeta: ShareLocalMetaRead,
): Array<{ id: string; createdAt: string; permission: ShareLinkPermission | null }> {
  if (localMeta.status !== "present") return [];
  const shared = shareList.find(
    (item) => item.id === localMeta.value.sharedMapId || item.localMapId === mapId,
  );
  if (!shared) return [];
  return shared.links
    .filter((link) => link.revokedAt === null)
    .map((link) => ({
      id: link.id,
      createdAt: link.createdAt,
      permission: parseShareLinkPermission(link.permission),
    }));
}

/** リンクの権限ラベル。解釈できない値（null）は「不明」 */
export function formatShareLinkPermissionLabel(permission: ShareLinkPermission | null): string {
  if (permission === "view") return SHARE_MESSAGES.permissionView;
  if (permission === "comment") return SHARE_MESSAGES.permissionComment;
  return SHARE_MESSAGES.permissionUnknown;
}
