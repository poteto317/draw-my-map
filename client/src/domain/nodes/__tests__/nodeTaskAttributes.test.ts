import {
  MAX_CUSTOM_OPTIONS,
  normalizeNodeTask,
  normalizeCustomAttributes,
  parseCustomNumber,
} from "../nodeTaskAttributes";

test("validates Gregorian dates and task shape", () => {
  expect(normalizeNodeTask({ completed: false, dueDate: "2000-02-29" }).ok).toBe(true);
  expect(normalizeNodeTask({ completed: true, dueDate: "1900-02-29" }).ok).toBe(false);
});
test.each(["", "1e-9999", "0x10", "Infinity", "1x"])("rejects numeric input %s", (value) => {
  expect(parseCustomNumber(value).ok).toBe(false);
});
test.each([["-0", 0], [".5", 0.5], ["1e2", 100], ["-1", -1]] as const)("accepts numeric input %s", (input, value) => {
  expect(parseCustomNumber(input)).toEqual({ ok: true, value });
});
test("rejects duplicate attribute names after normalization", () => {
  expect(normalizeCustomAttributes([
    { name: "Ａ", type: "number", value: 0 },
    { name: "a", type: "number", value: 1 },
  ]).ok).toBe(false);
});

test("担当者の生入力と正規化後のUTF-16上限を適用する", () => {
  expect(normalizeNodeTask({ completed: false, assignee: " ".repeat(255) + "A" })).toEqual({
    ok: true, value: { completed: false, assignee: "A" },
  });
  expect(normalizeNodeTask({ completed: false, assignee: " ".repeat(256) + "A" }).ok).toBe(false);
  expect(normalizeNodeTask({ completed: false, assignee: "😀".repeat(15) }).ok).toBe(true);
  expect(normalizeNodeTask({ completed: false, assignee: "😀".repeat(16) }).ok).toBe(false);
});

test("非有限な保存値と11件の属性を拒否する", () => {
  expect(normalizeCustomAttributes([{ name: "件数", type: "number", value: NaN }]).ok).toBe(false);
  expect(normalizeCustomAttributes(Array.from({ length: 11 }, (_, index) => ({
    name: `件数${index}`, type: "number", value: index,
  })))).toEqual({ ok: false, reason: "too-many" });
});

test("選択肢型で11件の候補を拒否する", () => {
  const options = Array.from({ length: MAX_CUSTOM_OPTIONS + 1 }, (_, index) => `候補${index}`);
  expect(normalizeCustomAttributes([
    { name: "区分", type: "choice", options, value: "候補0" },
  ])).toEqual({ ok: false, reason: "too-many-options" });
});
