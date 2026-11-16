import { act, renderHook } from "@testing-library/react";
import { LABEL_REPLACE_PREVIEW_LIMIT } from "@/hooks/labelReplacePreview";
import { useLabelReplaceDialog } from "@/hooks/useLabelReplaceDialog";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

// useDeferredValue の「遅れて追いつく最中」を作るための差し替え。frozen の間は最後の値を返し続ける
const mockDeferred = { frozen: false };
jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react");
  return {
    ...actual,
    useDeferredValue: <T,>(value: T): T => {
      const ref = actual.useRef(value);
      if (!mockDeferred.frozen) ref.current = value;
      return ref.current;
    },
  };
});

type Props = {
  mapId?: string;
  nodes?: readonly Node[];
  selectedNodeIds?: readonly number[];
  documentRevision?: number;
};

const baseNodes = [
  createTestNode({ id: 1, label: "Apple pie" }),
  createTestNode({ id: 2, label: "apple" }),
  createTestNode({ id: 3, label: "banana" }),
  createTestNode({ id: 4, label: "旧" }),
];

function setup(initial: Props = {}) {
  const updateNodeLabels = jest.fn<boolean, [ReadonlyMap<number, string>]>(() => true);
  const publishNotice = jest.fn();
  const view = renderHook(
    (props: Props) => useLabelReplaceDialog({
      mapId: props.mapId ?? "a",
      nodes: props.nodes ?? baseNodes,
      selectedNodeIds: props.selectedNodeIds ?? [],
      documentRevision: props.documentRevision ?? 0,
      updateNodeLabels,
      publishNotice,
    }),
    { initialProps: initial },
  );
  return { ...view, updateNodeLabels, publishNotice };
}

function type(view: ReturnType<typeof setup>, query: string, replacement: string) {
  act(() => { view.result.current.setQuery(query); });
  act(() => { view.result.current.setReplacement(replacement); });
}

