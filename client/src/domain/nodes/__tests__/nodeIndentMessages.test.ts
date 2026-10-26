import type { ChangeNodeIndentResult } from "@/domain/nodes/nodeIndent";
import { formatNodeIndentNotice } from "@/domain/nodes/nodeIndentMessages";
import type { OperationNotice } from "@/types/operationNotice";

describe("formatNodeIndentNotice", () => {
  it.each<[string, ChangeNodeIndentResult, OperationNotice]>([
    [
      "下げた",
      { ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 3 },
      { kind: "status", message: "枝の階層を下げました（「A」の子、第3階層）。" },
    ],
    [
      "上げて親の子になった",
      { ok: true, direction: "outdent", newParentId: 1, newParentLabel: "R", depth: 2 },
      { kind: "status", message: "枝の階層を上げました（「R」の子、第2階層）。" },
    ],
    [
      "上げてルートになった",
      { ok: true, direction: "outdent", newParentId: null, newParentLabel: null, depth: 1 },
      { kind: "status", message: "枝の階層を上げました（ルート、第1階層）。" },
    ],
    [
      "階層に桁区切りを付けない",
      { ok: true, direction: "indent", newParentId: 2, newParentLabel: "A", depth: 10000 },
      { kind: "status", message: "枝の階層を下げました（「A」の子、第10000階層）。" },
    ],
  ])("成功: %s", (_name, result, expected) => {
    expect(formatNodeIndentNotice(result)).toEqual(expected);
  });

  const indentWith = (newParentLabel: string | null): ChangeNodeIndentResult => ({
    ok: true,
    direction: "indent",
    newParentId: 2,
    newParentLabel,
    depth: 2,
  });

  it.each<[string, string | null, string]>([
    ["空文字は「新しいノード」", "", "新しいノード"],
    ["null は「新しいノード」", null, "新しいノード"],
    ["20コードポイントはそのまま", "あ".repeat(20), "あ".repeat(20)],
    ["21コードポイントは先頭20に…", "あ".repeat(21), `${"あ".repeat(20)}…`],
    ["サロゲートペア20個はそのまま", "😀".repeat(20), "😀".repeat(20)],
    ["サロゲートペア21個は先頭20に…", "😀".repeat(21), `${"😀".repeat(20)}…`],
  ])("親のラベル: %s", (_name, label, shown) => {
    expect(formatNodeIndentNotice(indentWith(label))).toEqual({
      kind: "status",
      message: `枝の階層を下げました（「${shown}」の子、第2階層）。`,
    });
  });

  it.each<[string, ChangeNodeIndentResult, OperationNotice]>([
    [
      "下げる・端・隠れた兄弟なし",
      { ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: false, isRoot: false },
      { kind: "status", message: "これ以上階層を下げられません（見えている直前の兄弟がありません）。" },
    ],
    [
      "下げる・端・隠れた兄弟あり",
      { ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: true, isRoot: false },
      {
        kind: "status",
        message:
          "これ以上階層を下げられません（見えている直前の兄弟がありません）。隠れている兄弟の子にするには、表示を『すべて』に切り替えてください。",
      },
    ],
    [
      "下げる・端・隠れたルートあり",
      { ok: false, reason: "at-edge", direction: "indent", hiddenBeyond: true, isRoot: true },
      {
        kind: "status",
        message:
          "これ以上階層を下げられません（見えている直前のルートがありません）。隠れているルートの子にするには、表示を『すべて』に切り替えてください。",
      },
    ],
    [
      "上げる・端",
      { ok: false, reason: "at-edge", direction: "outdent" },
      { kind: "status", message: "これ以上階層を上げられません（ルートです）。" },
    ],
  ])("端: %s", (_name, result, expected) => {
    expect(formatNodeIndentNotice(result)).toEqual(expected);
  });

  it.each<ChangeNodeIndentResult>([
    { ok: false, reason: "node-missing" },
    { ok: false, reason: "node-hidden" },
    { ok: false, reason: "invalid-structure" },
    { ok: false, reason: "placement-failed" },
  ])("失敗: $reason", (result) => {
    expect(formatNodeIndentNotice(result)).toEqual({
      kind: "error",
      message: "枝の階層を変更できませんでした。",
    });
  });
});
