import { formatSiblingReorderNotice } from "@/domain/nodes/nodeSiblingOrderMessages";
import type { ReorderSiblingResult } from "@/domain/nodes/nodeSiblingOrder";
import type { OperationNotice } from "@/types/operationNotice";

describe("formatSiblingReorderNotice", () => {
  it.each<[string, ReorderSiblingResult, OperationNotice]>([
    [
      "上へ移動した兄弟",
      { ok: true, direction: "up", visibleIndex: 0, visibleCount: 3, isRoot: false },
      { kind: "status", message: "枝を上へ移動しました（見えている兄弟の3件中1番目）。" },
    ],
    [
      "下へ移動したルート",
      { ok: true, direction: "down", visibleIndex: 2, visibleCount: 3, isRoot: true },
      { kind: "status", message: "枝を下へ移動しました（見えているルートの3件中3番目）。" },
    ],
    [
      "桁区切りを付けない",
      { ok: true, direction: "down", visibleIndex: 9999, visibleCount: 10000, isRoot: false },
      { kind: "status", message: "枝を下へ移動しました（見えている兄弟の10000件中10000番目）。" },
    ],
  ])("成功: %s", (_name, result, expected) => {
    expect(formatSiblingReorderNotice(result)).toEqual(expected);
  });

  it.each<[string, ReorderSiblingResult, OperationNotice]>([
    [
      "上の端・隠れた兄弟なし",
      { ok: false, reason: "at-edge", direction: "up", hiddenBeyond: false, isRoot: false },
      { kind: "status", message: "これ以上上へ移動できません（見えている兄弟の先頭です）。" },
    ],
    [
      "下の端・隠れた兄弟あり",
      { ok: false, reason: "at-edge", direction: "down", hiddenBeyond: true, isRoot: false },
      {
        kind: "status",
        message:
          "これ以上下へ移動できません（見えている兄弟の末尾です）。隠れている兄弟と入れ替えるには、表示を『すべて』に切り替えてください。",
      },
    ],
    [
      "上の端・ルート・隠れたルートあり",
      { ok: false, reason: "at-edge", direction: "up", hiddenBeyond: true, isRoot: true },
      {
        kind: "status",
        message:
          "これ以上上へ移動できません（見えているルートの先頭です）。隠れているルートと入れ替えるには、表示を『すべて』に切り替えてください。",
      },
    ],
    [
      "下の端・ルート・隠れたルートなし",
      { ok: false, reason: "at-edge", direction: "down", hiddenBeyond: false, isRoot: true },
      { kind: "status", message: "これ以上下へ移動できません（見えているルートの末尾です）。" },
    ],
  ])("端: %s", (_name, result, expected) => {
    expect(formatSiblingReorderNotice(result)).toEqual(expected);
  });

  it.each<ReorderSiblingResult>([
    { ok: false, reason: "node-missing" },
    { ok: false, reason: "node-hidden" },
    { ok: false, reason: "invalid-target" },
    { ok: false, reason: "placement-failed" },
  ])("失敗: $reason", (result) => {
    expect(formatSiblingReorderNotice(result)).toEqual({
      kind: "error",
      message: "枝の順序を変更できませんでした。",
    });
  });
});
