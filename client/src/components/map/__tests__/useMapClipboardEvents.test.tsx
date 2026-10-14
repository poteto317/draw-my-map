import { renderHook } from "@testing-library/react";
import { useMapClipboardEvents } from "@/components/map/useMapClipboardEvents";
import {
  MAX_SUBTREE_CLIPBOARD_LENGTH,
  decodeSubtreeClipboard,
  encodeSubtreeClipboard,
  type SubtreeClipboardData,
  type SubtreeClipboardResult,
} from "@/domain/clipboard/subtreeClipboardCodec";
import { createTestNode } from "@/testing/createTestNode";
import type { OperationNotice } from "@/types/operationNotice";

const COPY_SUCCESS: OperationNotice = { kind: "status", message: "枝をコピーしました。" };
const PASTE_SUCCESS: OperationNotice = {
  kind: "status",
  message: "枝を貼り付けました。見えない場合は表示を『すべて』に切り替えてください。",
};
const COPY_FAILURE: OperationNotice = { kind: "error", message: "枝をコピーできませんでした。" };
const PASTE_INVALID: OperationNotice = { kind: "error", message: "貼り付ける枝データが無効です。" };
const TOO_LARGE: OperationNotice = {
  kind: "error",
  message: "枝データが大きすぎます（10,000ノード・5,000,000文字以内）。",
};
const PASTE_FAILURE: OperationNotice = { kind: "error", message: "枝を貼り付けできませんでした。" };

const SOURCE_NODES = [
  createTestNode({ id: 1, label: "親" }),
  createTestNode({ id: 2, parentId: 1, x: 200, label: "子" }),
];
const encoded = encodeSubtreeClipboard(SOURCE_NODES, 1);
if (!encoded.ok) throw new Error("テスト用の枝データを作れない");
const CLIPBOARD_TEXT = encoded.value;
const decoded = decodeSubtreeClipboard(CLIPBOARD_TEXT);
if (!decoded.ok) throw new Error("テスト用の枝データを読めない");
const CLIPBOARD_DATA = decoded.value;

type ClipboardDataStub = {
  setData: jest.Mock<void, [string, string]>;
  getData: jest.Mock<string, [string]>;
};

function clipboardData(text = CLIPBOARD_TEXT): ClipboardDataStub {
  return {
    setData: jest.fn<void, [string, string]>(),
    getData: jest.fn<string, [string]>(() => text),
  };
}

// jsdomにはClipboardEventもDataTransferも無いため、Eventへ clipboardData を付けて送る。
// data を省くと clipboardData を持たないイベントになる
function dispatchClipboard(
  type: "copy" | "paste",
  data?: ClipboardDataStub,
  target: EventTarget = document.body,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (data !== undefined) Object.defineProperty(event, "clipboardData", { value: data });
  target.dispatchEvent(event);
  return event;
}

type Options = Parameters<typeof useMapClipboardEvents>[0];

function setup(overrides: Partial<Options> = {}) {
  const options: Options = {
    selectedNodeId: 1,
    isEditing: false,
    hasActiveGesture: () => false,
    copySubtree: jest.fn<SubtreeClipboardResult<string>, [number]>(
      () => ({ ok: true, value: CLIPBOARD_TEXT }),
    ),
    pasteSubtree: jest.fn<number | null, [SubtreeClipboardData]>(() => 10),
    publishNotice: jest.fn<void, [OperationNotice]>(),
    ...overrides,
  };
  const rendered = renderHook((props: Options) => useMapClipboardEvents(props), {
    initialProps: options,
  });
  return { options, ...rendered };
}

