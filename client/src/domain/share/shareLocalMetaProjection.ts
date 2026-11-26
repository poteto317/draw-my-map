import type { CreateShareValue } from "@/domain/share/shareLink";
import type { ShareLocalMetaValue } from "@/domain/share/shareLocalMeta";

/** 一覧同期・失効判定に必要な最小リンク形 */
export type ShareListLinkProjection = {
  readonly id: string;
  readonly permission: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
  readonly expiresAt: null;
};

/**
 * 共有一覧 1 件の正本（server / API client はこれを import type する）。
 * フィールド追加はここに寄せ、レイヤー間の三重定義を避ける。
 */
export type ShareListItem = {
  readonly id: string;
  readonly localMapId: string;
  readonly title: string;
  readonly currentRevisionId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly links: readonly ShareListLinkProjection[];
};

/** ローカルメタへ写す一覧項目の最小形 */
export type ShareListItemProjection = Pick<
  ShareListItem,
  "id" | "currentRevisionId" | "updatedAt" | "links"
>;

/** createShare 成功値 → ローカルメタ（発行リンクはメモリのみ・ここでは持たない） */
export function shareLocalMetaFromCreate(
  value: CreateShareValue,
  publishedAt: string,
): ShareLocalMetaValue {
  return {
    sharedMapId: value.sharedMapId,
    lastPublishedAt: publishedAt,
    linkActive: true,
  };
}

/** サーバー一覧の 1 件 → ローカルメタ（current 無しは未公開扱い） */
export function shareLocalMetaFromListItem(
  item: ShareListItemProjection,
): ShareLocalMetaValue {
  const active = item.links.some((link) => link.revokedAt === null);
  return {
    sharedMapId: item.id,
    lastPublishedAt: item.currentRevisionId ? item.updatedAt : null,
    linkActive: active,
  };
}

/** publish 成功後のローカルメタ（linkActive は現状維持、無いときは true） */
export function shareLocalMetaAfterPublish(
  sharedMapId: string,
  publishedAt: string,
  previous: ShareLocalMetaValue | null,
): ShareLocalMetaValue {
  return {
    sharedMapId,
    lastPublishedAt: publishedAt,
    linkActive: previous?.linkActive ?? true,
  };
}

/** createLink / reissue 成功後（有効リンクあり） */
export function shareLocalMetaWithActiveLink(
  sharedMapId: string,
  previous: ShareLocalMetaValue | null,
): ShareLocalMetaValue {
  return {
    sharedMapId,
    lastPublishedAt: previous?.lastPublishedAt ?? null,
    linkActive: true,
  };
}

/** revoke 成功後（linkActive は呼び出し側が一覧から算出） */
export function shareLocalMetaAfterRevoke(
  sharedMapId: string,
  previous: ShareLocalMetaValue | null,
  linkActive: boolean,
): ShareLocalMetaValue {
  return {
    sharedMapId,
    lastPublishedAt: previous?.lastPublishedAt ?? null,
    linkActive,
  };
}
