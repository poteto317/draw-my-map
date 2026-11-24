import { act, renderHook } from "@testing-library/react";
import type {
  ForestInsertionTarget,
  ForestItem,
} from "@/domain/nodes/nodeForestInsertion";
import { EXCHANGE_MAX_TEXT_LENGTH } from "@/domain/exchange/exchangeLimits";
import { OUTLINE_TOO_LONG_MESSAGE } from "@/domain/outline/outlineMessages";
import {
  defaultDelimiterFromFileName,
  parseExchangeContent,
} from "@/domain/exchange/parseExchangeContent";
import type { InsertForestResult } from "@/hooks/useNodes";
import {
  useExchangeImport,
  type UseExchangeImportOptions,
} from "@/hooks/useExchangeImport";

jest.mock("@/domain/exchange/parseExchangeContent", () => {
  const actual = jest.requireActual("@/domain/exchange/parseExchangeContent");
  return {
    ...actual,
    parseExchangeContent: jest.fn(actual.parseExchangeContent),
    defaultDelimiterFromFileName: jest.fn(actual.defaultDelimiterFromFileName),
  };
});

const parseExchangeContentMock = jest.mocked(parseExchangeContent);
const defaultDelimiterMock = jest.mocked(defaultDelimiterFromFileName);

const OPML_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0"><body>
  <outline text="親"><outline text="子"/></outline>