function appendElement<T extends HTMLElement>(element: T, parent: HTMLElement = document.body): T {
  parent.appendChild(element);
  return element;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("useMapClipboardEvents のコピー", () => {
  it("選択ノードの枝を text/plain へ書き込み、既定動作を止めて成功を通知する", () => {
    const { options } = setup();
    const data = clipboardData();

    const event = dispatchClipboard("copy", data);

    expect(options.copySubtree).toHaveBeenCalledTimes(1);
    expect(options.copySubtree).toHaveBeenCalledWith(1);
    expect(data.setData).toHaveBeenCalledTimes(1);
    expect(data.setData).toHaveBeenCalledWith("text/plain", CLIPBOARD_TEXT);
    expect(event.defaultPrevented).toBe(true);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(COPY_SUCCESS);
  });

  it("選択が無ければ何もせず、ブラウザに任せる", () => {
    const { options } = setup({ selectedNodeId: null });
    const data = clipboardData();

    const event = dispatchClipboard("copy", data);

    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(data.setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(options.publishNotice).not.toHaveBeenCalled();
  });

  it("上限超過では setData せず、既定動作を止めずに上限の文言で通知する", () => {
    const { options } = setup({
      copySubtree: jest.fn(() => ({ ok: false, reason: "too-large" }) as const),
    });
    const data = clipboardData();

    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: data });

    expect(document.body.dispatchEvent(event)).toBe(true);
    expect(data.setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(TOO_LARGE);
  });

  it("枝データを作れなければ setData せず、既定動作を止めずにコピー失敗を通知する", () => {
    const { options } = setup({
      copySubtree: jest.fn(() => ({ ok: false, reason: "invalid" }) as const),
    });
    const data = clipboardData();

    const event = dispatchClipboard("copy", data);

    expect(data.setData).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(options.publishNotice).toHaveBeenCalledWith(COPY_FAILURE);
  });

  it("clipboardData が無ければ、既定動作を止めずにコピー失敗を通知する", () => {
    const { options } = setup();

    const event = dispatchClipboard("copy");

    expect(event.defaultPrevented).toBe(false);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(COPY_FAILURE);
  });

  it("setData が例外を投げたら、既定動作を止めずにコピー失敗を通知する", () => {
    const { options } = setup();
    const data = clipboardData();
    data.setData.mockImplementation(() => {
      throw new Error("denied");
    });

    const event = dispatchClipboard("copy", data);

    expect(event.defaultPrevented).toBe(false);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(COPY_FAILURE);
  });
});

describe("useMapClipboardEvents の貼り付け", () => {
  it("text/plain を検証して1回だけ挿入し、既定動作を止めて成功を通知する", () => {
    const { options } = setup();
    const data = clipboardData();

    const event = dispatchClipboard("paste", data);

    expect(data.getData).toHaveBeenCalledWith("text/plain");
    expect(options.pasteSubtree).toHaveBeenCalledTimes(1);
    expect(options.pasteSubtree).toHaveBeenCalledWith(CLIPBOARD_DATA);
    expect(event.defaultPrevented).toBe(true);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(PASTE_SUCCESS);
  });

  it("選択が無くても貼り付ける", () => {
    const { options } = setup({ selectedNodeId: null });

    dispatchClipboard("paste", clipboardData());

    expect(options.pasteSubtree).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(PASTE_SUCCESS);
  });

  it("連続した paste イベントでは、そのつど1回ずつ貼り付ける", () => {
    const { options } = setup();

    for (let count = 0; count < 3; count += 1) {
      expect(dispatchClipboard("paste", clipboardData()).defaultPrevented).toBe(true);
    }

    expect(options.pasteSubtree).toHaveBeenCalledTimes(3);
    expect(options.publishNotice).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["普通の文章", "こんにちは"],
    ["マップのJSON", JSON.stringify({ version: 3, layoutMode: "manual", nodes: [] })],
    ["根が2つの枝", JSON.stringify({
      type: "draw-my-map/subtree",
      version: 1,
      nodes: [
        { id: 1, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "", importance: "medium" },
        { id: 2, parentId: null, x: 0, y: 0, width: 100, height: 60, label: "", importance: "medium" },
      ],
    })],
  ])("%sは挿入せず、無効データとして通知する", (_name, text) => {
    const { options } = setup();

    const event = dispatchClipboard("paste", clipboardData(text));

    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(PASTE_INVALID);
  });

  it("上限を超える文字数は挿入せず、上限の文言で通知する", () => {
    const { options } = setup();

    dispatchClipboard("paste", clipboardData("x".repeat(MAX_SUBTREE_CLIPBOARD_LENGTH + 1)));

    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(TOO_LARGE);
  });

  it("clipboardData が無ければ、既定動作を止めて貼り付け失敗を通知する", () => {
    const { options } = setup();

    const event = dispatchClipboard("paste");

    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(options.publishNotice).toHaveBeenCalledWith(PASTE_FAILURE);
  });

  it("getData が例外を投げたら、貼り付け失敗を通知する", () => {
    const { options } = setup();
    const data = clipboardData();
    data.getData.mockImplementation(() => {
      throw new Error("denied");
    });

    const event = dispatchClipboard("paste", data);

    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(PASTE_FAILURE);
  });

  it("挿入できなければ、成功を通知せず貼り付け失敗を通知する", () => {
    const { options } = setup({ pasteSubtree: jest.fn(() => null) });

    dispatchClipboard("paste", clipboardData());

    expect(options.pasteSubtree).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledTimes(1);
    expect(options.publishNotice).toHaveBeenCalledWith(PASTE_FAILURE);
  });
});

describe("useMapClipboardEvents の対象判定", () => {
  function expectIgnored(options: Options, data: ClipboardDataStub, events: Event[]) {
    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(data.setData).not.toHaveBeenCalled();
    expect(data.getData).not.toHaveBeenCalled();
    expect(options.publishNotice).not.toHaveBeenCalled();
    for (const event of events) expect(event.defaultPrevented).toBe(false);
  }

  function editableElements(): Array<[string, () => HTMLElement]> {
    return [
      ["input", () => appendElement(document.createElement("input"))],
      ["textarea", () => appendElement(document.createElement("textarea"))],
      ["select", () => appendElement(document.createElement("select"))],
      ["contenteditable", () => {
        const element = appendElement(document.createElement("div"));
        element.setAttribute("contenteditable", "true");
        return element;
      }],
      ["contenteditableを継承した子", () => {
        const parent = appendElement(document.createElement("div"));
        parent.setAttribute("contenteditable", "");
        return appendElement(document.createElement("span"), parent);
      }],
    ];
  }

  it.each(editableElements())("event.target が %s ならブラウザに任せる", (_name, create) => {
    const { options } = setup();
    const data = clipboardData();
    const target = create();

    const events = [
      dispatchClipboard("copy", data, target),
      dispatchClipboard("paste", data, target),
    ];

    expectIgnored(options, data, events);
  });

  it.each(editableElements())("activeElement が %s ならブラウザに任せる", (_name, create) => {
    const { options } = setup();
    const data = clipboardData();
    const element = create();
    element.tabIndex = 0;
    element.focus();
    expect(document.activeElement).toBe(element);

    const events = [
      dispatchClipboard("copy", data, window),
      dispatchClipboard("paste", data, window),
    ];

    expectIgnored(options, data, events);
  });

  it("contenteditable=\"false\" の内側は既存の判定どおり枝の操作を行う", () => {
    const { options } = setup();
    const parent = appendElement(document.createElement("div"));
    parent.setAttribute("contenteditable", "true");
    const island = appendElement(document.createElement("div"), parent);
    island.setAttribute("contenteditable", "false");

    const copy = dispatchClipboard("copy", clipboardData(), island);
    const paste = dispatchClipboard("paste", clipboardData(), island);

    expect(copy.defaultPrevented).toBe(true);
    expect(paste.defaultPrevented).toBe(true);
    expect(options.copySubtree).toHaveBeenCalledTimes(1);
    expect(options.pasteSubtree).toHaveBeenCalledTimes(1);
  });

  it("DOMの文字選択があればブラウザに任せる", () => {
    const { options } = setup();
    const data = clipboardData();
    const paragraph = appendElement(document.createElement("p"));
    paragraph.textContent = "選択した文章";
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()!.addRange(range);
    expect(window.getSelection()?.isCollapsed).toBe(false);

    const events = [dispatchClipboard("copy", data), dispatchClipboard("paste", data)];

    expectIgnored(options, data, events);
  });

  it("選択範囲が折り畳まれていれば枝の操作を行う", () => {
    const { options } = setup();
    const paragraph = appendElement(document.createElement("p"));
    paragraph.textContent = "文章";
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 1);
    range.collapse(true);
    window.getSelection()!.addRange(range);
    expect(window.getSelection()?.isCollapsed).toBe(true);

    dispatchClipboard("copy", clipboardData());

    expect(options.copySubtree).toHaveBeenCalledTimes(1);
  });

  it("ラベル編集中はブラウザに任せる", () => {
    const { options } = setup({ isEditing: true });
    const data = clipboardData();

    const events = [dispatchClipboard("copy", data), dispatchClipboard("paste", data)];

    expectIgnored(options, data, events);
  });

  it("ジェスチャー中はブラウザに任せる", () => {
    const { options } = setup({ hasActiveGesture: () => true });
    const data = clipboardData();

    const events = [dispatchClipboard("copy", data), dispatchClipboard("paste", data)];

    expectIgnored(options, data, events);
  });

  it("既に既定動作が止められたイベントには関与しない", () => {
    const { options } = setup();
    const data = clipboardData();
    const element = appendElement(document.createElement("div"));
    element.addEventListener("copy", (event) => event.preventDefault());
    element.addEventListener("paste", (event) => event.preventDefault());

    dispatchClipboard("copy", data, element);
    dispatchClipboard("paste", data, element);

    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(data.setData).not.toHaveBeenCalled();
    expect(data.getData).not.toHaveBeenCalled();
    expect(options.publishNotice).not.toHaveBeenCalled();
  });

  it("ヘッダーのボタンにフォーカスがあっても枝の操作を行う", () => {
    const { options } = setup();
    const button = appendElement(document.createElement("button"));
    button.focus();
    expect(document.activeElement).toBe(button);

    const copy = dispatchClipboard("copy", clipboardData(), button);
    const paste = dispatchClipboard("paste", clipboardData(), button);

    expect(copy.defaultPrevented).toBe(true);
    expect(paste.defaultPrevented).toBe(true);
    expect(options.copySubtree).toHaveBeenCalledTimes(1);
    expect(options.pasteSubtree).toHaveBeenCalledTimes(1);
  });

  it("Ctrl/Cmd+C・Vの keydown では枝の操作を行わない", () => {
    const { options } = setup();

    for (const init of [
      { key: "c", ctrlKey: true },
      { key: "c", metaKey: true },
      { key: "v", ctrlKey: true },
      { key: "v", metaKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }

    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(options.publishNotice).not.toHaveBeenCalled();
  });
});

describe("useMapClipboardEvents の登録", () => {
  it("アンマウント後はイベントに反応しない", () => {
    const { options, unmount } = setup();
    unmount();

    const copy = dispatchClipboard("copy", clipboardData());
    const paste = dispatchClipboard("paste", clipboardData());

    expect(copy.defaultPrevented).toBe(false);
    expect(paste.defaultPrevented).toBe(false);
    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(options.publishNotice).not.toHaveBeenCalled();
  });

  it("再描画後は再登録せずに最新の選択と関数を使う", () => {
    const addListener = jest.spyOn(window, "addEventListener");
    const { options, rerender } = setup();
    const registeredCount = addListener.mock.calls.length;
    const next: Options = {
      selectedNodeId: 7,
      isEditing: false,
      hasActiveGesture: () => false,
      copySubtree: jest.fn(() => ({ ok: true, value: CLIPBOARD_TEXT }) as const),
      pasteSubtree: jest.fn(() => 11),
      publishNotice: jest.fn(),
    };

    rerender(next);
    dispatchClipboard("copy", clipboardData());
    dispatchClipboard("paste", clipboardData());

    expect(addListener.mock.calls.length).toBe(registeredCount);
    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(options.pasteSubtree).not.toHaveBeenCalled();
    expect(options.publishNotice).not.toHaveBeenCalled();
    expect(next.copySubtree).toHaveBeenCalledWith(7);
    expect(next.pasteSubtree).toHaveBeenCalledTimes(1);
    expect(next.publishNotice).toHaveBeenNthCalledWith(1, COPY_SUCCESS);
    expect(next.publishNotice).toHaveBeenNthCalledWith(2, PASTE_SUCCESS);
  });

  it("再描画で編集中・ジェスチャー中になったら、その状態を使う", () => {
    const { options, rerender } = setup();

    rerender({ ...options, isEditing: true });
    dispatchClipboard("paste", clipboardData());
    rerender({ ...options, hasActiveGesture: () => true });
    dispatchClipboard("copy", clipboardData());

    expect(options.copySubtree).not.toHaveBeenCalled();
    expect(options.pasteSubtree).not.toHaveBeenCalled();
  });
});
