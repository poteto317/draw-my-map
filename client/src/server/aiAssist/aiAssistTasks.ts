import { validateBranchSummaryOutput, validateImportanceOutput } from "@/domain/aiAssist/aiAssistOutput";
import {
  AI_IMPORTANCE_MAX_NODES,
  AI_SUMMARY_MAX_NODES,
  validateAiBranchInput,
  type AiBranchInput,
} from "@/domain/aiAssist/aiBranchInput";
import { hasOnlyKeys, isPlainRecord } from "@/domain/shared/unknownRecord";
import {
  AI_ASSIST_SYSTEM_PROMPT,
  BRANCH_SUMMARY_SCHEMA,
  IMPORTANCE_SCHEMA,
  buildBranchSummaryUserMessage,
  buildImportanceUserMessage,
} from "@/server/aiAssist/aiAssistPrompt";
import type { AiTextRequest } from "@/server/aiAssist/aiTextGenerator";

// 出力の見積もり（設計 §4.5）: 本文 ＋ effort: low の思考（推論）の余裕
export const AI_SUMMARY_MAX_OUTPUT_TOKENS = 4000;
export const AI_IMPORTANCE_MAX_OUTPUT_TOKENS = 12000;

const SUMMARY_BODY_KEYS: ReadonlySet<string> = new Set(["branch"]);
const IMPORTANCE_BODY_KEYS: ReadonlySet<string> = new Set(["branch", "targetIds"]);

export type BranchSummaryBody = { branch: AiBranchInput };
export type ImportanceBody = { branch: AiBranchInput; targetIds: number[] };

// 課題ごとの定義。共通の処理（handleAiAssistRequest）が受け取る
export type AiAssistTask<Body> = {
  parseBody(value: unknown): Body | null;
  buildRequest(body: Body): Omit<AiTextRequest, "signal">;
  validateOutput(value: unknown, body: Body): Record<string, unknown> | null;
};

export const BRANCH_SUMMARY_TASK: AiAssistTask<BranchSummaryBody> = {
  parseBody(value) {
    if (!isPlainRecord(value) || !hasOnlyKeys(value, SUMMARY_BODY_KEYS)) return null;
    const branch = validateAiBranchInput(value.branch, { maxNodes: AI_SUMMARY_MAX_NODES });
    // 子孫が 0 件では要約できない
    if (!branch.ok || branch.input.nodes.length < 2) return null;
    return { branch: branch.input };
  },
  buildRequest(body) {
    return {
      system: AI_ASSIST_SYSTEM_PROMPT,
      user: buildBranchSummaryUserMessage(body.branch),
      schemaName: "branch_summary",
      schema: BRANCH_SUMMARY_SCHEMA,
      maxOutputTokens: AI_SUMMARY_MAX_OUTPUT_TOKENS,
    };
  },
  validateOutput(value) {
    const result = validateBranchSummaryOutput(value);
    return result.ok ? { summary: result.summary } : null;
  },
};

function readTargetIds(value: unknown, branch: AiBranchInput): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const branchIds = new Set(branch.nodes.map((node) => node.id));
  const ids: number[] = [];
  for (const id of value) {
    if (typeof id !== "number" || !Number.isSafeInteger(id) || !branchIds.has(id) || ids.includes(id)) return null;
    ids.push(id);
  }
  return ids;
}

export const IMPORTANCE_TASK: AiAssistTask<ImportanceBody> = {
  parseBody(value) {
    if (!isPlainRecord(value) || !hasOnlyKeys(value, IMPORTANCE_BODY_KEYS)) return null;
    // 上限は送る枝全体（ロック中のノードを含む）の件数に掛ける
    const branch = validateAiBranchInput(value.branch, { maxNodes: AI_IMPORTANCE_MAX_NODES });
    if (!branch.ok) return null;
    const targetIds = readTargetIds(value.targetIds, branch.input);
    return targetIds === null ? null : { branch: branch.input, targetIds };
  },
  buildRequest(body) {
    return {
      system: AI_ASSIST_SYSTEM_PROMPT,
      user: buildImportanceUserMessage(body.branch, body.targetIds),
      schemaName: "importance_suggestions",
      schema: IMPORTANCE_SCHEMA,
      maxOutputTokens: AI_IMPORTANCE_MAX_OUTPUT_TOKENS,
    };
  },
  validateOutput(value, body) {
    const result = validateImportanceOutput(value, body.targetIds);
    return result.ok ? { suggestions: result.suggestions } : null;
  },
};
