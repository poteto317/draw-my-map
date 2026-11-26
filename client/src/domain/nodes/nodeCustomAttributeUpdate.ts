import {
  areCustomAttributeValuesEqual,
  MAX_CUSTOM_ATTRIBUTES,
  normalizeCustomAttributes,
  parseCustomNumber,
  type AttributeFailure,
  type AttributeResult,
} from "@/domain/nodes/nodeTaskAttributes";
import { nodeTagKey, normalizeNodeTagName, NODE_TAG_INPUT_MAX_LENGTH } from "@/domain/nodes/nodeTag";
import type { Node, NodeCustomAttribute } from "@/types/node";

function failure(reason: AttributeFailure = "invalid"): AttributeResult<never> {
  return { ok: false, reason };
}

export function formatCustomAttributeFailure(reason: AttributeFailure): string {
  switch (reason) {
    case "too-long":
      return `名前が長すぎます（${NODE_TAG_INPUT_MAX_LENGTH} 文字まで）。`;
    case "empty":
      return "名前を入力してください。";
    case "duplicate":
      return "同じ名前のカスタム属性がすでにあります。";
    case "too-many":
      return `カスタム属性は 1 つのノードに ${MAX_CUSTOM_ATTRIBUTES} 件までです。`;
    case "not-an-option":
      return "選択値が候補と一致しません。候補を確認して選び直してください。";
    default:
      return "カスタム属性の内容を確認してください。";
  }
}

export function parseChoiceOptions(input: string): AttributeResult<readonly string[]> {
  let text = input;
  if (text.endsWith("\n") && !text.endsWith("\n\n")) {
    text = text.slice(0, -1);
  }
  if (text === "" || text.endsWith("\n\n") || text.includes("\n\n")) return failure("empty");
  const options: string[] = [];
  const keys = new Set<string>();
  for (const line of text.split("\n")) {
    if (line.length > NODE_TAG_INPUT_MAX_LENGTH) return failure("too-long");
    const normalized = normalizeNodeTagName(line);
    if (!normalized.ok) return failure(normalized.reason === "empty" ? "empty" : "invalid");
    const key = nodeTagKey(normalized.name);
    if (keys.has(key)) return failure("duplicate");
    keys.add(key);
    options.push(normalized.name);
  }
  if (options.length === 0) return failure("empty");
  return { ok: true, value: options };
}

export function findCustomAttributeIndex(
  attributes: readonly NodeCustomAttribute[] | undefined,
  editKey: string,
): number {
  if (!attributes) return -1;
  return attributes.findIndex((attribute) => nodeTagKey(attribute.name) === editKey);
}

function findMatchingIndex(
  attributes: readonly NodeCustomAttribute[],
  editKey: string,
  original: NodeCustomAttribute,
): number {
  const index = findCustomAttributeIndex(attributes, editKey);
  if (index === -1) return -1;
  return areCustomAttributeValuesEqual(attributes[index], original) ? index : -1;
}

function hasDuplicateName(
  attributes: readonly NodeCustomAttribute[],
  name: string,
  exceptKey: string | null,
): boolean {
  const key = nodeTagKey(name);
  return attributes.some((attribute) => {
    const attributeKey = nodeTagKey(attribute.name);
    if (exceptKey !== null && attributeKey === exceptKey) return false;
    return attributeKey === key;
  });
}

function normalizeSingle(next: NodeCustomAttribute): AttributeResult<NodeCustomAttribute> {
  const result = normalizeCustomAttributes([next]);
  if (!result.ok) return result;
  return result.value?.[0] ? { ok: true, value: result.value[0] } : failure();
}

export type CustomAttributeFormDraft = {
  type: NodeCustomAttribute["type"];
  name: string;
  numberValue: string;
  dateValue: string;
  choiceOptions: string;
  choiceValue: string;
};

export function buildCustomAttributeFromDraft(draft: CustomAttributeFormDraft):
  { ok: true; value: NodeCustomAttribute } | { ok: false; reason: string } {
  if (draft.type === "number") {
    const parsed = parseCustomNumber(draft.numberValue);
    if (!parsed.ok) return { ok: false, reason: formatCustomAttributeFailure(parsed.reason) };
    return { ok: true, value: { name: draft.name, type: "number", value: parsed.value } };
  }
  if (draft.type === "date") {
    if (draft.dateValue.trim() === "") return { ok: false, reason: "日付を入力してください。" };
    return { ok: true, value: { name: draft.name, type: "date", value: draft.dateValue } };
  }
  const options = parseChoiceOptions(draft.choiceOptions);
  if (!options.ok) return { ok: false, reason: formatCustomAttributeFailure(options.reason) };
  if (!draft.choiceValue) return { ok: false, reason: "値を選択してください。" };
  if (!options.value.includes(draft.choiceValue)) {
    return { ok: false, reason: formatCustomAttributeFailure("not-an-option") };
  }
  return {
    ok: true,
    value: { name: draft.name, type: "choice", options: [...options.value], value: draft.choiceValue },
  };
}

export function computeNextCustomAttributes(
  current: Node["customAttributes"],
  editKey: string | null,
  original: NodeCustomAttribute | null,
  next: NodeCustomAttribute | null,
): AttributeResult<Node["customAttributes"]> {
  const list = current ? [...current] : [];

  if (original === null && next !== null) {
    const normalized = normalizeSingle(next);
    if (!normalized.ok) return normalized;
    if (list.length >= MAX_CUSTOM_ATTRIBUTES) return failure("too-many");
    if (hasDuplicateName(list, normalized.value.name, null)) return failure("duplicate");
    return { ok: true, value: [...list, normalized.value] };
  }

  if (original !== null && next === null) {
    if (editKey === null) return failure();
    const index = findMatchingIndex(list, editKey, original);
    if (index === -1) return failure();
    list.splice(index, 1);
    return { ok: true, value: list.length === 0 ? undefined : list };
  }

  if (original !== null && next !== null) {
    if (editKey === null) return failure();
    const normalized = normalizeSingle(next);
    if (!normalized.ok) return normalized;
    const index = findMatchingIndex(list, editKey, original);
    if (index === -1) return failure();
    const nextKey = nodeTagKey(normalized.value.name);
    if (hasDuplicateName(list, normalized.value.name, editKey)) return failure("duplicate");
    list[index] = normalized.value;
    if (editKey !== nextKey && findCustomAttributeIndex(list, editKey) !== -1) return failure("duplicate");
    return { ok: true, value: list.length === 0 ? undefined : list };
  }

  return failure();
}