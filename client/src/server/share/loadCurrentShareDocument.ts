import { createHash } from "node:crypto";
import type { ShareResult } from "@/domain/share/shareResult";
import type { SharedMapRecord, ShareStore } from "@/server/share/shareStore";

/**
 * マップの現在のリビジョンの文書を R2 から読む。
 * 未公開・リビジョン無し・R2 に無しは not-found、sha256 不一致と例外は storage-error。
 */
export async function loadCurrentShareDocument(
  store: ShareStore,
  map: SharedMapRecord,
): Promise<ShareResult<{ documentJson: string }>> {
  if (map.currentRevisionId === null) {
    return { ok: false, reason: "not-found" };
  }
  try {
    const revision = await store.getRevision(map.currentRevisionId);
    if (!revision) return { ok: false, reason: "not-found" };
    const bytes = await store.getDocument(revision.r2Key);
    if (!bytes) return { ok: false, reason: "not-found" };
    // publish 時に保存した contentSha256 があれば取得バイト列と照合（改ざん・破損・取り違え）
    if (
      typeof revision.contentSha256 === "string" &&
      revision.contentSha256.length > 0
    ) {
      const actualSha256 = createHash("sha256").update(bytes).digest("hex");
      if (actualSha256 !== revision.contentSha256) {
        return { ok: false, reason: "storage-error" };
      }
    }
    return {
      ok: true,
      value: { documentJson: new TextDecoder().decode(bytes) },
    };
  } catch {
    return { ok: false, reason: "storage-error" };
  }
}
