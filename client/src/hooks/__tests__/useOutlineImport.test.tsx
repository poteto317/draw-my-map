import { act, renderHook } from "@testing-library/react";
import type {
  ForestInsertionTarget,
  ForestItem,
} from "@/domain/nodes/nodeForestInsertion";
import { parseOutlineText } from "@/domain/outline/outlineParser";
import { buildOutlinePreview } from "@/domain/outline/outlinePreview";
import type { InsertForestResult } from "@/hooks/useNodes";
import {
  useOutlineImport,
  type UseOutlineImportOptions,
} from "@/hooks/useOutlineImport";

// 解析の回数を数えるため、本物の実装を包む
jest.mock("@/domain/outline/outlineParser", () => {
  const actual = jest.requireActual("@/domain/outline/outlineParser");
  return { ...actual, parseOutlineText: jest.fn(actual.parseOutlineText) };
});

const parseOutlineTextMock = jest.mocked(parseOutlineText);

// プレビューの組み立ての回数と引数を確かめるため、本物の実装を包む
jest.mock("@/domain/outline/outlinePreview", () => {
  const actual = jest.requireActual("@/domain/outline/outlinePreview");
  return { ...actual, buildOutlinePreview: jest.fn(actual.buildOutlinePreview) };
});

const buildOutlinePreviewMock = jest.mocked(buildOutlinePreview);

// 3件（ルート1件と子2件）になるテキスト
const THREE_ITEMS = "親\n  子1\n  子2";

const SUCCESS: InsertForestResult = { ok: true, rootId: 100, count: 3 };

const SUCCESS_MESSAGE =
  "3件のノードを追加しました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。";
const PARENT_MISSING_MESSAGE =
  "選択していたノードが見つからないため、追加できませんでした。「新しいルートとして追加」を選び直してください。";
const INSERT_FAILED_MESSAGE =
  "ノードを追加できませんでした。マップは変わっていません。";
const TOO_LONG_MESSAGE = "テキストが長すぎます（1,000,000文字以内）。";
const NO_ITEMS_MESSAGE =
  "取り込める行がありません。空行と記号だけの行は取り込みません。";

// 本物と同じ結果型を返す（L-171）
function createInsertForest(result: InsertForestResult = SUCCESS) {
  return jest.fn<InsertForestResult, [readonly ForestItem[], ForestInsertionTarget]>(
    () => result,
  );
}

function createExpandNodes() {
  return jest.fn<void, [readonly number[]]>();
}

function renderOutlineImport(overrides: Partial<UseOutlineImportOptions> = {}) {
  const initialProps: UseOutlineImportOptions = {
    selectedNodeId: null,
    documentRevision: 0,
    insertForest: createInsertForest(),
    expandNodes: createExpandNodes(),
    ...overrides,
  };
  const hook = renderHook(
    (props: UseOutlineImportOptions) => useOutlineImport(props),
    { initialProps },
  );
  return { ...hook, props: initialProps };
}

type Hook = ReturnType<typeof renderOutlineImport>;

// 開いてテキストを入れ、プレビューの画面へ進める
function openPreview(hook: Hook, text = THREE_ITEMS) {
  act(() => hook.result.current.open());
  act(() => hook.result.current.setText(text));
  act(() => hook.result.current.requestPreview());
}

beforeEach(() => {
  parseOutlineTextMock.mockClear();
  buildOutlinePreviewMock.mockClear();
});

