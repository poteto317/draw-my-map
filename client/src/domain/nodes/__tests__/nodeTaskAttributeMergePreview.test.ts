import type { NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { planNodeMerge } from "@/domain/nodes/nodeMerge";
import { describeMergeTaskAttributes } from "@/domain/nodes/nodeTaskAttributeMergePreview";
import { createTestNode } from "@/testing/createTestNode";

describe("describeMergeTaskAttributes", () => {
  const nodes = [
    createTestNode({ id: 1, label: "親" }),
    createTestNode({
      id: 2,
      parentId: 1,
      label: "リンゴ",
      task: { completed: true, dueDate: "2026-11-26", assignee: "担当" },
      customAttributes: [{ name: "種別", type: "choice", options: ["A"], value: "A" }],
    }),
    createTestNode({
      id: 3,
      parentId: 1,
      label: "りんご",
      task: { completed: false },
      customAttributes: [{ name: "種別", type: "choice", options: ["B"], value: "B" }],
    }),
  ];

  it("タスクとカスタム属性の統合概要を返す", () => {
    const plan = planNodeMerge(nodes, [2, 3], 2, " ", new Set(nodes.map((n) => n.id)), "map-current");
    if (!plan.ok) throw new Error("plan failed");
    const labelById = new Map(nodes.map((node) => [node.id, node.label]));
    expect(describeMergeTaskAttributes(plan, labelById)).toEqual({
      taskText: "『リンゴ』のタスク、完了、期限 2026-11-26、担当者 担当、他の 1 件を破棄",
      customAttributeText: "1 件を保持、同名 1 件を破棄（種別）",
    });
  });

  it("同名属性の破棄件数と括弧内の名前件数が一致する", () => {
    const plan = {
      ok: true,
      taskAttributes: {
        task: undefined,
        taskSourceId: null,
        discardedTaskCount: 0,
        customAttributes: [{ name: "種別", type: "number", value: 1 }],
        duplicateAttributeCount: 0,
        discardedAttributeNames: ["種別", "優先度"],
        sources: [],
      },
    } as unknown as Extract<NodeMergePlan, { ok: true }>;
    expect(describeMergeTaskAttributes(plan, new Map()).customAttributeText).toBe(
      "1 件を保持、同名 2 件を破棄（種別、優先度）",
    );
  });

  it("同名の重複破棄は種類数と計件数を分けて示す", () => {
    const plan = {
      ok: true,
      taskAttributes: {
        task: undefined,
        taskSourceId: null,
        discardedTaskCount: 0,
        customAttributes: [{ name: "種別", type: "number", value: 1 }],
        duplicateAttributeCount: 0,
        discardedAttributeNames: ["種別", "種別"],
        sources: [],
      },
    } as unknown as Extract<NodeMergePlan, { ok: true }>;
    expect(describeMergeTaskAttributes(plan, new Map()).customAttributeText).toBe(
      "1 件を保持、同名 1 種類（計 2 件）を破棄（種別）",
    );
  });
});