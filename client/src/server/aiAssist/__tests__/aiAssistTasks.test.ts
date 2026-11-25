/** @jest-environment node */
import { BRANCH_SUMMARY_TASK, IMPORTANCE_TASK } from "@/server/aiAssist/aiAssistTasks";
import { BRANCH_SUMMARY_SCHEMA, IMPORTANCE_SCHEMA } from "@/server/aiAssist/aiAssistPrompt";
import type { AiBranchInput } from "@/domain/aiAssist/aiBranchInput";

const branch: AiBranchInput = {
  rootId: 1,
  nodes: [
    { id: 1, parentId: null, label: "根", importance: "high" },
    { id: 2, parentId: 1, label: "子", importance: "low" },
  ],
};

describe("BRANCH_SUMMARY_TASK", () => {
  it("正しい本文を読み、スキーマと上限 4000 のリクエストを作る", () => {
    const body = BRANCH_SUMMARY_TASK.parseBody({ branch });
    expect(body).toEqual({ branch });
    const request = BRANCH_SUMMARY_TASK.buildRequest(body!);
    expect(request).toMatchObject({ schemaName: "branch_summary", schema: BRANCH_SUMMARY_SCHEMA, maxOutputTokens: 4000 });
  });

  it.each<[string, unknown]>([
    ["子孫が 0 件", { branch: { rootId: 1, nodes: [branch.nodes[0]] } }],
    ["余分な項目", { branch, targetIds: [1] }],
    ["枝が不正", { branch: { rootId: 2, nodes: branch.nodes } }],
    ["オブジェクトでない", "x"],
  ])("%s は null", (_name, value) => {
    expect(BRANCH_SUMMARY_TASK.parseBody(value)).toBeNull();
  });

  it("枝は 200 ノードちょうどまで通り、201 ノードは null", () => {
    const flat = (count: number) => ({
      rootId: 1,
      nodes: Array.from({ length: count }, (_, i) => ({ id: i + 1, parentId: i === 0 ? null : 1, label: `n${i}`, importance: "low" })),
    });
    expect(BRANCH_SUMMARY_TASK.parseBody({ branch: flat(200) })).not.toBeNull();
    expect(BRANCH_SUMMARY_TASK.parseBody({ branch: flat(201) })).toBeNull();
  });

  it("ラベル 200・メモ 500・合計 40,000 文字ちょうどの枝は通る", () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ({
      id: i + 1, parentId: i === 0 ? null : 1, label: "あ".repeat(i === 1 ? 0 : 200), importance: "low",
      ...(i === 1 ? { note: "い".repeat(200) } : {}),
    }));
    // 199 件 × 200 + ラベル 0 + メモ 200 = 40,000
    expect(BRANCH_SUMMARY_TASK.parseBody({ branch: { rootId: 1, nodes } })).not.toBeNull();
    const withLongNote = nodes.map((node) => (node.id === 3 ? { ...node, note: "う".repeat(500) } : node));
    expect(BRANCH_SUMMARY_TASK.parseBody({ branch: { rootId: 1, nodes: withLongNote } })).toBeNull(); // 40,500 文字
  });

  it("出力を検証して { summary } だけを返す", () => {
    const body = { branch };
    expect(BRANCH_SUMMARY_TASK.validateOutput({ summary: " 要約 " }, body)).toEqual({ summary: "要約" });
    expect(BRANCH_SUMMARY_TASK.validateOutput({ summary: "" }, body)).toBeNull();
  });
});

describe("IMPORTANCE_TASK", () => {
  it("正しい本文を読み、スキーマと上限 12000 のリクエストを作る", () => {
    const body = IMPORTANCE_TASK.parseBody({ branch, targetIds: [2] });
    expect(body).toEqual({ branch, targetIds: [2] });
    expect(IMPORTANCE_TASK.buildRequest(body!)).toMatchObject({ schemaName: "importance_suggestions", schema: IMPORTANCE_SCHEMA, maxOutputTokens: 12000 });
  });

  it.each<[string, unknown]>([
    ["targetIds が空", { branch, targetIds: [] }],
    ["targetIds の重複", { branch, targetIds: [2, 2] }],
    ["targetIds が枝の外", { branch, targetIds: [9] }],
    ["targetIds が整数でない", { branch, targetIds: [1.5] }],
    ["targetIds が無い", { branch }],
    ["枝が 101 ノード", { branch: { rootId: 1, nodes: Array.from({ length: 101 }, (_, i) => ({ id: i + 1, parentId: i === 0 ? null : 1, label: `n${i}`, importance: "low" })) }, targetIds: [1] }],
  ])("%s は null", (_name, value) => {
    expect(IMPORTANCE_TASK.parseBody(value)).toBeNull();
  });

  it("出力を targetIds で検証して { suggestions } を返す", () => {
    const body = { branch, targetIds: [2] };
    expect(IMPORTANCE_TASK.validateOutput({ suggestions: [{ id: 2, importance: "high", reason: "主要" }] }, body))
      .toEqual({ suggestions: [{ id: 2, importance: "high", reason: "主要" }] });
    expect(IMPORTANCE_TASK.validateOutput({ suggestions: [{ id: 1, importance: "high", reason: "" }] }, body)).toBeNull();
  });
});
