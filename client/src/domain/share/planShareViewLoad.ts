import {
  parseShareViewDocumentJson,
  type ShareViewDocumentParse,
} from "@/domain/share/parseShareViewDocument";
import {
  linkPermissionAllowsShareView,
  parseShareLinkPermission,
  type ShareLinkPermission,
} from "@/domain/share/shareLinkPermission";
import { SHARE_MESSAGES } from "@/domain/share/shareMessages";
import type { ShareResult } from "@/domain/share/shareResult";
import type { MapDocument } from "@/types/mapDocument";

export type ShareViewLoadPlan =
  | { status: "ready"; document: MapDocument; permission: ShareLinkPermission; loadError: null }
  | { status: "error"; document: null; loadError: string };

/** API 失敗 reason → 閲覧頁の固定文言（トークン・内部詳細は出さない） */
export function shareViewLoadFailureMessage(reason: string): string {
  return reason === "not-found"
    ? SHARE_MESSAGES.viewNotFound
    : SHARE_MESSAGES.viewLoadFailed;
}

/**
 * viewByToken の結果を閲覧頁の LoadState へ写す（純関数）。
 * 取得 I/O・setState は呼び出し側。
 */
export function planShareViewLoad(
  result: ShareResult<{ documentJson: string; permission: string }>,
): ShareViewLoadPlan {
  if (!result.ok) {
    return {
      status: "error",
      document: null,
      loadError: shareViewLoadFailureMessage(result.reason),
    };
  }
  // 未知の権限・edit（/collab 専用）は閲覧ルートでは文書を表示しない
  const permission = parseShareLinkPermission(result.value.permission);
  if (permission === null || !linkPermissionAllowsShareView(permission)) {
    return { status: "error", document: null, loadError: SHARE_MESSAGES.viewLoadFailed };
  }
  return planShareViewDocumentParse(
    parseShareViewDocumentJson(result.value.documentJson),
    permission,
  );
}

/** パース結果を LoadState へ写す（例外経路の固定文言にも使う） */
export function planShareViewDocumentParse(
  parsed: ShareViewDocumentParse,
  permission: ShareLinkPermission,
): ShareViewLoadPlan {
  if (!parsed.ok) {
    return { status: "error", document: null, loadError: parsed.error };
  }
  return { status: "ready", document: parsed.document, permission, loadError: null };
}

/** ネットワーク例外など、API Result が得られないとき */
export function planShareViewLoadCaughtError(): ShareViewLoadPlan {
  return {
    status: "error",
    document: null,
    loadError: SHARE_MESSAGES.viewLoadFailed,
  };
}