describe("useOutlineImport の画面の遷移", () => {
  it("開くと入力の画面になり、追加先の候補を控え、入力欄へフォーカスを求める", () => {
    const hook = renderOutlineImport({ selectedNodeId: 5 });
    const before = hook.result.current.dialogNotices.sequence;

    act(() => hook.result.current.open());

    const current = hook.result.current;
    expect(current.screen).toBe("input");
    expect(current.parentCandidateId).toBe(5);
    expect(current.target).toBe("root");
    expect(current.focusRequest).toBe("input");
    expect(current.dialogNotices).toEqual({
      sequence: before + 1,
      status: null,
      alert: null,
    });
    expect(current.outline).toBeNull();
    expect(current.preview).toBeNull();
  });

  it("プレビューの解析が成功するとプレビューの画面へ移る", () => {
    const hook = renderOutlineImport();

    openPreview(hook);

    const current = hook.result.current;
    expect(current.screen).toBe("preview");
    expect(current.outline?.items.map((item) => item.label)).toEqual([
      "親",
      "子1",
      "子2",
    ]);
    expect(current.preview?.totalCount).toBe(current.outline?.items.length);
    expect(current.focusRequest).toBe("preview");
  });

  it("プレビューの解析が失敗すると入力の画面のまま、エラーを出し、フォーカスを変えない", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText("- \n*"));
    act(() => hook.result.current.consumeFocusRequest());

    act(() => hook.result.current.requestPreview());

    const current = hook.result.current;
    expect(current.screen).toBe("input");
    expect(current.inputError.message).toBe(NO_ITEMS_MESSAGE);
    expect(current.focusRequest).toBeNull();
    expect(current.outline).toBeNull();
    expect(current.preview).toBeNull();
  });

  it("戻るとテキストを残して入力の画面へ戻り、解析の結果とダイアログ内の通知を捨てる", () => {
    const hook = renderOutlineImport({
      insertForest: createInsertForest({ ok: false, reason: "invalid-items" }),
    });
    openPreview(hook);
    act(() => hook.result.current.submit());
    const before = hook.result.current.dialogNotices.sequence;

    act(() => hook.result.current.back());

    const current = hook.result.current;
    expect(current.screen).toBe("input");
    expect(current.text).toBe(THREE_ITEMS);
    expect(current.outline).toBeNull();
    expect(current.preview).toBeNull();
    expect(current.dialogNotices).toEqual({
      sequence: before + 1,
      status: null,
      alert: null,
    });
    expect(current.focusRequest).toBe("input");
  });

  it("閉じるとテキストを残して閉じ、ヘッダーへフォーカスを求める", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText(THREE_ITEMS));
    const before = hook.result.current.dialogNotices.sequence;

    act(() => hook.result.current.close());

    const current = hook.result.current;
    expect(current.screen).toBe("closed");
    expect(current.text).toBe(THREE_ITEMS);
    expect(current.outline).toBeNull();
    expect(current.preview).toBeNull();
    expect(current.dialogNotices).toEqual({
      sequence: before + 1,
      status: null,
      alert: null,
    });
    expect(current.focusRequest).toBe("header");
  });

  it("追加が成功すると閉じ、テキストを空にし、成功の通知を出す", () => {
    const insertForest = createInsertForest();
    const hook = renderOutlineImport({ insertForest });
    openPreview(hook);

    act(() => hook.result.current.submit());

    const current = hook.result.current;
    expect(insertForest).toHaveBeenCalledTimes(1);
    expect(insertForest).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: "親" })]),
      { kind: "root" },
    );
    expect(insertForest.mock.calls[0][0]).toHaveLength(3);
    expect(current.screen).toBe("closed");
    expect(current.text).toBe("");
    expect(current.textLength).toBe(0);
    expect(current.outline).toBeNull();
    expect(current.preview).toBeNull();
    expect(current.focusRequest).toBe("header");
    expect(current.notice).toEqual({ kind: "status", message: SUCCESS_MESSAGE });
  });

  it("追加が失敗するとプレビューの画面のまま、ダイアログ内に理由を出す", () => {
    const hook = renderOutlineImport({
      insertForest: createInsertForest({ ok: false, reason: "placement-failed" }),
    });
    openPreview(hook);
    act(() => hook.result.current.consumeFocusRequest());
    const before = hook.result.current.dialogNotices.sequence;

    act(() => hook.result.current.submit());

    const current = hook.result.current;
    expect(current.screen).toBe("preview");
    expect(current.text).toBe(THREE_ITEMS);
    expect(current.dialogNotices).toEqual({
      sequence: before + 1,
      status: null,
      alert: INSERT_FAILED_MESSAGE,
    });
    expect(current.focusRequest).toBeNull();
    expect(current.notice).toBeNull();
  });
});

