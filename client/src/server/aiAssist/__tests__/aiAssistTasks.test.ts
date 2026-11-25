/** @jest-environment node */
import {
  BRANCH_SUMMARY_TASK,
  CHILD_CANDIDATES_TASK,
  CLASSIFY_REORDER_TASK,
  DUPLICATES_TASK,
  IMPORTANCE_TASK,
  MISSING_PERSPECTIVES_TASK,
} from "@/server/aiAssist/aiAssistTasks";
import {
  BRANCH_SUMMARY_SCHEMA,
  CHILD_CANDIDATES_SCHEMA,
  CLASSIFY_REORDER_SCHEMA,
  DUPLICATES_SCHEMA,
  IMPORTANCE_SCHEMA,
  MISSING_PERSPECTIVES_SCHEMA,
} from "@/server/aiAssist/aiAssistPrompt";
import type { AiBranchInput } from "@/domain/aiAssist/aiBranchInput";
import { createTestNode } from "@/testing/createTestNode";

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

describe("CHILD_CANDIDATES_TASK", () => {
  it("正しい本文を読み、スキーマと上限のリクエストを作る", () => {
    const body = CHILD_CANDIDATES_TASK.parseBody({ branch });
    expect(body).toEqual({ branch });
    expect(CHILD_CANDIDATES_TASK.buildRequest(body!)).toMatchObject({
      schemaName: "child_candidates",
      schema: CHILD_CANDIDATES_SCHEMA,
      maxOutputTokens: 8000,
    });
  });

  it("枝だけの根でも通る", () => {
    expect(CHILD_CANDIDATES_TASK.parseBody({ branch: { rootId: 1, nodes: [branch.nodes[0]] } }))
      .toEqual({ branch: { rootId: 1, nodes: [branch.nodes[0]] } });
  });

  it.each<[string, unknown]>([
    ["余分な mapId", { branch, mapId: "map-a" }],
    ["枝が 81 ノード", { branch: { rootId: 1, nodes: Array.from({ length: 81 }, (_, i) => ({ id: i + 1, parentId: i === 0 ? null : 1, label: "n", importance: "low" })) } }],
  ])("%s は null", (_name, value) => {
    expect(CHILD_CANDIDATES_TASK.parseBody(value)).toBeNull();
  });

  it("出力を検証して { candidates } を返す", () => {
    expect(CHILD_CANDIDATES_TASK.validateOutput({ candidates: [{ label: "子案" }] }, { branch }))
      .toEqual({ candidates: [{ label: "子案" }] });
    expect(CHILD_CANDIDATES_TASK.validateOutput({ candidates: [] }, { branch })).toBeNull();
  });
});

describe("MISSING_PERSPECTIVES_TASK", () => {
  const forestRoot: AiBranchInput = {
    rootId: 1,
    nodes: [{ id: 1, parentId: null, label: "森の根", importance: "medium" }],
  };

  it("正しい本文を読み、スキーマと上限のリクエストを作る", () => {
    const body = MISSING_PERSPECTIVES_TASK.parseBody({ branch });
    expect(body).toEqual({ branch });
    expect(MISSING_PERSPECTIVES_TASK.buildRequest(body!)).toMatchObject({
      schemaName: "missing_perspectives",
      schema: MISSING_PERSPECTIVES_SCHEMA,
      maxOutputTokens: 8000,
    });
  });

  it("rootHasParent に応じて sibling を除外する", () => {
    const body = MISSING_PERSPECTIVES_TASK.parseBody({ branch: forestRoot })!;
    expect(MISSING_PERSPECTIVES_TASK.validateOutput({
      items: [{ label: "兄弟", placement: "sibling" }, { label: "子", placement: "child" }],
    }, body)).toEqual({ items: [{ label: "子", placement: "child" }] });
  });

  it("出力を検証して { items } を返す", () => {
    expect(MISSING_PERSPECTIVES_TASK.validateOutput({
      items: [{ label: "観点", placement: "child" }],
    }, { branch })).toEqual({ items: [{ label: "観点", placement: "child" }] });
  });
});

