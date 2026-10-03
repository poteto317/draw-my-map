import { getIllustrationPanelView } from "@/components/layout/illustrationPanelView";

const ATTACHED = "data:image/jpeg;base64,ATTACHED";
const GENERATED = "data:image/jpeg;base64,GENERATED";
const plain = { id: 1, label: "目標" };
const withIllustration = { id: 1, label: "目標", illustration: ATTACHED };

describe("getIllustrationPanelView", () => {
  it("未選択・idleなら、何も表示しない", () => {
    expect(getIllustrationPanelView(null, { status: "idle" })).toEqual({
      isGenerating: false,
      status: null,
      image: null,
      generateLabel: "イラストを生成",
      canRemove: false,
      errorMessage: null,
    });
  });

  it("選択のみ（idle）なら、何も表示しない", () => {
    expect(getIllustrationPanelView(plain, { status: "idle" })).toEqual({
      isGenerating: false,
      status: null,
      image: null,
      generateLabel: "イラストを生成",
      canRemove: false,
      errorMessage: null,
    });
  });

  it("選択ノードの生成中は、生成中を示し、ボタンを無効にする", () => {
    expect(getIllustrationPanelView(plain, { status: "generating", nodeId: 1, label: "目標" })).toEqual({
      isGenerating: true,
      status: "generating",
      image: null,
      generateLabel: "イラストを生成",
      canRemove: false,
      errorMessage: null,
    });
  });

  it("別ノードの生成中は、ボタンだけ無効にして、状態は表示しない", () => {
    expect(getIllustrationPanelView(withIllustration, { status: "generating", nodeId: 2, label: "目標" })).toEqual({
      isGenerating: true,
      status: null,
      image: { kind: "attached", dataUrl: ATTACHED },
      generateLabel: "イラストを再生成",
      canRemove: true,
      errorMessage: null,
    });
  });

  it("選択ノードの生成中で設定済みもあるときは、生成中を示し、設定済みを表示する", () => {
    const view = getIllustrationPanelView(withIllustration, { status: "generating", nodeId: 1, label: "目標" });
    expect(view.status).toBe("generating");
    expect(view.image).toEqual({ kind: "attached", dataUrl: ATTACHED });
  });

  it("未選択で生成中なら、ボタンだけ無効にする", () => {
    expect(getIllustrationPanelView(null, { status: "generating", nodeId: 2, label: "目標" })).toEqual({
      isGenerating: true,
      status: null,
      image: null,
      generateLabel: "イラストを生成",
      canRemove: false,
      errorMessage: null,
    });
  });

  it("選択ノードの生成成功は、プレビューを表示する", () => {
    expect(
      getIllustrationPanelView(plain, { status: "succeeded", nodeId: 1, label: "目標", dataUrl: GENERATED }).image,
    ).toEqual({ kind: "preview", dataUrl: GENERATED });
  });

  it("生成成功と設定済みが両方あるときは、プレビューを優先する", () => {
    expect(
      getIllustrationPanelView(withIllustration, { status: "succeeded", nodeId: 1, label: "目標", dataUrl: GENERATED }).image,
    ).toEqual({ kind: "preview", dataUrl: GENERATED });
  });

  it("別ノードの生成成功は、プレビューにせず、設定済みを表示する", () => {
    const generation = { status: "succeeded", nodeId: 2, label: "目標", dataUrl: GENERATED } as const;
    expect(getIllustrationPanelView(withIllustration, generation).image).toEqual({
      kind: "attached",
      dataUrl: ATTACHED,
    });
    expect(getIllustrationPanelView(plain, generation).image).toBeNull();
  });

  it("選択ノードの生成失敗は、エラーを表示し、設定済みも表示する", () => {
    expect(
      getIllustrationPanelView(withIllustration, { status: "failed", nodeId: 1, message: "失敗" }),
    ).toEqual({
      isGenerating: false,
      status: null,
      image: { kind: "attached", dataUrl: ATTACHED },
      generateLabel: "イラストを再生成",
      canRemove: true,
      errorMessage: "失敗",
    });
  });

  it("別ノードの生成失敗は、エラーを表示しない", () => {
    expect(
      getIllustrationPanelView(plain, { status: "failed", nodeId: 2, message: "失敗" }).errorMessage,
    ).toBeNull();
  });

  it("設定済みのみなら、設定済みを表示する", () => {
    expect(getIllustrationPanelView(withIllustration, { status: "idle" }).image).toEqual({
      kind: "attached",
      dataUrl: ATTACHED,
    });
  });

  describe("生成時点からノードのテキストが変わったとき", () => {
    const succeeded = { status: "succeeded", nodeId: 1, label: "目標", dataUrl: GENERATED } as const;

    it("プレビューにせず、設定済みが無ければ画像なし", () => {
      expect(getIllustrationPanelView({ id: 1, label: "目標（変更後）" }, succeeded).image).toBeNull();
    });

    it("プレビューにせず、設定済みがあれば設定済みを表示する", () => {
      expect(
        getIllustrationPanelView({ id: 1, label: "目標（変更後）", illustration: ATTACHED }, succeeded).image,
      ).toEqual({ kind: "attached", dataUrl: ATTACHED });
    });

    it("テキストを元に戻せば、プレビューを再び表示する", () => {
      expect(getIllustrationPanelView({ id: 1, label: "目標" }, succeeded).image).toEqual({
        kind: "preview",
        dataUrl: GENERATED,
      });
    });

    it("生成中の表示は、テキストが変わっても、ノードIDだけで判定する", () => {
      const view = getIllustrationPanelView(
        { id: 1, label: "目標（変更後）" },
        { status: "generating", nodeId: 1, label: "目標" },
      );
      expect(view.status).toBe("generating");
    });
  });

  describe("生成ボタンのラベルと削除", () => {
    const IMAGE = "data:image/jpeg;base64,AAAA";

    it("イラストが無いノードでは、generateLabel は「イラストを生成」、canRemove は false", () => {
      const view = getIllustrationPanelView({ id: 1, label: "a" }, { status: "idle" });
      expect(view.generateLabel).toBe("イラストを生成");
      expect(view.canRemove).toBe(false);
    });

    it("イラストがあるノードでは、generateLabel は「イラストを再生成」、canRemove は true", () => {
      const view = getIllustrationPanelView({ id: 1, label: "a", illustration: IMAGE }, { status: "idle" });
      expect(view.generateLabel).toBe("イラストを再生成");
      expect(view.canRemove).toBe(true);
    });

    it("ノードが未選択のときは、「イラストを生成」で、canRemove は false", () => {
      const view = getIllustrationPanelView(null, { status: "idle" });
      expect(view.generateLabel).toBe("イラストを生成");
      expect(view.canRemove).toBe(false);
    });

    it("生成のプレビュー中でも、ノードにイラストがあれば canRemove は true、ラベルは「再生成」", () => {
      const view = getIllustrationPanelView(
        { id: 1, label: "a", illustration: IMAGE },
        { status: "succeeded", nodeId: 1, label: "a", dataUrl: "data:image/jpeg;base64,BBBB" },
      );
      expect(view.image).toEqual({ kind: "preview", dataUrl: "data:image/jpeg;base64,BBBB" });
      expect(view.canRemove).toBe(true);
      expect(view.generateLabel).toBe("イラストを再生成");
    });
  });
});
