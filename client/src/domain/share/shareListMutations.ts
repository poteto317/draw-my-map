import type {
  ShareListItem,
  ShareListItemProjection,
  ShareListLinkProjection,
} from "@/domain/share/shareLocalMetaProjection";

/** 一覧ミューテーション用（正本 ShareListItem と同形） */
export type ShareListItemMutable = ShareListItem;

/** 失効成功後の一覧更新。対象外マップはそのまま */
export function applyRevokeToShareList<T extends ShareListItemMutable>(
  shareList: readonly T[],
  sharedMapId: string,
  linkId: string,
  revokedAt: string,
): T[] {
  return shareList.map((item) => {
    if (item.id !== sharedMapId) return item;
    return {
      ...item,
      links: item.links.map((link) =>
        link.id === linkId ? { ...link, revokedAt } : link,
      ),
    };
  });
}

/** 再発行成功後: 旧リンク失効＋新リンク追加 */
export function applyReissueToShareList<T extends ShareListItemMutable>(
  shareList: readonly T[],
  sharedMapId: string,
  oldLinkId: string,
  newLink: ShareListLinkProjection,
  revokedAt: string,
): T[] {
  return shareList.map((item) => {
    if (item.id !== sharedMapId) return item;
    return {
      ...item,
      links: [
        ...item.links.map((existing) =>
          existing.id === oldLinkId
            ? { ...existing, revokedAt }
            : existing,
        ),
        newLink,
      ],
    };
  });
}

/** 一覧上でまだ有効なリンクがあるか */
export function shareListHasActiveLink(
  shareList: readonly ShareListItemProjection[],
  sharedMapId: string,
): boolean {
  const mine = shareList.find((item) => item.id === sharedMapId);
  return mine?.links.some((link) => link.revokedAt === null) ?? false;
}