describe("useOutlineImport のテキストと追加先", () => {
  it("テキストは閉じても残り、追加の成功で空になる", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText(THREE_ITEMS));
    act(() => hook.result.current.close());

    act(() => hook.result.current.open());
    expect(hook.result.current.text).toBe(THREE_ITEMS);
    expect(hook.result.current.textLength).toBe(THREE_ITEMS.length);

    act(() => hook.result.current.requestPreview());
    act(() => hook.result.current.submit());
    act(() => hook.result.current.open());
    expect(hook.result.current.text).toBe("");
  });

  it("開くたびに追加先が新しいルートに戻る", () => {
    const hook = renderOutlineImport({ selectedNodeId: 5 });
    act(() => hook.result.current.open());
    act(() => hook.result.current.setTarget("child"));
    expect(hook.result.current.target).toBe("child");
    act(() => hook.result.current.close());

    act(() => hook.result.current.open());

    expect(hook.result.current.target).toBe("root");
  });

  it("追加先の候補は開いた時点の選択で、後から選択が変わっても変えない", () => {
    const insertForest = createInsertForest();
    const hook = renderOutlineImport({ selectedNodeId: 5, insertForest });
    act(() => hook.result.current.open());
    hook.rerender({ ...hook.props, selectedNodeId: 7 });
    expect(hook.result.current.parentCandidateId).toBe(5);

    act(() => hook.result.current.setText(THREE_ITEMS));
    act(() => hook.result.current.requestPreview());
    act(() => hook.result.current.setTarget("child"));
    act(() => hook.result.current.submit());

    expect(insertForest).toHaveBeenCalledTimes(1);
    expect(insertForest.mock.calls[0][1]).toEqual({ kind: "child", parentId: 5 });
  });

  it("子として追加して親が無いと返されたときは、プレビューの画面のまま理由を出す", () => {
    const expandNodes = createExpandNodes();
    const hook = renderOutlineImport({
      selectedNodeId: 5,
      insertForest: createInsertForest({ ok: false, reason: "parent-missing" }),
      expandNodes,
    });
    openPreview(hook);
    act(() => hook.result.current.setTarget("child"));

    act(() => hook.result.current.submit());

    expect(hook.result.current.screen).toBe("preview");
    expect(hook.result.current.dialogNotices.alert).toBe(PARENT_MISSING_MESSAGE);
    expect(expandNodes).not.toHaveBeenCalled();
  });

  it("選択が無いまま子を選んで確定すると、insertForest を呼ばずに親が無い失敗にする", () => {
    const insertForest = createInsertForest();
    const hook = renderOutlineImport({ selectedNodeId: null, insertForest });
    openPreview(hook);
    act(() => hook.result.current.setTarget("child"));

    act(() => hook.result.current.submit());

    expect(insertForest).not.toHaveBeenCalled();
    expect(hook.result.current.screen).toBe("preview");
    expect(hook.result.current.dialogNotices.alert).toBe(PARENT_MISSING_MESSAGE);
  });

  it("開いている間にマップが置き換わると、同じ ID が残っていても子として追加しない（L-037）", () => {
    const insertForest = createInsertForest();
    const expandNodes = createExpandNodes();
    const hook = renderOutlineImport({
      selectedNodeId: 5,
      documentRevision: 0,
      insertForest,
      expandNodes,
    });
    openPreview(hook);
    act(() => hook.result.current.setTarget("child"));
    expect(hook.result.current.parentCandidateStale).toBe(false);

    hook.rerender({ ...hook.props, documentRevision: 1 });
    expect(hook.result.current.parentCandidateStale).toBe(true);
    const before = hook.result.current.dialogNotices.sequence;

    act(() => hook.result.current.submit());

    expect(insertForest).not.toHaveBeenCalled();
    expect(expandNodes).not.toHaveBeenCalled();
    expect(hook.result.current.screen).toBe("preview");
    expect(hook.result.current.dialogNotices).toEqual({
      sequence: before + 1,
      status: null,
      alert: PARENT_MISSING_MESSAGE,
    });

    act(() => hook.result.current.setTarget("root"));
    act(() => hook.result.current.submit());

    expect(insertForest).toHaveBeenCalledTimes(1);
    expect(insertForest.mock.calls[0][1]).toEqual({ kind: "root" });
    expect(hook.result.current.screen).toBe("closed");
  });

  it("閉じて開き直すと、親の候補は古くないものに戻る", () => {
    const hook = renderOutlineImport({ selectedNodeId: 5, documentRevision: 0 });
    act(() => hook.result.current.open());
    hook.rerender({ ...hook.props, documentRevision: 1 });
    expect(hook.result.current.parentCandidateStale).toBe(true);

    act(() => hook.result.current.close());
    expect(hook.result.current.parentCandidateStale).toBe(false);
    act(() => hook.result.current.open());

    expect(hook.result.current.parentCandidateStale).toBe(false);
  });

  it("子としての追加の成功でだけ親を展開する", () => {
    const expandNodes = createExpandNodes();
    const hook = renderOutlineImport({ selectedNodeId: 5, expandNodes });
    openPreview(hook);
    act(() => hook.result.current.setTarget("child"));
    act(() => hook.result.current.submit());

    expect(expandNodes).toHaveBeenCalledTimes(1);
    expect(expandNodes).toHaveBeenCalledWith([5]);
  });

  it("新しいルートとしての追加の成功では親を展開しない", () => {
    const expandNodes = createExpandNodes();
    const hook = renderOutlineImport({ selectedNodeId: 5, expandNodes });
    openPreview(hook);
    act(() => hook.result.current.submit());

    expect(hook.result.current.screen).toBe("closed");
    expect(expandNodes).not.toHaveBeenCalled();
  });

  it("子としての追加が失敗したときは親を展開しない", () => {
    const expandNodes = createExpandNodes();
    const hook = renderOutlineImport({
      selectedNodeId: 5,
      insertForest: createInsertForest({ ok: false, reason: "invalid-items" }),
      expandNodes,
    });
    openPreview(hook);
    act(() => hook.result.current.setTarget("child"));
    act(() => hook.result.current.submit());

    expect(expandNodes).not.toHaveBeenCalled();
  });

  it("プレビューの画面でないときの確定は何もしない", () => {
    const insertForest = createInsertForest();
    const hook = renderOutlineImport({ insertForest });
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText(THREE_ITEMS));
    const before = hook.result.current;

    act(() => hook.result.current.submit());

    expect(insertForest).not.toHaveBeenCalled();
    expect(hook.result.current.screen).toBe("input");
    expect(hook.result.current.dialogNotices).toBe(before.dialogNotices);
  });

  it("プレビューの画面から閉じた後の確定は何もしない", () => {
    const insertForest = createInsertForest();
    const hook = renderOutlineImport({ insertForest });
    openPreview(hook);
    act(() => hook.result.current.close());
    // 閉じたら解析の結果を捨てる（preview の画面のときだけ null でない）
    expect(hook.result.current.outline).toBeNull();
    expect(hook.result.current.preview).toBeNull();

    act(() => hook.result.current.submit());

    expect(insertForest).not.toHaveBeenCalled();
    expect(hook.result.current.screen).toBe("closed");
    expect(hook.result.current.notice).toBeNull();
  });
});

