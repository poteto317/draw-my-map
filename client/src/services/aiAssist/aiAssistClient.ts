import {
  validateBranchSummaryOutput,
  validateChildCandidatesOutput,
  validateClassifyReorderOutput,
  validateDuplicatesOutput,
  validateImportanceOutput,
  validateMissingPerspectivesOutput,
  type AiClassifyMove,
  type ChildCandidate,
  type DuplicatePair,
  type ImportanceSuggestion,
  type MissingPerspectiveItem,
} from "@/domain/aiAssist/aiAssistOutput";
import type { AiBranchInput } from "@/domain/aiAssist/aiBranchInput";
import { collectSubtreeIds } from "@/domain/nodes/nodeTree";
import type { Node } from "@/types/node";
import { readProperty } from "@/domain/shared/unknownRecord";

// サーバーの 120 秒より長くし、サーバーの timeout の応答を先に受け取れるようにする
export const AI_ASSIST_CLIENT_TIMEOUT_MS = 150_000;

export type AiAssistClientErrorKind =
  | "not-configured" | "auth-failed" | "rate-limited" | "timeout" | "refused" | "invalid-output"
  | "forbidden" | "too-large" | "invalid-request" | "upstream-error" | "network";

const SERVER_ERROR_CODES: ReadonlySet<string> = new Set([
  "not-configured", "auth-failed", "rate-limited", "timeout", "refused", "invalid-output",
  "forbidden", "too-large", "invalid-request", "upstream-error",
]);

export class AiAssistRequestError extends Error {
  readonly kind: AiAssistClientErrorKind;

  constructor(kind: AiAssistClientErrorKind) {
    super(kind);
    this.name = "AiAssistRequestError";
    this.kind = kind;
  }
}

const ERROR_MESSAGES: Readonly<Record<AiAssistClientErrorKind, string>> = {
  "not-configured": "AI 支援が設定されていません。ANTHROPIC_API_KEY または OPENAI_API_KEY を設定し、提供元の指定（AI_ASSIST_PROVIDER）も確認してください（手順: docs/setup/ai-assist-setup.md）",
  "auth-failed": "AI の提供元が API キーを受け付けませんでした。キーの値と権限を確認してください。",
  "rate-limited": "AI の利用上限に達しました（短時間の送りすぎか、契約の上限の可能性があります）。時間をおいて再度お試しください。",
  timeout: "AI の応答が時間内に返りませんでした。枝を小さくするか、時間をおいて再度お試しください。",
  refused: "AI が内容を理由に応答を断りました。内容を確かめて、再度お試しください。",
  "invalid-output": "AI の応答を読み取れませんでした。もう一度お試しください。",
  // アプリの画面からの呼び出しで forbidden になるのは、ほぼ許可していないホスト名で開いたとき（Host の許可リスト）
  forbidden: "このアドレス（ホスト名）からの AI 支援の呼び出しは許可されていません。localhost で開くか、そのホスト名を AI_ASSIST_ALLOWED_HOSTS に足して開発サーバーを起動し直してください（手順: docs/setup/ai-assist-setup.md）。",
  "too-large": "枝が大きすぎるか、送る内容に問題があるため、送信できませんでした。",
  "invalid-request": "枝が大きすぎるか、送る内容に問題があるため、送信できませんでした。",
  "upstream-error": "AI の呼び出しに失敗しました。時間をおいて再度お試しください。",
  network: "通信に失敗しました。接続を確認して、再度お試しください。",
};

export function describeAiAssistError(kind: AiAssistClientErrorKind): string {
  return ERROR_MESSAGES[kind];
}

export function toAiAssistClientErrorKind(error: unknown): AiAssistClientErrorKind {
  return error instanceof AiAssistRequestError ? error.kind : "upstream-error";
}

export type AiAssistStatus =
  | { available: true; provider: "anthropic" | "openai"; providerLabel: string; model: string }
  | { available: false };

export type AiAssistRequestOptions = { signal: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number };

type JsonReply = { ok: boolean; status: number; body: unknown };

function isServerErrorCode(value: unknown): value is AiAssistClientErrorKind {
  return typeof value === "string" && SERVER_ERROR_CODES.has(value);
}

function kindFromStatus(status: number): AiAssistClientErrorKind {
  if (status === 503) return "not-configured";
  if (status === 429) return "rate-limited";
  if (status === 504) return "timeout";
  if (status === 422) return "refused";
  if (status === 403) return "forbidden";
  if (status === 413) return "too-large";
  if (status === 400) return "invalid-request";
  return "upstream-error";
}

function kindFromFailure(reply: JsonReply): AiAssistClientErrorKind {
  const code = readProperty(reply.body, "error");
  return isServerErrorCode(code) ? code : kindFromStatus(reply.status);
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

// 打ち切りは本文の読み込みまで守る（L-054）。呼び出し元の中断は AbortError のまま投げる
async function fetchJson(
  url: string,
  init: RequestInit,
  { signal, fetchImpl = fetch, timeoutMs = AI_ASSIST_CLIENT_TIMEOUT_MS }: AiAssistRequestOptions,
): Promise<JsonReply> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", forwardAbort, { once: true });
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    // text と JSON.parse で読む。response.json() は実行環境によって別の realm のオブジェクトを返し、
    // ドメインの検証（isPlainRecord のプロトタイプの確認）を通らないため
    const body = parseJson(await response.text());
    if (controller.signal.aborted) throw abortError();
    return { ok: response.ok, status: response.status, body };
  } catch {
    if (timedOut) throw new AiAssistRequestError("timeout");
    if (signal.aborted) throw abortError();
    throw new AiAssistRequestError("network");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", forwardAbort);
  }
}

