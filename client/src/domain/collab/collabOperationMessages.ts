import { COLLAB_MESSAGES } from "@/domain/collab/collabMessages";

/** API reason → ユーザー向け文言（ticket/token 平文は出さない） */
export function collabOperationFailureMessage(reason: string): string {
  switch (reason) {
    case "unauthenticated":
      return COLLAB_MESSAGES.startUnauthenticated;
    case "no-active-session":
      return "アクティブな共同編集セッションがありません。";
    case "not-found":
      return "共同編集セッションが見つかりません。";
    case "rate-limited":
      return "操作が多すぎます。しばらくしてから再試行してください。";
    case "too-many-connections":
      return "同時接続の上限に達しています。";
    case "id-collision":
      return "ローカルのノード ID が衝突しています。整理してから開始してください。";
    case "invalid-document":
      return "マップ文書が不正なため共同編集を開始できません。";
    case "seed-failed":
      return "共同編集ルームの準備に失敗しました。";
    case "export-failed":
    case "export-empty":
      return "共同編集の結果を取得できませんでした。セッションは継続中です。";
    case "connection-error":
      return "共同編集の接続に失敗しました。";
    case "dropped-grace":
      return COLLAB_MESSAGES.droppedGrace;
    default:
      return "共同編集の操作に失敗しました。";
  }
}