describe("useOutlineImport の入力のエラー", () => {
  it("同じ解析のエラーが続いても、そのたびに sequence を進める", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText("- "));
    const start = hook.result.current.inputError.sequence;

    act(() => hook.result.current.requestPreview());
    expect(hook.result.current.inputError).toEqual({
      sequence: start + 1,
      message: NO_ITEMS_MESSAGE,
    });

    act(() => hook.result.current.requestPreview());
    expect(hook.result.current.inputError).toEqual({
      sequence: start + 2,
      message: NO_ITEMS_MESSAGE,
    });
  });

  it("上限以下の入力を続けても sequence を進めない", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    const start = hook.result.current.inputError;

    act(() => hook.result.current.setText("a"));
    act(() => hook.result.current.setText("ab"));
    act(() => hook.result.current.setText("a".repeat(1_000_000)));

    expect(hook.result.current.inputError).toEqual(start);
  });

  it("上限を超えたときに1回だけ進め、超えたまま入力しても進めない", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText("a".repeat(1_000_000)));
    const start = hook.result.current.inputError.sequence;

    act(() => hook.result.current.setText("a".repeat(1_000_001)));
    expect(hook.result.current.inputError).toEqual({
      sequence: start + 1,
      message: TOO_LONG_MESSAGE,
    });
    expect(hook.result.current.textLength).toBe(1_000_001);

    act(() => hook.result.current.setText("a".repeat(1_000_002)));
    expect(hook.result.current.inputError).toEqual({
      sequence: start + 1,
      message: TOO_LONG_MESSAGE,
    });
  });

  it("上限以下に戻すと1回だけ進め、文言を消す", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText("a".repeat(1_000_001)));
    const start = hook.result.current.inputError.sequence;

    act(() => hook.result.current.setText("a".repeat(1_000_000)));

    expect(hook.result.current.inputError).toEqual({
      sequence: start + 1,
      message: null,
    });
  });

  it("行数の上限のエラーの後にテキストを変えると、1回だけ進めて文言を消す", () => {
    const hook = renderOutlineImport();
    const tooManyLines = "a\n".repeat(10_001);
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText(tooManyLines));
    act(() => hook.result.current.requestPreview());
    expect(hook.result.current.inputError.message).toBe(
      "行が多すぎます（空行を除いて10,000行以内）。現在 10,001 行です。",
    );
    const start = hook.result.current.inputError.sequence;

    act(() => hook.result.current.setText(`${tooManyLines}b`));

    expect(hook.result.current.inputError).toEqual({
      sequence: start + 1,
      message: null,
    });
  });

  it("テキストの変更では解析しない", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());

    act(() => hook.result.current.setText(THREE_ITEMS));
    act(() => hook.result.current.setText("a".repeat(1_000_001)));

    expect(parseOutlineTextMock).not.toHaveBeenCalled();
  });

  it("プレビューの成功では、消えているエラーの sequence を進めない", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText("- "));
    act(() => hook.result.current.requestPreview());
    act(() => hook.result.current.setText(THREE_ITEMS));
    act(() => hook.result.current.requestPreview());
    // 解析のエラーの後のテキストの変更で消えているので、成功では進めない
    const cleared = hook.result.current.inputError;
    expect(cleared.message).toBeNull();

    act(() => hook.result.current.back());
    act(() => hook.result.current.requestPreview());

    expect(hook.result.current.inputError).toEqual(cleared);
  });

  it("文字数の上限を超えたままプレビューを押すと、同じ文言のまま sequence を進める", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText("a".repeat(1_000_001)));
    const start = hook.result.current.inputError.sequence;

    act(() => hook.result.current.requestPreview());

    expect(hook.result.current.screen).toBe("input");
    expect(hook.result.current.inputError).toEqual({
      sequence: start + 1,
      message: TOO_LONG_MESSAGE,
    });
  });
});

