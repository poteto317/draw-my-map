import { SHARE_MESSAGES } from "@/domain/share/shareMessages";

/** API reason → ユーザー向け文言（プロバイダ生エラーは出さない） */
export function shareOperationFailureMessage(reason: string): string {
  if (reason === "unauthenticated") return SHARE_MESSAGES.unauthenticated;
  return SHARE_MESSAGES.operationFailed;
}
