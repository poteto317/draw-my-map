import {
  validateBranchSummaryOutput,
  validateChildCandidatesOutput,
  validateClassifyReorderOutput,
  validateDuplicatesOutput,
  validateImportanceOutput,
  validateMissingPerspectivesOutput,
} from "@/domain/aiAssist/aiAssistOutput";
import {
  AI_CHILD_CANDIDATES_MAX_NODES,
  AI_CLASSIFY_REORDER_MAX_NODES,
  AI_DUPLICATES_MAX_NODES,
  AI_IMPORTANCE_MAX_NODES,
  AI_MISSING_PERSPECTIVES_MAX_NODES,
  AI_SUMMARY_MAX_NODES,
  aiBranchRootHasParent,
  validateAiBranchInput,
  type AiBranchInput,
} from "@/domain/aiAssist/aiBranchInput";
import { isValidMapId } from "@/domain/mapLibrary/mapIndex";
import { hasOnlyKeys, isPlainRecord } from "@/domain/shared/unknownRecord";
import type { Node } from "@/types/node";
import {
  AI_ASSIST_SYSTEM_PROMPT,
  BRANCH_SUMMARY_SCHEMA,
  CHILD_CANDIDATES_SCHEMA,
  CLASSIFY_REORDER_SCHEMA,
  DUPLICATES_SCHEMA,
  IMPORTANCE_SCHEMA,
  MISSING_PERSPECTIVES_SCHEMA,
  buildBranchSummaryUserMessage,
  buildChildCandidatesUserMessage,
  buildClassifyReorderUserMessage,
  buildDuplicatesUserMessage,
  buildImportanceUserMessage,
  buildMissingPerspectivesUserMessage,
} from "@/server/aiAssist/aiAssistPrompt";
import type { AiTextRequest } from "@/server/aiAssist/aiTextGenerator";

// 出力の見積もり（設計 §4.5）: 本文 ＋ effort: low の思考（推論）の余裕
export const AI_SUMMARY_MAX_OUTPUT_TOKENS = 4000;
export const AI_IMPORTANCE_MAX_OUTPUT_TOKENS = 12000;
export const AI_CHILD_CANDIDATES_MAX_OUTPUT_TOKENS = 8000;
export const AI_MISSING_PERSPECTIVES_MAX_OUTPUT_TOKENS = 8000;
export const AI_CLASSIFY_REORDER_MAX_OUTPUT_TOKENS = 12000;
export const AI_DUPLICATES_MAX_OUTPUT_TOKENS = 12000;

const SUMMARY_BODY_KEYS: ReadonlySet<string> = new Set(["branch"]);
const IMPORTANCE_BODY_KEYS: ReadonlySet<string> = new Set(["branch", "targetIds"]);
const STRUCTURE_BRANCH_BODY_KEYS: ReadonlySet<string> = new Set(["branch"]);
const DUPLICATES_BODY_KEYS: ReadonlySet<string> = new Set(["branch", "mapId"]);

export type BranchSummaryBody = { branch: AiBranchInput };
export type ImportanceBody = { branch: AiBranchInput; targetIds: number[] };
export type StructureBranchBody = { branch: AiBranchInput };
export type DuplicatesBody = { branch: AiBranchInput; mapId: string };

// 課題ごとの定義。共通の処理（handleAiAssistRequest）が受け取る
export type AiAssistTask<Body> = {
  parseBody(value: unknown): Body | null;
  buildRequest(body: Body): Omit<AiTextRequest, "signal">;
  validateOutput(value: unknown, body: Body): Record<string, unknown> | null;
};

function branchIdsOf(branch: AiBranchInput): ReadonlySet<number> {
  return new Set(branch.nodes.map((node) => node.id));
}

// 統合・付け替え検証用。座標は planNodeMerge の親子判定だけに足りる最小形
function nodesFromBranch(branch: AiBranchInput): Node[] {
  return branch.nodes.map((item, index) => ({
    id: item.id,
    parentId: item.parentId,
    x: 0,
    y: index * 80,
    width: 100,
    height: 60,
    label: item.label,
    importance: item.importance,
    ...(item.note === undefined ? {} : { note: item.note }),
    ...(item.locked === true ? { locked: true as const } : {}),
  }));
}