describe("CLASSIFY_REORDER_TASK", () => {
  it("2 ノード以上の枝だけ通る", () => {
    expect(CLASSIFY_REORDER_TASK.parseBody({ branch })).toEqual({ branch });
    expect(CLASSIFY_REORDER_TASK.parseBody({ branch: { rootId: 1, nodes: [branch.nodes[0]] } })).toBeNull();
    expect(CLASSIFY_REORDER_TASK.buildRequest({ branch })).toMatchObject({
      schemaName: "classify_reorder",
      schema: CLASSIFY_REORDER_SCHEMA,
      maxOutputTokens: 12000,
    });
  });

  it("moves を枝ノードから検証する", () => {
    const nodes = [
      createTestNode({ id: 1, label: "根" }),
      createTestNode({ id: 2, parentId: 1, label: "子A" }),
      createTestNode({ id: 3, parentId: 1, label: "子B" }),
    ];
    const input: AiBranchInput = {
      rootId: 1,
      nodes: nodes.map(({ id, parentId, label, importance, note }) => ({
        id, parentId, label, importance, ...(note === undefined ? {} : { note }),
      })),
    };
    expect(CLASSIFY_REORDER_TASK.validateOutput({
      moves: [{ type: "reorder", parentId: 1, childIds: [3, 2] }],
    }, { branch: input })).toEqual({ moves: [{ type: "reorder", parentId: 1, childIds: [3, 2] }] });
  });

  it("枝の locked を再構成してロック付き reparent を除外する", () => {
    const input: AiBranchInput = {
      rootId: 1,
      nodes: [
        { id: 1, parentId: null, label: "根", importance: "high" },
        { id: 2, parentId: 1, label: "子A", importance: "low" },
        { id: 3, parentId: 1, label: "子B", importance: "low", locked: true },
      ],
    };
    expect(CLASSIFY_REORDER_TASK.validateOutput({
      moves: [
        { type: "reparent", nodeId: 3, newParentId: 2 },
        { type: "reorder", parentId: 1, childIds: [3, 2] },
      ],
    }, { branch: input })).toBeNull();
  });
});

describe("DUPLICATES_TASK", () => {
  const trio: AiBranchInput = {
    rootId: 1,
    nodes: [
      ...branch.nodes,
      { id: 3, parentId: 1, label: "子2", importance: "medium" },
    ],
  };
  const body = { branch: trio, mapId: "map-a", visibleNodeIds: [1, 2, 3] };

  it("branch と mapId と visibleNodeIds を読む", () => {
    expect(DUPLICATES_TASK.parseBody(body)).toEqual(body);
    expect(DUPLICATES_TASK.parseBody({ branch, mapId: "bad id", visibleNodeIds: [1, 2, 3] })).toBeNull();
    expect(DUPLICATES_TASK.parseBody({ branch, mapId: "map-a" })).toBeNull();
    expect(DUPLICATES_TASK.parseBody({ branch, mapId: "map-a", visibleNodeIds: [9] })).toBeNull();
    expect(DUPLICATES_TASK.buildRequest(body)).toMatchObject({
      schemaName: "duplicate_pairs",
      schema: DUPLICATES_SCHEMA,
      maxOutputTokens: 12000,
    });
  });

  it("visibleNodeIds 前提で planNodeMerge 検証する", () => {
    expect(DUPLICATES_TASK.validateOutput({
      pairs: [{ primaryId: 2, secondaryId: 2, reason: "x" }, { primaryId: 2, secondaryId: 3, reason: "類似" }],
    }, body)).toEqual({ pairs: [{ primaryId: 2, secondaryId: 3, reason: "類似" }] });
  });

  it("非表示ノードを含む pair は除外する", () => {
    const hiddenBody = { ...body, visibleNodeIds: [1, 2] };
    expect(DUPLICATES_TASK.validateOutput({
      pairs: [{ primaryId: 2, secondaryId: 3, reason: "類似" }],
    }, hiddenBody)).toBeNull();
  });

  it("locked を含む枝入力ではロックノードを含む pair を除外する", () => {
    const lockedBody: typeof body = {
      branch: {
        rootId: 1,
        nodes: [
          { id: 1, parentId: null, label: "根", importance: "high" },
          { id: 2, parentId: 1, label: "子", importance: "low" },
          { id: 3, parentId: 1, label: "子2", importance: "medium", locked: true },
        ],
      },
      mapId: "map-a",
      visibleNodeIds: [1, 2, 3],
    };
    expect(DUPLICATES_TASK.validateOutput({
      pairs: [{ primaryId: 2, secondaryId: 3, reason: "類似" }],
    }, lockedBody)).toBeNull();
  });

  it("枝が 1 ノードだけなら null", () => {
    expect(DUPLICATES_TASK.parseBody({
      branch: { rootId: 1, nodes: [branch.nodes[0]] },
      mapId: "map-a",
      visibleNodeIds: [1],
    })).toBeNull();
  });
});
