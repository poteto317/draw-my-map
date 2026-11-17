import { act, renderHook } from "@testing-library/react";
import { planNodeMerge, type MergeNodesResult, type NodeMergePlan } from "@/domain/nodes/nodeMerge";
import { NODE_MERGE_PREVIEW_LIMIT } from "@/hooks/nodeMergePreview";
import { useNodeMergeDialog } from "@/hooks/useNodeMergeDialog";
import { createTestNode } from "@/testing/createTestNode";
import { createJpegDataUrl } from "@/testing/jpegFixture";
import type { Node } from "@/types/node";

type Props = {
  mapId?: string;
  nodes?: readonly Node[];
  selectedNodeId?: number | null;
  selectedNodeIds?: readonly number[];
  visibleNodeIds?: ReadonlySet<number>;
  documentRevision?: number;
};

// 1: 親、2: りんご（低）、3: リンゴ（高）、4: バナナ（中）、5: 2 の子、6: 別の根
const illustration = createJpegDataUrl(100, 100);
const baseNodes = [
  createTestNode({ id: 1, parentId: null, label: "親" }),
  createTestNode({ id: 2, parentId: 1, label: "りんご", importance: "low" }),
  createTestNode({ id: 3, parentId: 1, label: "リンゴ", importance: "high", illustration }),
  createTestNode({ id: 4, parentId: 1, label: "バナナ" }),
  createTestNode({ id: 5, parentId: 2, label: "りんごの子" }),
  createTestNode({ id: 6, parentId: null, label: "別の根" }),
];
const baseVisible: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6]);

function setup(initial: Props = {}) {
  const mergeNodes = jest.fn<MergeNodesResult, [readonly number[], number | null, string, ReadonlySet<number>, NodeMergePlan]>(
    () => ({ ok: true, survivorId: 3, absorbedCount: 1 }),
  );
  const publishNotice = jest.fn();
  const view = renderHook(
    (props: Props) => useNodeMergeDialog({
      mapId: props.mapId ?? "a",
      nodes: props.nodes ?? baseNodes,
      selectedNodeId: props.selectedNodeId === undefined ? 3 : props.selectedNodeId,
      selectedNodeIds: props.selectedNodeIds ?? [2, 3],
      visibleNodeIds: props.visibleNodeIds ?? baseVisible,
      documentRevision: props.documentRevision ?? 0,
      mergeNodes,
      publishNotice,
    }),
    { initialProps: initial },
  );
  return { ...view, mergeNodes, publishNotice };
}