describe("useOutlineImport の解析とフォーカス", () => {
  it("プレビューの要求で1回だけ解析し、再描画では解析しない", () => {
    const hook = renderOutlineImport();
    act(() => hook.result.current.open());
    act(() => hook.result.current.setText(THREE_ITEMS));

    act(() => hook.result.current.requestPreview());
    hook.rerender({ ...hook.props, selectedNodeId: 3 });

    expect(parseOutlineTextMock).toHaveBeenCalledTimes(1);
    expect(parseOutlineTextMock).toHaveBeenCalledWith(THREE_ITEMS);
  });

  it("プレビューの画面でのプレビューの要求は、解析せず画面も変えない", () => {
    const hook = renderOutlineImport();
    openPreview(hook);
    const before = hook.result.current;
    expect(parseOutlineTextMock).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.requestPreview());

    expect(parseOutlineTextMock).toHaveBeenCalledTimes(1);
    expect(hook.result.current.screen).toBe("preview");
    expect(hook.result.current.outline).toBe(before.outline);
    expect(hook.result.current.inputError).toBe(before.inputError);
  });

  it("プレビューは今の解析の結果から1回だけ作り、解析の結果が同じ間は作り直さない", () => {
    const hook = renderOutlineImport();
    openPreview(hook);
    const first = hook.result.current;

    expect(buildOutlinePreviewMock).toHaveBeenCalledTimes(1);
    expect(buildOutlinePreviewMock).toHaveBeenLastCalledWith(first.outline);

    act(() => hook.result.current.setTarget("child"));
    hook.rerender({ ...hook.props, selectedNodeId: 3, documentRevision: 1 });

    expect(buildOutlinePreviewMock).toHaveBeenCalledTimes(1);
    expect(hook.result.current.outline).toBe(first.outline);
    expect(hook.result.current.preview).toBe(first.preview);
  });

  it("解析の結果を捨てる遷移では、プレビューも同時に無くなる", () => {
    const hook = renderOutlineImport();
    const expectPairedWithOutline = () => {
      const { outline, preview } = hook.result.current;
      expect(preview === null).toBe(outline === null);
    };

    openPreview(hook);
    expectPairedWithOutline();
    act(() => hook.result.current.back());
    expectPairedWithOutline();
    act(() => hook.result.current.requestPreview());
    expectPairedWithOutline();
    act(() => hook.result.current.close());
    expectPairedWithOutline();
    expect(hook.result.current.preview).toBeNull();
  });

  it("プレビューの件数は解析の件数と一致し、フォーカスの要求は消せる", () => {
    const hook = renderOutlineImport();
    openPreview(hook);

    expect(hook.result.current.preview?.totalCount).toBe(3);
    expect(hook.result.current.outline?.items).toHaveLength(3);
    expect(hook.result.current.focusRequest).toBe("preview");

    act(() => hook.result.current.consumeFocusRequest());

    expect(hook.result.current.focusRequest).toBeNull();
  });
});

