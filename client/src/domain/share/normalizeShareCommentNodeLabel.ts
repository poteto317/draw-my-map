import { SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS } from "@/domain/share/shareCommentLimits";
import { sanitizeShareCommentSingleLine } from "@/domain/share/sanitizeShareCommentSingleLine";

export const SHARE_COMMENT_NODE_LABEL_FALLBACK = "（無題）";

/** ノードラベルの 1 行表示。サーバーはスレッド作成時のスナップショット、クライアントは現在ラベルの表示に使う。改行は空白に置き換える */
export function normalizeShareCommentNodeLabel(label: string): string {
  return sanitizeShareCommentSingleLine(
    label.replace(/[\n\r]/g, " "),
    SHARE_COMMENT_NODE_LABEL_SNAPSHOT_MAX_CODE_POINTS,
    SHARE_COMMENT_NODE_LABEL_FALLBACK,
  );
}
