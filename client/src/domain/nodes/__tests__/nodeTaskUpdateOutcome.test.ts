import {
  interpretCustomAttributeUpdateOutcome,
  interpretTaskUpdateOutcome,
} from "@/domain/nodes/nodeTaskUpdateOutcome";

describe("interpretTaskUpdateOutcome", () => {
  it("適用成功は changed: true", () => {
    expect(interpretTaskUpdateOutcome(true, null)).toEqual({ ok: true, changed: true });
  });

  it("同値は changed: false", () => {
    expect(interpretTaskUpdateOutcome(false, { matched: true, changed: false, nodes: null })).toEqual({
      ok: true,
      changed: false,
    });
  });

  it("不一致は拒否理由を返す", () => {
    expect(interpretTaskUpdateOutcome(false, { matched: false, changed: false, nodes: null })).toEqual({
      ok: false,
      reason: "タスクが更新されたか、現在の状態では編集できません。",
    });
  });
});

describe("interpretCustomAttributeUpdateOutcome", () => {
  it("バリデーション失敗は failureReason を優先する", () => {
    expect(interpretCustomAttributeUpdateOutcome(false, {
      matched: true,
      changed: false,
      nodes: null,
      failureReason: "数値を確認してください。",
    })).toEqual({ ok: false, reason: "数値を確認してください。" });
  });
});