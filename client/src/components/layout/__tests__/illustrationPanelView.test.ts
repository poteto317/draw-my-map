import { getIllustrationPanelView } from "@/components/layout/illustrationPanelView";

const ATTACHED = "data:image/jpeg;base64,ATTACHED";
const GENERATED = "data:image/jpeg;base64,GENERATED";
const plain = { id: 1 };
const withIllustration = { id: 1, illustration: ATTACHED };

describe("getIllustrationPanelView", () => {
  it("未選択・idleなら、何も表示しない", () => {
    expect(getIllustrationPanelView(null, { status: "idle" })).toEqual({
      isGenerating: false,
      status: null,
      image: null,
      errorMessage: null,
    });
  });

  it("選択のみ（idle）なら、何も表示しない", () => {
    expect(getIllustrationPanelView(plain, { status: "idle" })).toEqual({
      isGenerating: false,
      status: null,
      image: null,
      errorMessage: null,
    });
  });

  it("選択ノードの生成中は、生成中を示し、ボタンを無効にする", () => {
    expect(getIllustrationPanelView(plain, { status: "generating", nodeId: 1 })).toEqual({
      isGenerating: true,
      status: "generating",
      image: null,
      errorMessage: null,
    });
  });

  it("別ノードの生成中は、ボタンだけ無効にして、状態は表示しない", () => {
    expect(getIllustrationPanelView(withIllustration, { status: "generating", nodeId: 2 })).toEqual({
      isGenerating: true,
      status: null,
      image: { kind: "attached", dataUrl: ATTACHED },
      errorMessage: null,
    });
  });

  it("選択ノードの生成中で設定済みもあるときは、生成中を示し、設定済みを表示する", () => {
    const view = getIllustrationPanelView(withIllustration, { status: "generating", nodeId: 1 });
    expect(view.status).toBe("generating");
    expect(view.image).toEqual({ kind: "attached", dataUrl: ATTACHED });
  });

  it("未選択で生成中なら、ボタンだけ無効にする", () => {
    expect(getIllustrationPanelView(null, { status: "generating", nodeId: 2 })).toEqual({
      isGenerating: true,
      status: null,
      image: null,
      errorMessage: null,
    });
  });

  it("選択ノードの生成成功は、プレビューを表示する", () => {
    expect(
      getIllustrationPanelView(plain, { status: "succeeded", nodeId: 1, dataUrl: GENERATED }).image,
    ).toEqual({ kind: "preview", dataUrl: GENERATED });
  });

  it("生成成功と設定済みが両方あるときは、プレビューを優先する", () => {
    expect(
      getIllustrationPanelView(withIllustration, { status: "succeeded", nodeId: 1, dataUrl: GENERATED }).image,
    ).toEqual({ kind: "preview", dataUrl: GENERATED });
  });

  it("別ノードの生成成功は、プレビューにせず、設定済みを表示する", () => {
    const generation = { status: "succeeded", nodeId: 2, dataUrl: GENERATED } as const;
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
});