describe("useOutlineImport の成功の通知", () => {
  it("成功の通知は documentRevision が変わると消える", () => {
    const hook = renderOutlineImport({ documentRevision: 0 });
    openPreview(hook);
    act(() => hook.result.current.submit());
    expect(hook.result.current.notice?.message).toBe(SUCCESS_MESSAGE);

    hook.rerender({ ...hook.props, documentRevision: 1 });

    expect(hook.result.current.notice).toBeNull();
  });

  it("マップの置き換えの後の追加でも、通知は今の documentRevision で出す", () => {
    const hook = renderOutlineImport({ documentRevision: 0 });
    openPreview(hook);
    hook.rerender({ ...hook.props, documentRevision: 1 });

    act(() => hook.result.current.submit());

    expect(hook.result.current.notice?.message).toBe(SUCCESS_MESSAGE);
  });
});

describe("useOutlineImport の関数の参照", () => {
  it("選択と insertForest が変わっても、返す関数の参照を変えない（L-521）", () => {
    const hook = renderOutlineImport({ selectedNodeId: 5 });
    const before = hook.result.current;

    hook.rerender({
      ...hook.props,
      selectedNodeId: 7,
      insertForest: createInsertForest(),
      expandNodes: createExpandNodes(),
      documentRevision: 1,
    });

    const after = hook.result.current;
    expect(after.open).toBe(before.open);
    expect(after.submit).toBe(before.submit);
    expect(after.close).toBe(before.close);
    expect(after.setText).toBe(before.setText);
    expect(after.requestPreview).toBe(before.requestPreview);
    expect(after.back).toBe(before.back);
    expect(after.setTarget).toBe(before.setTarget);
    expect(after.consumeFocusRequest).toBe(before.consumeFocusRequest);
  });

  it("再描画の後に開くと、最新の選択を候補にし、最新の insertForest を呼ぶ", () => {
    const first = createInsertForest();
    const latest = createInsertForest();
    const hook = renderOutlineImport({ selectedNodeId: 5, insertForest: first });
    const nextProps = { ...hook.props, selectedNodeId: 7, insertForest: latest };
    hook.rerender(nextProps);

    act(() => hook.result.current.open());
    expect(hook.result.current.parentCandidateId).toBe(7);
    act(() => hook.result.current.setText(THREE_ITEMS));
    act(() => hook.result.current.requestPreview());
    act(() => hook.result.current.setTarget("child"));
    act(() => hook.result.current.submit());

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith(expect.any(Array), { kind: "child", parentId: 7 });
  });
});