</body></opml>`;

const CSV_TEXT = `id,parentId,label,importance,note,tags
1,,親,medium,,
2,1,子,medium,,`;

const SUCCESS: InsertForestResult = { ok: true, rootId: 100, count: 2 };
const SUCCESS_MESSAGE =
  "2件のノードを追加しました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。";
const PARENT_MISSING_MESSAGE =
  "選択していたノードが見つからないため、追加できませんでした。「新しいルートとして追加」を選び直してください。";
const INSERT_FAILED_MESSAGE =
  "ノードを追加できませんでした。マップは変わっていません。";
const PARSE_FAIL_MESSAGE = "取り込める内容がありません。ファイルを選び直してください。";

function createInsertForest(result: InsertForestResult = SUCCESS) {
  return jest.fn<InsertForestResult, [readonly ForestItem[], ForestInsertionTarget]>(
    () => result,
  );
}

function createExpandNodes() {
  return jest.fn<void, [readonly number[]]>();
}

function renderExchangeImport(overrides: Partial<UseExchangeImportOptions> = {}) {
  const initialProps: UseExchangeImportOptions = {
    selectedNodeId: null,
    documentRevision: 0,
    insertForest: createInsertForest(),
    expandNodes: createExpandNodes(),
    ...overrides,
  };
  const hook = renderHook(
    (props: UseExchangeImportOptions) => useExchangeImport(props),
    { initialProps },
  );
  return { ...hook, props: initialProps };
}

type Hook = ReturnType<typeof renderExchangeImport>;

function openOpmlInput(hook: Hook) {
  act(() => hook.result.current.open("opml"));
}

function loadFile(hook: Hook, fileName: string, text: string) {
  act(() => hook.result.current.setFile(fileName, text));
}

function openOpmlPreview(hook: Hook) {
  openOpmlInput(hook);
  loadFile(hook, "tree.opml", OPML_TEXT);
  act(() => hook.result.current.requestPreview());
}

beforeEach(() => {
  parseExchangeContentMock.mockClear();
  defaultDelimiterMock.mockClear();
});

describe("useExchangeImport の画面遷移", () => {
  it("OPML で開くと入力画面になり、フォーカスをファイル入力へ求める", () => {
    const hook = renderExchangeImport({ selectedNodeId: 3 });
    act(() => hook.result.current.open("opml"));
    expect(hook.result.current.screen).toBe("input");
    expect(hook.result.current.entry).toBe("opml");
    expect(hook.result.current.parentCandidateId).toBe(3);
    expect(hook.result.current.focusRequest).toBe("input");
  });

  it("プレビュー解析が成功するとプレビュー画面へ移る", () => {
    const hook = renderExchangeImport();
    openOpmlPreview(hook);
    expect(hook.result.current.screen).toBe("preview");
    expect(hook.result.current.parsed?.items).toHaveLength(2);
    expect(hook.result.current.preview?.totalCount).toBe(2);
    expect(hook.result.current.focusRequest).toBe("preview");
  });

  it("解析失敗は入力画面のままエラーを出す", () => {
    const hook = renderExchangeImport();
    openOpmlInput(hook);
    loadFile(hook, "empty.opml", " ");
    act(() => hook.result.current.requestPreview());
    expect(hook.result.current.screen).toBe("input");
    expect(hook.result.current.inputError.message).toBe(PARSE_FAIL_MESSAGE);
    expect(hook.result.current.parsed).toBeNull();
  });

  it("確定成功で閉じ、通知を出し、ファイル内容をクリアする", () => {
    const insertForest = createInsertForest();
    const hook = renderExchangeImport({ insertForest });
    openOpmlPreview(hook);
    act(() => hook.result.current.submit());
    expect(insertForest).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ label: "親" })]),
      { kind: "root" },
    );
    expect(hook.result.current.screen).toBe("closed");
    expect(hook.result.current.fileName).toBeNull();
    expect(hook.result.current.fileText).toBe("");
    expect(hook.result.current.notice).toEqual({ kind: "status", message: SUCCESS_MESSAGE });
  });

  it("確定失敗はプレビューに alert を出す", () => {
    const hook = renderExchangeImport({
      insertForest: createInsertForest({ ok: false, reason: "placement-failed" }),
    });
    openOpmlPreview(hook);
    act(() => hook.result.current.submit());
    expect(hook.result.current.screen).toBe("preview");
    expect(hook.result.current.dialogNotices.alert).toBe(INSERT_FAILED_MESSAGE);
  });
});

describe("useExchangeImport の CSV 区切り", () => {
  it("拡張子 .tsv ではタブを既定にする", () => {
    const hook = renderExchangeImport();
    act(() => hook.result.current.open("csv-tsv"));
    act(() => hook.result.current.setFile("data.tsv", CSV_TEXT.replaceAll(",", "\t")));
    expect(defaultDelimiterMock).toHaveBeenCalledWith("data.tsv");
    expect(hook.result.current.delimiter).toBe("\t");
  });

  it("ダイアログで区切りを上書きできる", () => {
    const hook = renderExchangeImport();
    act(() => hook.result.current.open("csv-tsv"));
    loadFile(hook, "data.csv", CSV_TEXT);
    act(() => hook.result.current.setDelimiter("\t"));
    expect(hook.result.current.delimiter).toBe("\t");
    act(() => hook.result.current.requestPreview());
    expect(parseExchangeContentMock).toHaveBeenLastCalledWith(
      CSV_TEXT,
      "csv-tsv",
      "\t",
    );
  });
});

describe("useExchangeImport の上限", () => {
  it("setFile で文字数超過を入力エラーにする", () => {
    const hook = renderExchangeImport();
    openOpmlInput(hook);
    loadFile(hook, "big.opml", "a".repeat(EXCHANGE_MAX_TEXT_LENGTH + 1));
    expect(hook.result.current.inputError.message).toBe(OUTLINE_TOO_LONG_MESSAGE);
  });

  it("requestPreview は文字数超過で parse せずエラーを出す", () => {
    const hook = renderExchangeImport();
    openOpmlInput(hook);
    loadFile(hook, "big.opml", "a".repeat(EXCHANGE_MAX_TEXT_LENGTH + 1));
    act(() => hook.result.current.requestPreview());
    expect(parseExchangeContentMock).not.toHaveBeenCalled();
    expect(hook.result.current.screen).toBe("input");
    expect(hook.result.current.inputError.message).toBe(OUTLINE_TOO_LONG_MESSAGE);
  });
});

describe("useExchangeImport の追加先", () => {
  it("子として追加し、開いた時点の親 ID を使う", () => {
    const insertForest = createInsertForest();
    const expandNodes = createExpandNodes();
    const hook = renderExchangeImport({ selectedNodeId: 5, insertForest, expandNodes });
    openOpmlPreview(hook);
    act(() => hook.result.current.setTarget("child"));
    act(() => hook.result.current.submit());
    expect(insertForest.mock.calls[0]![1]).toEqual({ kind: "child", parentId: 5 });
    expect(expandNodes).toHaveBeenCalledWith([5]);
  });

  it("親が無いとき child 確定は insertForest を呼ばない", () => {
    const insertForest = createInsertForest();
    const hook = renderExchangeImport({ selectedNodeId: null, insertForest });
    openOpmlPreview(hook);
    act(() => hook.result.current.setTarget("child"));
    act(() => hook.result.current.submit());
    expect(insertForest).not.toHaveBeenCalled();
    expect(hook.result.current.dialogNotices.alert).toBe(PARENT_MISSING_MESSAGE);
  });
});

describe("useExchangeImport のプレビュー情報", () => {
  it("OPML は lossy 案内フラグを立てる", () => {
    const hook = renderExchangeImport();
    openOpmlPreview(hook);
    expect(hook.result.current.parsed?.showOpmlLossyNotice).toBe(true);
  });

  it("CSV の warnings を保持する", () => {
    const hook = renderExchangeImport();
    act(() => hook.result.current.open("csv-tsv"));
    const csv = `id,parentId,label,importance,note,tags
