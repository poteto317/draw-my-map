import type { ShareResult } from "@/domain/share/shareResult";

/** Phase 37 のリンク権限は view のみ。それ以外は拒否 */
export function assertViewPermission(permission: string): ShareResult<void> {
  if (permission !== "view") {
    return { ok: false, reason: "invalid-permission" };
  }
  return { ok: true, value: undefined };
}