describe("useNodeMergeDialog", () => {
  it("開くと、既定の区切り文字（半角スペース）で連結した結果のプレビューが出て、確定できる", () => {
    const view = setup();

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({
      screen: "open",
      separatorPreset: "space",
      statusText: "2件を1件に統合します",
      canSubmit: true,
      focusRequest: "separator",
    });
    expect(view.result.current.preview).toEqual({
      survivorLabel: "リンゴ",
      label: "りんご リンゴ",
      importanceLabel: "高",
      illustrationText: "主選択のイラストを残す",
      movedChildCount: 1,
      discardedIllustrationCount: 0,
      absorbedLabels: ["りんご"],
      hiddenAbsorbedCount: 0,
      noteText: null,
      linkText: null,
      tagText: null,
    });
  });

  describe("ボタンの有効判定と開く条件", () => {
    it.each([[[]], [[2]]])("選択が %j のとき（2 件未満）は canOpen が偽で、開かず、理由を返す", (selectedNodeIds) => {
      const view = setup({ selectedNodeIds });

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(false);
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.disabledReason).toBe("2 つ以上のノードを選択してください。");
    });

    it("選択が 2 件以上なら canOpen は真で、親が違うなどの理由は開いたあとのプレビューで示す", () => {
      const view = setup({ selectedNodeIds: [2, 6], selectedNodeId: 6 });

      act(() => { view.result.current.open(); });

      expect(view.result.current.canOpen).toBe(true);
      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.preview).toBeNull();
      expect(view.result.current.statusText).toBe("同じ親の兄弟のノードだけを統合できます。");
      expect(view.result.current.canSubmit).toBe(false);
    });
  });

  it("主選択が選択に含まれないときは、理由を示して確定できない", () => {
    const view = setup({ selectedNodeId: null });

    act(() => { view.result.current.open(); });

    expect(view.result.current.statusText).toBe("主選択のノードがありません。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("区切り文字を替えると、連結後のラベルが即時に変わる（区切りなし・その他の入力を含む）", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    act(() => { view.result.current.setSeparatorPreset("middle-dot"); });
    expect(view.result.current.preview?.label).toBe("りんご・リンゴ");

    act(() => { view.result.current.setSeparatorPreset("custom"); });
    expect(view.result.current.preview?.label).toBe("りんごリンゴ");
    expect(view.result.current.canSubmit).toBe(true);

    act(() => { view.result.current.setCustomSeparator(" + "); });
    expect(view.result.current.preview?.label).toBe("りんご + リンゴ");
  });

  it("開き直すと、前回の区切り文字を持ち越さず既定に戻る", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    act(() => { view.result.current.setSeparatorPreset("custom"); });
    act(() => { view.result.current.setCustomSeparator("x"); });
    act(() => { view.result.current.close(); });

    act(() => { view.result.current.open(); });

    expect(view.result.current).toMatchObject({ separatorPreset: "space", customSeparator: "" });
  });

  it("開いた後に選択が変わっても、対象は開いた時点の選択集合と主選択のままにする", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeIds: [4, 6], selectedNodeId: 6 });

    expect(view.result.current.preview?.label).toBe("りんご リンゴ");
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("確定は、開いた後に選択が変わっても、開いた時点の選択集合と主選択を対象にして mergeNodes を呼ぶ", () => {
    const view = setup({ selectedNodeIds: [2, 3], selectedNodeId: 3 });
    act(() => { view.result.current.open(); });

    view.rerender({ selectedNodeIds: [4, 6], selectedNodeId: 6 });
    act(() => { view.result.current.submit(); });

    expect(view.mergeNodes).toHaveBeenCalledTimes(1);
    const [ids, primaryId, , , expected] = view.mergeNodes.mock.calls[0];
    expect(ids).toEqual([2, 3]);
    expect(primaryId).toBe(3);
    expect(expected).toEqual(planNodeMerge(baseNodes, [2, 3], 3, " ", baseVisible));
  });

  it("プレビューは最新の nodes から作る（開いた後にラベルが変わると、連結後のラベルも変わる）", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    view.rerender({ nodes: baseNodes.map((item) => (item.id === 2 ? { ...item, label: "ミカン" } : item)) });

    expect(view.result.current.preview?.label).toBe("ミカン リンゴ");
  });

  it("消えるノードの一覧は先頭の 200 件までで、超えた件数を返す。確定の対象は全件（計画が全件持つ）", () => {
    const many = [
      createTestNode({ id: 1, parentId: null, label: "親" }),
      ...Array.from({ length: NODE_MERGE_PREVIEW_LIMIT + 50 }, (_, index) => (
        createTestNode({ id: index + 2, parentId: 1, label: `項目${index + 2}` })
      )),
    ];
    const ids = many.slice(1).map((item) => item.id);
    const view = setup({
      nodes: many,
      selectedNodeIds: ids,
      selectedNodeId: ids[0],
      visibleNodeIds: new Set(many.map((item) => item.id)),
    });
    act(() => { view.result.current.open(); });

    expect(view.result.current.preview?.absorbedLabels).toHaveLength(NODE_MERGE_PREVIEW_LIMIT);
    expect(view.result.current.preview?.hiddenAbsorbedCount).toBe(49);
    expect(view.result.current.statusText).toBe("250件を1件に統合します");

    act(() => { view.result.current.submit(); });
    const expected = view.mergeNodes.mock.calls[0][4];
    expect(expected.ok && expected.absorbedIds).toHaveLength(NODE_MERGE_PREVIEW_LIMIT + 49);
  });

  describe("確定", () => {
    it("mergeNodes を 1 回、現在のプレビューの計画を expected として呼び、通知して閉じる", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.mergeNodes).toHaveBeenCalledTimes(1);
      const [ids, primaryId, joiner, visibleNodeIds, expected] = view.mergeNodes.mock.calls[0];
      expect(ids).toEqual([2, 3]);
      expect(primaryId).toBe(3);
      expect(joiner).toBe(" ");
      expect(visibleNodeIds).toBe(baseVisible);
      expect(expected).toEqual(planNodeMerge(baseNodes, [2, 3], 3, " ", baseVisible));
      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "2 件のノードを 1 件に統合しました。" });
      expect(view.result.current.screen).toBe("closed");
      expect(view.result.current.focusRequest).toBe("header");
    });

    it("成功の通知の件数は、残したノードと吸収した数の合計", () => {
      const view = setup({ selectedNodeIds: [2, 3, 4] });
      view.mergeNodes.mockReturnValueOnce({ ok: true, survivorId: 3, absorbedCount: 2 });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.publishNotice).toHaveBeenCalledWith({ kind: "status", message: "3 件のノードを 1 件に統合しました。" });
    });

    it("同じ処理での 2 回目の確定は何もしない", () => {
      const view = setup();
      act(() => { view.result.current.open(); });

      act(() => {
        view.result.current.submit();
        view.result.current.submit();
      });

      expect(view.mergeNodes).toHaveBeenCalledTimes(1);
      expect(view.publishNotice).toHaveBeenCalledTimes(1);
    });

    it("計画が失敗しているとき・開いていないときは mergeNodes を呼ばない", () => {
      const failing = setup({ selectedNodeIds: [2, 6], selectedNodeId: 6 });
      act(() => { failing.result.current.open(); });
      act(() => { failing.result.current.submit(); });
      expect(failing.mergeNodes).not.toHaveBeenCalled();

      const closed = setup();
      act(() => { closed.result.current.submit(); });
      expect(closed.mergeNodes).not.toHaveBeenCalled();
    });

    it("mergeNodes が失敗したら閉じず、その reason の文言をエラーに出して通知しない。もう一度確定できる", () => {
      const view = setup();
      view.mergeNodes.mockReturnValueOnce({ ok: false, reason: "plan-changed" });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.screen).toBe("open");
      expect(view.result.current.error.message).toBe("統合の内容が変わりました。もう一度確認してください。");
      expect(view.publishNotice).not.toHaveBeenCalled();

      act(() => { view.result.current.submit(); });
      expect(view.mergeNodes).toHaveBeenCalledTimes(2);
      expect(view.result.current.screen).toBe("closed");
    });

    it("placement-failed の失敗は「ノードを統合できませんでした。」を出す", () => {
      const view = setup();
      view.mergeNodes.mockReturnValueOnce({ ok: false, reason: "placement-failed" });
      act(() => { view.result.current.open(); });

      act(() => { view.result.current.submit(); });

      expect(view.result.current.error.message).toBe("ノードを統合できませんでした。");
    });
  });

  it("開いた後に documentRevision が変わると stale になり、確定できず、状態文言とエラーが更新を促す", () => {
    const view = setup({ documentRevision: 0 });
    act(() => { view.result.current.open(); });

    view.rerender({ documentRevision: 1 });

    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("マップが更新されました。閉じてから開き直してください。");
    expect(view.result.current.error.message).toBe("マップが更新されました。閉じてから開き直してください。");
    act(() => { view.result.current.submit(); });
    expect(view.mergeNodes).not.toHaveBeenCalled();
  });

  it("mapId が変わると閉じた扱いになり、ヘッダーへのフォーカスは求めない（元のマップへ戻っても復活しない）", () => {
    const view = setup({ mapId: "a" });
    act(() => { view.result.current.open(); });

    view.rerender({ mapId: "b" });
    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBeNull();

    view.rerender({ mapId: "a" });
    expect(view.result.current.screen).toBe("closed");
  });

  it("フォーカス要求は consumeFocusRequest で消える", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    expect(view.result.current.focusRequest).toBe("separator");

    act(() => { view.result.current.consumeFocusRequest(); });

    expect(view.result.current.focusRequest).toBeNull();
  });
});