function postJson(url: string, payload: unknown, options: AiAssistRequestOptions): Promise<JsonReply> {
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, options);
}

function parseStatus(body: unknown): AiAssistStatus | null {
  const available = readProperty(body, "available");
  if (available === false) return { available: false };
  if (available !== true) return null;
  const provider = readProperty(body, "provider");
  const providerLabel = readProperty(body, "providerLabel");
  const model = readProperty(body, "model");
  if (provider !== "anthropic" && provider !== "openai") return null;
  if (typeof providerLabel !== "string" || providerLabel === "" || typeof model !== "string" || model === "") return null;
  return { available: true, provider, providerLabel, model };
}

export async function fetchAiAssistStatus(options: AiAssistRequestOptions): Promise<AiAssistStatus> {
  const reply = await fetchJson("/api/ai-assist/status", { method: "GET" }, options);
  // 失敗は本文の code（無ければ状態コード）から種類を決める。403 を upstream-error にまとめない
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const status = parseStatus(reply.body);
  if (status === null) throw new AiAssistRequestError("upstream-error");
  return status;
}

// 応答の本文はサーバーと同じ関数で検証し直す
export async function requestBranchSummary(branch: AiBranchInput, options: AiAssistRequestOptions): Promise<string> {
  const reply = await postJson("/api/ai-assist/branch-summary", { branch }, options);
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const result = validateBranchSummaryOutput(reply.body);
  if (!result.ok) throw new AiAssistRequestError("invalid-output");
  return result.summary;
}

export async function requestImportanceSuggestions(
  branch: AiBranchInput,
  targetIds: readonly number[],
  options: AiAssistRequestOptions,
): Promise<ImportanceSuggestion[]> {
  const reply = await postJson("/api/ai-assist/importance", { branch, targetIds }, options);
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const result = validateImportanceOutput(reply.body, targetIds);
  if (!result.ok) throw new AiAssistRequestError("invalid-output");
  return result.suggestions;
}

export async function requestChildCandidates(
  branch: AiBranchInput,
  options: AiAssistRequestOptions,
): Promise<ChildCandidate[]> {
  const reply = await postJson("/api/ai-assist/child-candidates", { branch }, options);
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const result = validateChildCandidatesOutput(reply.body);
  if (!result.ok) throw new AiAssistRequestError("invalid-output");
  return result.candidates;
}

export async function requestMissingPerspectives(
  branch: AiBranchInput,
  rootHasParent: boolean,
  options: AiAssistRequestOptions,
): Promise<MissingPerspectiveItem[]> {
  const reply = await postJson("/api/ai-assist/missing-perspectives", { branch }, options);
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const result = validateMissingPerspectivesOutput(reply.body, rootHasParent);
  if (!result.ok) throw new AiAssistRequestError("invalid-output");
  return result.items;
}

export async function requestClassifyReorder(
  branch: AiBranchInput,
  nodes: readonly Node[],
  options: AiAssistRequestOptions,
): Promise<AiClassifyMove[]> {
  const reply = await postJson("/api/ai-assist/classify-reorder", { branch }, options);
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const branchIds = collectSubtreeIds(nodes, branch.rootId);
  const result = validateClassifyReorderOutput(reply.body, branchIds, nodes);
  if (!result.ok) throw new AiAssistRequestError("invalid-output");
  return result.moves;
}

export async function requestDuplicatePairs(
  branch: AiBranchInput,
  nodes: readonly Node[],
  visibleNodeIds: ReadonlySet<number>,
  currentMapId: string,
  options: AiAssistRequestOptions,
): Promise<DuplicatePair[]> {
  const reply = await postJson("/api/ai-assist/duplicates", { branch, mapId: currentMapId }, options);
  if (!reply.ok) throw new AiAssistRequestError(kindFromFailure(reply));
  const branchIds = collectSubtreeIds(nodes, branch.rootId);
  const result = validateDuplicatesOutput(reply.body, branchIds, { nodes, visibleNodeIds, currentMapId });
  if (!result.ok) throw new AiAssistRequestError("invalid-output");
  return result.pairs;
}

export type AiAssistApi = {
  fetchStatus: (options: AiAssistRequestOptions) => Promise<AiAssistStatus>;
  requestBranchSummary: (branch: AiBranchInput, options: AiAssistRequestOptions) => Promise<string>;
  requestImportanceSuggestions: (
    branch: AiBranchInput,
    targetIds: readonly number[],
    options: AiAssistRequestOptions,
  ) => Promise<ImportanceSuggestion[]>;
  requestChildCandidates: (branch: AiBranchInput, options: AiAssistRequestOptions) => Promise<ChildCandidate[]>;
  requestMissingPerspectives: (
    branch: AiBranchInput,
    rootHasParent: boolean,
    options: AiAssistRequestOptions,
  ) => Promise<MissingPerspectiveItem[]>;
  requestClassifyReorder: (
    branch: AiBranchInput,
    nodes: readonly Node[],
    options: AiAssistRequestOptions,
  ) => Promise<AiClassifyMove[]>;
  requestDuplicatePairs: (
    branch: AiBranchInput,
    nodes: readonly Node[],
    visibleNodeIds: ReadonlySet<number>,
    currentMapId: string,
    options: AiAssistRequestOptions,
  ) => Promise<DuplicatePair[]>;
};

export const DEFAULT_AI_ASSIST_API: AiAssistApi = {
  fetchStatus: fetchAiAssistStatus,
  requestBranchSummary,
  requestImportanceSuggestions,
  requestChildCandidates,
  requestMissingPerspectives,
  requestClassifyReorder,
  requestDuplicatePairs,
};
