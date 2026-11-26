import { NODE_TAG_INPUT_MAX_LENGTH, normalizeNodeTagName, nodeTagKey } from "@/domain/nodes/nodeTag";
import type { Node, NodeCustomAttribute, NodeTask } from "@/types/node";

export const MAX_CUSTOM_ATTRIBUTES = 10;
export const MAX_CUSTOM_OPTIONS = 10;
export type AttributeFailure = "invalid" | "too-long" | "empty" | "duplicate" | "too-many" | "not-an-option";
export type AttributeResult<T> = { ok: true; value: T } | { ok: false; reason: AttributeFailure };

function failure(reason: AttributeFailure = "invalid"): AttributeResult<never> {
  return { ok: false, reason };
}

function success<T>(value: T): AttributeResult<T> {
  return { ok: true, value };
}

function nameOf(value: unknown): AttributeResult<string> {
  if (typeof value !== "string") return failure();
  if (value.length > NODE_TAG_INPUT_MAX_LENGTH) return failure("too-long");
  const normalized = normalizeNodeTagName(value);
  return normalized.ok ? success(normalized.name) : normalized;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnly(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function normalizeNodeTask(raw: unknown): AttributeResult<NodeTask> {
  if (!record(raw) || !hasOnly(raw, ["completed", "dueDate", "assignee"]) || typeof raw.completed !== "boolean") return failure();
  const { completed, dueDate } = raw;
  if (dueDate !== undefined && !isDate(dueDate)) return failure();
  const base = { completed, ...(dueDate === undefined ? {} : { dueDate }) };
  if (raw.assignee === undefined) return success(base);
  const assignee = nameOf(raw.assignee);
  if (!assignee.ok) return assignee.reason === "empty" ? success(base) : assignee;
  return success({ ...base, assignee: assignee.value });
}

export function parseCustomNumber(input: string): AttributeResult<number> {
  const text = input.trim();
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:e[+-]?\d+)?$/i.exec(text);
  if (!match) return failure();
  const value = Number(text);
  if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(match[1]))) return failure();
  return success(value === 0 ? 0 : value);
}

function normalizeAttribute(raw: unknown): AttributeResult<NodeCustomAttribute> {
  if (!record(raw)) return failure();
  const name = nameOf(raw.name);
  if (!name.ok) return name;
  const { type, value } = raw;
  if (type === "number" && hasOnly(raw, ["name", "type", "value"]) && typeof value === "number" && Number.isFinite(value)) {
    return success({ name: name.value, type, value: value === 0 ? 0 : value });
  }
  if (type === "date" && hasOnly(raw, ["name", "type", "value"]) && isDate(value)) {
    return success({ name: name.value, type, value });
  }
  if (type !== "choice" || !hasOnly(raw, ["name", "type", "value", "options"]) || !Array.isArray(raw.options) || raw.options.length === 0) return failure();
  if (raw.options.length > MAX_CUSTOM_OPTIONS) return failure("too-many");
  const options: string[] = [];
  const keys = new Set<string>();
  for (const item of raw.options) {
    const option = nameOf(item);
    if (!option.ok) return option;
    const key = nodeTagKey(option.value);
    if (keys.has(key)) return failure("duplicate");
    keys.add(key);
    options.push(option.value);
  }
  const selected = nameOf(value);
  if (!selected.ok) return selected;
  if (!options.includes(selected.value)) return failure("not-an-option");
  return success({ name: name.value, type, value: selected.value, options });
}

export function normalizeCustomAttributes(raw: unknown): AttributeResult<Node["customAttributes"]> {
  if (raw === undefined) return success(undefined);
  if (!Array.isArray(raw)) return failure();
  if (raw.length > MAX_CUSTOM_ATTRIBUTES) return failure("too-many");
  const attributes: NodeCustomAttribute[] = [];
  const keys = new Set<string>();
  for (const item of raw) {
    const normalized = normalizeAttribute(item);
    if (!normalized.ok) return normalized;
    const key = nodeTagKey(normalized.value.name);
    if (keys.has(key)) return failure("duplicate");
    keys.add(key);
    attributes.push(normalized.value);
  }
  return success(attributes.length === 0 ? undefined : attributes);
}

export function areNodeTasksEqual(a: Node["task"], b: Node["task"]): boolean {
  return a === b || (!!a && !!b && a.completed === b.completed && a.dueDate === b.dueDate && a.assignee === b.assignee);
}

export function areCustomAttributeValuesEqual(a: NodeCustomAttribute, b: NodeCustomAttribute): boolean {
  return a === b || (a.name === b.name && a.type === b.type && a.value === b.value
    && (a.type !== "choice" || (b.type === "choice" && a.options.length === b.options.length
      && a.options.every((option, index) => option === b.options[index]))));
}

export function areCustomAttributesEqual(a: Node["customAttributes"], b: Node["customAttributes"]): boolean {
  return a === b || (!!a && !!b && a.length === b.length && a.every((value, index) => areCustomAttributeValuesEqual(value, b[index])));
}

export function projectNodeTaskAttributes({ task, customAttributes }: Pick<Node, "task" | "customAttributes">) {
  return {
    ...(task === undefined ? {} : { task }),
    ...(customAttributes?.length ? { customAttributes } : {}),
  };
}

export function withNodeTask(node: Node, value: Node["task"]): Node {
  if (areNodeTasksEqual(node.task, value)) return node;
  const next = { ...node };
  delete next.task;
  return { ...next, ...projectNodeTaskAttributes({ task: value }) };
}

export function withCustomAttributes(node: Node, value: Node["customAttributes"]): Node {
  const normalized = value?.length ? value : undefined;
  if (areCustomAttributesEqual(node.customAttributes, normalized)) return node;
  const next = { ...node };
  delete next.customAttributes;
  return { ...next, ...projectNodeTaskAttributes({ customAttributes: normalized }) };
}
