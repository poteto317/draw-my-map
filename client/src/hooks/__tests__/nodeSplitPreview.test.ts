import { STALE_DIALOG_MESSAGE } from "@/hooks/dialogPreviewText";
import { describeNodeSplitStatus } from "@/hooks/nodeSplitPreview";

describe("describeNodeSplitStatus", () => {
  it("stale のときは、計画より先に更新を促す文言を返す", () => {
    expect(describeNodeSplitStatus(true, { ok: true, nodeId: 1, fragments: ["a", "b"] })).toBe(STALE_DIALOG_MESSAGE);
    expect(describeNodeSplitStatus(true, null)).toBe(STALE_DIALOG_MESSAGE);
  });

  it("計画が無ければ空文字", () => {
    expect(describeNodeSplitStatus(false, null)).toBe("");
  });

  it("成功の計画は、分割後の件数と追加する件数を返す", () => {
    expect(describeNodeSplitStatus(false, { ok: true, nodeId: 1, fragments: ["a", "b", "c"] })).toBe("3件に分割します（2件を追加）");
    expect(describeNodeSplitStatus(false, { ok: true, nodeId: 1, fragments: ["a", "b"] })).toBe("2件に分割します（1件を追加）");
  });

  it("失敗の計画は、その reason の文言を返す", () => {
    expect(describeNodeSplitStatus(false, { ok: false, reason: "separator-empty" })).toBe("区切り文字を入力してください。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "not-splittable" })).toBe("区切り文字で 2 つ以上に分けられません。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "too-many-fragments" })).toBe("分割できるのは 200 件までです。");
    expect(describeNodeSplitStatus(false, { ok: false, reason: "node-missing" })).toBe("分割できるノードが選択されていません。");
  });
});
