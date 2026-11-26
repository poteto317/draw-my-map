import { tokenHash } from "@/domain/share/tokenHash";

/** リンク作成時に DB へ書くフィールド（expires_at は Phase 37 で常に null） */
export type ShareLinkCreatePlan = {
  id: string;
  sharedMapId: string;
  tokenHash: string;
  permission: "view";
  expiresAt: null;
};

export function planShareLinkCreate(input: {
  id: string;
  sharedMapId: string;
  token: string;
  secret: string;
}): ShareLinkCreatePlan {
  return {
    id: input.id,
    sharedMapId: input.sharedMapId,
    tokenHash: tokenHash(input.token, input.secret),
    permission: "view",
    expiresAt: null,
  };
}