function parseStructureBranchBody(value: unknown, maxNodes: number, minNodes = 1): StructureBranchBody | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, STRUCTURE_BRANCH_BODY_KEYS)) return null;
  const branch = validateAiBranchInput(value.branch, { maxNodes });
  if (!branch.ok || branch.input.nodes.length < minNodes) return null;
  return { branch: branch.input };
}

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

export const CHILD_CANDIDATES_TASK: AiAssistTask<StructureBranchBody> = {
  parseBody(value) {
    return parseStructureBranchBody(value, AI_CHILD_CANDIDATES_MAX_NODES);
  },
  buildRequest(body) {
    return {
      system: AI_ASSIST_SYSTEM_PROMPT,
      user: buildChildCandidatesUserMessage(body.branch),
      schemaName: "child_candidates",
      schema: CHILD_CANDIDATES_SCHEMA,
      maxOutputTokens: AI_CHILD_CANDIDATES_MAX_OUTPUT_TOKENS,
    };
  },
  validateOutput(value) {
    const result = validateChildCandidatesOutput(value);
    return result.ok ? { candidates: result.candidates } : null;
  },
};

export const MISSING_PERSPECTIVES_TASK: AiAssistTask<StructureBranchBody> = {
  parseBody(value) {
    return parseStructureBranchBody(value, AI_MISSING_PERSPECTIVES_MAX_NODES);
  },
  buildRequest(body) {
    return {
      system: AI_ASSIST_SYSTEM_PROMPT,
      user: buildMissingPerspectivesUserMessage(body.branch),
      schemaName: "missing_perspectives",
      schema: MISSING_PERSPECTIVES_SCHEMA,
      maxOutputTokens: AI_MISSING_PERSPECTIVES_MAX_OUTPUT_TOKENS,
    };
  },
  validateOutput(value, body) {
    const result = validateMissingPerspectivesOutput(value, aiBranchRootHasParent(body.branch));
    return result.ok ? { items: result.items } : null;
  },
};

export const CLASSIFY_REORDER_TASK: AiAssistTask<StructureBranchBody> = {
  parseBody(value) {
    return parseStructureBranchBody(value, AI_CLASSIFY_REORDER_MAX_NODES, 2);
  },
  buildRequest(body) {
    return {
      system: AI_ASSIST_SYSTEM_PROMPT,
      user: buildClassifyReorderUserMessage(body.branch),
      schemaName: "classify_reorder",
      schema: CLASSIFY_REORDER_SCHEMA,
      maxOutputTokens: AI_CLASSIFY_REORDER_MAX_OUTPUT_TOKENS,
    };
  },
  validateOutput(value, body) {
    const branchIds = branchIdsOf(body.branch);
    const result = validateClassifyReorderOutput(value, branchIds, nodesFromBranch(body.branch));
    return result.ok ? { moves: result.moves } : null;
  },
};

export const DUPLICATES_TASK: AiAssistTask<DuplicatesBody> = {
  parseBody(value) {
    if (!isPlainRecord(value) || !hasOnlyKeys(value, DUPLICATES_BODY_KEYS)) return null;
    const branch = validateAiBranchInput(value.branch, { maxNodes: AI_DUPLICATES_MAX_NODES });
    if (!branch.ok || branch.input.nodes.length < 2) return null;
    if (!isValidMapId(value.mapId)) return null;
    return { branch: branch.input, mapId: value.mapId };
  },
  buildRequest(body) {
    return {
      system: AI_ASSIST_SYSTEM_PROMPT,
      user: buildDuplicatesUserMessage(body.branch),
      schemaName: "duplicate_pairs",
      schema: DUPLICATES_SCHEMA,
      maxOutputTokens: AI_DUPLICATES_MAX_OUTPUT_TOKENS,
    };
  },
  validateOutput(value, body) {
    const branchIds = branchIdsOf(body.branch);
    const nodes = nodesFromBranch(body.branch);
    const result = validateDuplicatesOutput(value, branchIds, {
      nodes,
      visibleNodeIds: branchIds,
      currentMapId: body.mapId,
    });
    return result.ok ? { pairs: result.pairs } : null;
  },
};