describe("useLabelReplaceDialog", () => {
  afterEach(() => {
    mockDeferred.frozen = false;
  });

  it("開くと検索語が空で、確定できず、状態文言が検索語の入力を求める", () => {
    const view = setup();

    act(() => { view.result.current.open(); });

    expect(view.result.current.screen).toBe("open");
    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("検索語を入力してください。");
    expect(view.result.current.focusRequest).toBe("query");
  });

  it("プレビューの表示上限を戻り値として返す", () => {
    const view = setup();

    expect(view.result.current.previewLimit).toBe(LABEL_REPLACE_PREVIEW_LIMIT);
  });

  it("ノードが 1 件も無いときは開かない", () => {
    const view = setup({ nodes: [] });

    act(() => { view.result.current.open(); });

    expect(view.result.current.screen).toBe("closed");
  });

  it("入力に応じてプレビュー・件数・確定ボタンの文言を求める", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "APPLE", "Orange");

    expect(view.result.current.previewRows.map((row) => [row.nodeId, row.after])).toEqual([
      [1, "Orange pie"],
      [2, "Orange"],
    ]);
    expect(view.result.current.replaceCount).toBe(2);
    expect(view.result.current.statusText).toBe("2件を置換します。");
    expect(view.result.current.submitLabel).toBe("2件を置換");
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("一致が無ければ「一致するノードがありません。」で確定できない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "zzz", "x");

    expect(view.result.current.statusText).toBe("一致するノードがありません。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("置換後に空になるノードは対象外として数え、空になるノードしか無ければ確定できない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "旧", "");

    expect(view.result.current.previewRows.map((row) => row.status)).toEqual(["emptied"]);
    expect(view.result.current.statusText).toBe("置換できるノードがありません。");
    expect(view.result.current.canSubmit).toBe(false);

    type(view, "a", "");
    expect(view.result.current.statusText).toBe("3件を置換します。");
    expect(view.result.current.canSubmit).toBe(true);
  });

  it("置換前後が同じノードは一覧にも件数にも出さない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    type(view, "BANANA", "banana");

    expect(view.result.current.previewRows).toEqual([]);
    expect(view.result.current.statusText).toBe("一致するノードがありません。");
  });

  it("選択が 2 件以上なら既定で選択だけを対象にし、チェックを外すと全ノードが対象になる", () => {
    const view = setup({ selectedNodeIds: [1, 3] });
    act(() => { view.result.current.open(); });
    type(view, "a", "x");

    expect(view.result.current.scopeSelectedOnly).toBe(true);
    expect(view.result.current.scopeCount).toBe(2);
    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 3]);

    act(() => { view.result.current.setScopeSelectedOnly(false); });
    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 2, 3]);
  });

  it("開いた後に選択が変わっても、対象は開いた時点の選択のままにする", () => {
    const view = setup({ selectedNodeIds: [1, 2] });
    act(() => { view.result.current.open(); });
    type(view, "a", "x");

    view.rerender({ selectedNodeIds: [3, 4] });

    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 2]);
  });

  it("確定は最新のノードから計画を作り直して updateNodeLabels を 1 回呼び、通知して閉じる", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");
    // 同じ documentRevision のまま、ノードだけが差し替わる（ラベルが変わり、id 5 が増える）
    view.rerender({
      nodes: [
        createTestNode({ id: 1, label: "Apple tart" }),
        createTestNode({ id: 2, label: "apple" }),
        createTestNode({ id: 3, label: "banana" }),
        createTestNode({ id: 5, label: "green apple" }),
      ],
    });

    act(() => { view.result.current.submit(); });

    expect(view.updateNodeLabels).toHaveBeenCalledTimes(1);
    expect(view.updateNodeLabels.mock.calls[0][0]).toEqual(
      new Map([[1, "Orange tart"], [2, "Orange"], [5, "green Orange"]]),
    );
    expect(view.publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "3件のノードのラベルを置換しました。",
    });
    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBe("header");
  });

  it("確定の 2 回目は何もしない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    act(() => {
      view.result.current.submit();
      view.result.current.submit();
    });

    expect(view.updateNodeLabels).toHaveBeenCalledTimes(1);
    expect(view.publishNotice).toHaveBeenCalledTimes(1);
  });

  it("確定は開いた時点の選択だけを対象にし、チェックを外すと全ノードを対象にする", () => {
    const scoped = setup({ selectedNodeIds: [1, 3] });
    act(() => { scoped.result.current.open(); });
    type(scoped, "a", "x");

    act(() => { scoped.result.current.submit(); });

    expect(scoped.updateNodeLabels.mock.calls[0][0]).toEqual(new Map([[1, "xpple pie"], [3, "bxnxnx"]]));
    expect(scoped.publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "2件のノードのラベルを置換しました。",
    });

    const all = setup({ selectedNodeIds: [1, 3] });
    act(() => { all.result.current.open(); });
    type(all, "a", "x");
    act(() => { all.result.current.setScopeSelectedOnly(false); });

    act(() => { all.result.current.submit(); });

    expect(all.updateNodeLabels.mock.calls[0][0]).toEqual(
      new Map([[1, "xpple pie"], [2, "xpple"], [3, "bxnxnx"]]),
    );
  });

  it("確定には置換する行だけを含め、置換後に空になる行は含めない", () => {
    const view = setup({
      nodes: [
        createTestNode({ id: 1, label: "a" }),
        createTestNode({ id: 2, label: "apple" }),
        createTestNode({ id: 3, label: "banana" }),
        createTestNode({ id: 4, label: "xyz" }),
      ],
    });
    act(() => { view.result.current.open(); });
    type(view, "a", "");

    expect(view.result.current.previewRows.map((row) => [row.nodeId, row.status])).toEqual([
      [1, "emptied"],
      [2, "replace"],
      [3, "replace"],
    ]);

    act(() => { view.result.current.submit(); });

    expect(view.updateNodeLabels.mock.calls[0][0]).toEqual(new Map([[2, "pple"], [3, "bnn"]]));
    expect(view.publishNotice).toHaveBeenCalledWith({
      kind: "status",
      message: "2件のノードのラベルを置換しました。",
    });
  });

  it("プレビューが入力に追いついていない間は、確定しても何もしない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    // 以降の入力に対して、遅延した値が古いまま残る
    mockDeferred.frozen = true;
    act(() => { view.result.current.setQuery("banana"); });

    expect(view.result.current.canSubmit).toBe(false);
    act(() => { view.result.current.submit(); });

    expect(view.updateNodeLabels).not.toHaveBeenCalled();
    expect(view.publishNotice).not.toHaveBeenCalled();
    expect(view.result.current.screen).toBe("open");
  });

  it("検索語が空のときは確定しても何もしない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });

    act(() => { view.result.current.submit(); });

    expect(view.updateNodeLabels).not.toHaveBeenCalled();
    expect(view.result.current.screen).toBe("open");
  });

  it("開き直した直後に、前回の検索語のプレビューを出さない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");
    act(() => { view.result.current.close(); });

    // 遅延した値が前回の入力のまま残っている状態で開き直す
    mockDeferred.frozen = true;
    act(() => { view.result.current.open(); });

    expect(view.result.current.previewRows).toEqual([]);
    expect(view.result.current.replaceCount).toBe(0);
    expect(view.result.current.statusText).toBe("検索語を入力してください。");
    expect(view.result.current.canSubmit).toBe(false);
  });

  it("閉じても遅延が追いつかないまま開き直して入力しても、前回の検索語の一致行を出さない", () => {
    const view = setup();
    act(() => { view.result.current.open(); });
    type(view, "banana", "OLD");
    act(() => { view.result.current.close(); });

    // 閉じた時点で遅延した値は空へ落ち着いており、その後は遅れたまま
    mockDeferred.frozen = true;
    act(() => { view.result.current.open(); });
    act(() => { view.result.current.setQuery("a"); });

    expect(view.result.current.previewRows).toEqual([]);
    expect(view.result.current.replaceCount).toBe(0);
    expect(view.result.current.canSubmit).toBe(false);

    // 遅延が追いつけば、新しい検索語 "a" の結果になる
    mockDeferred.frozen = false;
    view.rerender({});
    expect(view.result.current.previewRows.map((row) => row.nodeId)).toEqual([1, 2, 3]);
    expect(view.result.current.statusText).not.toBe("検索語を入力してください。");
  });

  it("updateNodeLabels が失敗した後にもう一度確定すると、成功して通知は 1 回だけになる", () => {
    const view = setup();
    view.updateNodeLabels.mockReturnValueOnce(false);
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    act(() => { view.result.current.submit(); });
    act(() => { view.result.current.submit(); });

    expect(view.updateNodeLabels).toHaveBeenCalledTimes(2);
    expect(view.publishNotice).toHaveBeenCalledTimes(1);
    expect(view.result.current.screen).toBe("closed");
  });

  it("updateNodeLabels が false を返したら閉じず、エラーを出して通知しない", () => {
    const view = setup();
    view.updateNodeLabels.mockReturnValueOnce(false);
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    act(() => { view.result.current.submit(); });

    expect(view.result.current.screen).toBe("open");
    expect(view.result.current.error.message).toBe("ラベルを置換できませんでした。もう一度お試しください。");
    expect(view.publishNotice).not.toHaveBeenCalled();
  });

  it("開いた後に documentRevision が変わると stale になり、確定できずエラーを出す", () => {
    const view = setup({ documentRevision: 0 });
    act(() => { view.result.current.open(); });
    type(view, "apple", "Orange");

    view.rerender({ documentRevision: 1 });

    expect(view.result.current.canSubmit).toBe(false);
    expect(view.result.current.statusText).toBe("マップが更新されました。閉じてから開き直してください。");
    expect(view.result.current.error.message).toBe("マップが更新されました。閉じてから開き直してください。");
    act(() => { view.result.current.submit(); });
    expect(view.updateNodeLabels).not.toHaveBeenCalled();
  });

  it("mapId が変わると閉じた扱いになり、ヘッダーへのフォーカスは求めない", () => {
    const view = setup({ mapId: "a" });
    act(() => { view.result.current.open(); });

    view.rerender({ mapId: "b" });

    expect(view.result.current.screen).toBe("closed");
    expect(view.result.current.focusRequest).toBeNull();

    // 元のマップへ戻っても、古いダイアログは復活しない
    view.rerender({ mapId: "a" });
    expect(view.result.current.screen).toBe("closed");
  });

  it("replace 行が上限を超えたら先頭の上限件数だけ表示し、残りの件数を返すが、確定は全件を対象にする", () => {
    const many = Array.from({ length: LABEL_REPLACE_PREVIEW_LIMIT + 5 }, (_, index) => (
      createTestNode({ id: index + 1, label: `item${index}` })
    ));
    const view = setup({ nodes: many });
    act(() => { view.result.current.open(); });
    type(view, "item", "x");

    expect(view.result.current.previewRows).toHaveLength(LABEL_REPLACE_PREVIEW_LIMIT);
    expect(view.result.current.hiddenReplaceCount).toBe(5);
    expect(view.result.current.replaceCount).toBe(LABEL_REPLACE_PREVIEW_LIMIT + 5);

    act(() => { view.result.current.submit(); });
    expect(view.updateNodeLabels.mock.calls[0][0].size).toBe(LABEL_REPLACE_PREVIEW_LIMIT + 5);
  });

  it("emptied 行は上限の枠に数えず常に表示する", () => {
    // emptied を先頭に置く（emptied も replace と同じ枠に数える誤実装なら、replace が 1 件足りなくなって落ちる）
    const many = [
      createTestNode({ id: 9999, label: "z" }),
      ...Array.from({ length: LABEL_REPLACE_PREVIEW_LIMIT }, (_, index) => createTestNode({ id: index + 1, label: `item${index} z` })),
    ];
    const view = setup({ nodes: many });
    act(() => { view.result.current.open(); });
    type(view, "z", "");

    expect(view.result.current.previewRows.filter((row) => row.status === "emptied")).toHaveLength(1);
    expect(view.result.current.previewRows.filter((row) => row.status === "replace")).toHaveLength(LABEL_REPLACE_PREVIEW_LIMIT);
    expect(view.result.current.hiddenReplaceCount).toBe(0);
  });
});
