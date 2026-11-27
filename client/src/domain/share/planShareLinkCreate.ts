import type { ShareLinkPermission } from "@/domain/share/shareLinkPermission";
import { tokenHash } from "@/domain/share/tokenHash";

/** リンク作成時に DB へ書くフィールド（expires_at は常に null） */
export type ShareLinkCreatePlan = {
  id: string;
  sharedMapId: string;
  tokenHash: string;
  permission: ShareLinkPermission;
  expiresAt: null;
};

export function planShareLinkCreate(input: {
  id: string;
  sharedMapId: string;
  token: string;
  secret: string;
  permission: ShareLinkPermission;
}): ShareLinkCreatePlan {
  return {
    id: input.id,
    sharedMapId: input.sharedMapId,
    tokenHash: tokenHash(input.token, input.secret),
    permission: input.permission,
    expiresAt: null,
  };
}