1,,A,foo,,`;
    loadFile(hook, "a.csv", csv);
    act(() => hook.result.current.requestPreview());
    expect(hook.result.current.parsed?.warnings.length).toBeGreaterThan(0);
    expect(hook.result.current.parsed?.showOpmlLossyNotice).toBe(false);
  });
});

describe("useExchangeImport の親候補と revision", () => {
  it("開いている間にマップが置き換わると、同じ ID が残っていても子として追加しない（L-037）", () => {
    const insertForest = createInsertForest();
    const expandNodes = createExpandNodes();
    const hook = renderExchangeImport({
      selectedNodeId: 5,
      documentRevision: 0,
      insertForest,
      expandNodes,
    });
    openOpmlPreview(hook);
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
    expect(insertForest.mock.calls[0]![1]).toEqual({ kind: "root" });
    expect(hook.result.current.screen).toBe("closed");
  });

  it("閉じて開き直すと、親の候補は古くないものに戻る", () => {
    const hook = renderExchangeImport({ selectedNodeId: 5, documentRevision: 0 });
    act(() => hook.result.current.open("opml"));
    hook.rerender({ ...hook.props, documentRevision: 1 });
    expect(hook.result.current.parentCandidateStale).toBe(true);

    act(() => hook.result.current.close());
    expect(hook.result.current.parentCandidateStale).toBe(false);
    act(() => hook.result.current.open("opml"));

    expect(hook.result.current.parentCandidateStale).toBe(false);
  });
});

describe("useExchangeImport の成功の通知", () => {
  it("成功の通知は documentRevision が変わると消える", () => {
    const hook = renderExchangeImport({ documentRevision: 0 });
    openOpmlPreview(hook);
    act(() => hook.result.current.submit());
    expect(hook.result.current.notice?.message).toBe(SUCCESS_MESSAGE);

    hook.rerender({ ...hook.props, documentRevision: 1 });

    expect(hook.result.current.notice).toBeNull();
  });

  it("マップの置き換えの後の追加でも、通知は今の documentRevision で出す", () => {
    const hook = renderExchangeImport({ documentRevision: 0 });
    openOpmlPreview(hook);
    hook.rerender({ ...hook.props, documentRevision: 1 });

    act(() => hook.result.current.submit());

    expect(hook.result.current.notice?.message).toBe(SUCCESS_MESSAGE);
  });
});