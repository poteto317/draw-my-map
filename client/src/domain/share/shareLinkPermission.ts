import type { ShareResult } from "@/domain/share/shareResult";

/** 共有リンクの権限。view は閲覧のみ、comment は閲覧＋コメント */
export type ShareLinkPermission = "view" | "comment";

/** DB・入力の文字列を権限に解釈する。完全一致のみ（大文字・前後空白は不可） */
export function parseShareLinkPermission(value: string): ShareLinkPermission | null {
  if (value === "view" || value === "comment") return value;
  return null;
}

/** 発行できる権限か。解釈できなければ invalid-permission */
export function assertIssuableLinkPermission(
  value: string,
): ShareResult<ShareLinkPermission> {
  const permission = parseShareLinkPermission(value);
  if (permission === null) {
    return { ok: false, reason: "invalid-permission" };
  }
  return { ok: true, value: permission };
}

export function linkPermissionAllowsComments(permission: ShareLinkPermission): boolean {
  return permission === "comment";
}
