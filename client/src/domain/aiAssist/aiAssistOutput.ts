import { excerptText, isNodeImportanceValue } from "@/domain/aiAssist/aiBranchInput";
import { hasOnlyKeys, hasOwn, isPlainRecord } from "@/domain/shared/unknownRecord";
import type { NodeImportance } from "@/types/nodeImportance";

export const AI_SUMMARY_MAX_LENGTH = 400;
// 重要度の理由は表示専用（保存しない）。超えたら excerptText で切る
export const AI_REASON_DISPLAY_MAX_LENGTH = 30;

const SUMMARY_KEYS: ReadonlySet<string> = new Set(["summary"]);
const IMPORTANCE_KEYS: ReadonlySet<string> = new Set(["suggestions"]);
const SUGGESTION_KEYS: ReadonlySet<string> = new Set(["id", "importance", "reason"]);

export type ImportanceSuggestion = { id: number; importance: NodeImportance; reason: string };

// C0・DEL・C1 の制御文字を除く。keepNewline なら LF だけ残す（正規表現の制御文字を避けて 1 文字ずつ見る）
function stripControlCharacters(value: string, keepNewline: boolean): string {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (isControl && !(keepNewline && code === 0x0a)) continue;
    result += character;
  }
  return result;
}

export function normalizeAiSummary(value: string): string {
  return stripControlCharacters(value, true).replace(/\n{3,}/g, "\n\n").trim();
}

// 正規化の後に空と上限を判定する（L-633）
export function validateBranchSummaryOutput(value: unknown): { ok: true; summary: string } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, SUMMARY_KEYS)) return { ok: false };
  if (typeof value.summary !== "string") return { ok: false };
  const summary = normalizeAiSummary(value.summary);
  if (summary === "" || summary.length > AI_SUMMARY_MAX_LENGTH) return { ok: false };
  return { ok: true, summary };
}

export function validateImportanceOutput(
  value: unknown,
  targetIds: readonly number[],
): { ok: true; suggestions: ImportanceSuggestion[] } | { ok: false } {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, IMPORTANCE_KEYS)) return { ok: false };
  if (!Array.isArray(value.suggestions)) return { ok: false };
  const targets = new Set(targetIds);
  const seen = new Set<number>();
  const suggestions: ImportanceSuggestion[] = [];
  for (const item of value.suggestions) {
    if (!isPlainRecord(item) || !hasOnlyKeys(item, SUGGESTION_KEYS)) return { ok: false };
    if (!hasOwn(item, "id") || !hasOwn(item, "importance") || !hasOwn(item, "reason")) return { ok: false };
    const { id, importance, reason } = item;
    if (typeof id !== "number" || !Number.isSafeInteger(id) || !targets.has(id) || seen.has(id)) return { ok: false };
    if (!isNodeImportanceValue(importance) || typeof reason !== "string") return { ok: false };
    seen.add(id);
    suggestions.push({
      id,
      importance,
      reason: excerptText(stripControlCharacters(reason, false).trim(), AI_REASON_DISPLAY_MAX_LENGTH),
    });
  }
  return { ok: true, suggestions };
}
