import { waitFor } from "@testing-library/react";
import { startMapPrint } from "@/services/printExport/printMapSvg";
import { createTestNode } from "@/testing/createTestNode";
import {
  DEFAULT_MAP_PRINT_SETTINGS,
  type MapPrintOptions,
  type MapPrintSession,
} from "@/types/mapPrintExport";

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const blobUrl = "blob:map-print";
const tileSettings = { ...DEFAULT_MAP_PRINT_SETTINGS, pagination: "tile" } as const;

function deferredReady() {
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => { markReady = resolve; });
  return { ready, markReady };
}

function setImageReady(image: HTMLImageElement, decode?: () => Promise<void>) {
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 100 },
    decode: { configurable: true, value: decode },
  });
  image.dispatchEvent(new Event("load"));
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error), { once: true });
    reader.readAsText(blob);
  });
}

describe("startMapPrint", () => {
  let createObjectUrl: jest.Mock<string, [Blob]>;
  let revokeObjectUrl: jest.Mock<void, [string]>;
  let browserPrint: jest.Mock;
  let onPrinting: jest.Mock;
  let frame: HTMLIFrameElement | undefined;
  let frameWindow: Window | null;
  let iframeFonts: Promise<void> | undefined;
  let mockFrameApis: ((iframe: HTMLIFrameElement) => void) | undefined;
  let sessions: MapPrintSession[];
  let canvas: jest.SpyInstance;

  beforeEach(() => {
    frame = undefined;
    frameWindow = null;
    iframeFonts = undefined;
    mockFrameApis = undefined;
    sessions = [];
    createObjectUrl = jest.fn<string, [Blob]>(() => blobUrl);
    revokeObjectUrl = jest.fn();
    browserPrint = jest.fn();
    onPrinting = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    canvas = jest.spyOn(HTMLCanvasElement.prototype, "getContext");
    canvas.mockReturnValue({
      measureText: (text: string) => ({ width: text.length * 5 }),
    });

    const append = document.body.append.bind(document.body);
    jest.spyOn(document.body, "append").mockImplementation((...elements) => {
      append(...elements);
      const addedFrame = elements.find((element) => element instanceof HTMLIFrameElement);
      if (!addedFrame) return;

      frame = addedFrame as HTMLIFrameElement;
      frameWindow = frame.contentWindow;
      Object.defineProperty(frameWindow, "print", { configurable: true, value: browserPrint });
      Object.defineProperty(frameWindow, "focus", { configurable: true, value: jest.fn() });
      if (iframeFonts) {
        Object.defineProperty(frame.contentDocument, "fonts", {
          configurable: true, value: { ready: iframeFonts },
        });
      }
      mockFrameApis?.(frame);
    });
  });

  afterEach(() => {
    for (const session of sessions) session.cancel();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Reflect.deleteProperty(document, "fonts");
    if (originalCreateObjectUrl) Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (originalRevokeObjectUrl) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  function start(overrides: Partial<MapPrintOptions> = {}) {
    const session = startMapPrint({
      nodes: [createTestNode()],
      settings: DEFAULT_MAP_PRINT_SETTINGS,
      mapName: "地図",
      onPrinting,
      ...overrides,
    });
    sessions.push(session);
    return session;
  }

  async function waitForImages(count = 1) {
    return waitFor(() => {
      const images = Array.from(frame?.contentDocument?.images ?? []);
      expect(images).toHaveLength(count);
      return images;
    });
  }

  function expectReleased() {
    expect(frame?.isConnected).toBe(false);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith(blobUrl);
  }

  it("親フォントを待ってSVGを作り、iframeフォントと全ページ画像のload/decode後に印刷する", async () => {
    const parentFonts = deferredReady();
    const frameFonts = deferredReady();
    const lastDecode = deferredReady();
    const firstDecode = jest.fn().mockResolvedValue(undefined);
    const decode = jest.fn(() => lastDecode.ready);
    Object.defineProperty(document, "fonts", {
      configurable: true, value: { ready: parentFonts.ready },
    });
    iframeFonts = frameFonts.ready;
    const session = start({
      nodes: [createTestNode({ width: 1000 })],
      settings: tileSettings,
    });

    await Promise.resolve();
    expect(canvas).not.toHaveBeenCalled();
    expect(createObjectUrl).not.toHaveBeenCalled();
    parentFonts.markReady();

    const [first, last] = await waitForImages(2);
    expect(frame?.tabIndex).toBe(-1);
    expect(frame?.getAttribute("aria-hidden")).toBe("true");
    expect(frame?.style.display).not.toBe("none");
    expect(frame?.style.visibility).not.toBe("hidden");
    expect(Number.parseFloat(frame?.style.left ?? "")).toBeLessThan(0);
    expect(first.getAttribute("src")).toBe(blobUrl);
    expect(last.getAttribute("src")).toBe(blobUrl);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    setImageReady(first, firstDecode);
    await waitFor(() => expect(firstDecode).toHaveBeenCalledTimes(1));
    expect(browserPrint).not.toHaveBeenCalled();

    setImageReady(last, decode);
    await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
    frameFonts.markReady();
    await Promise.resolve();
    expect(browserPrint).not.toHaveBeenCalled();
    lastDecode.markReady();

    await waitFor(() => expect(onPrinting).toHaveBeenCalledTimes(1));
    expect(browserPrint).toHaveBeenCalledTimes(1);
    frameWindow?.dispatchEvent(new Event("afterprint"));
    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
  });

  it("全画像のdecode後もiframeフォントの準備が済むまで印刷しない", async () => {
    const frameFonts = deferredReady();
    iframeFonts = frameFonts.ready;
    const session = start();
    const [image] = await waitForImages();
    setImageReady(image, () => Promise.resolve());

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(browserPrint).not.toHaveBeenCalled();
    frameFonts.markReady();
    await waitFor(() => expect(browserPrint).toHaveBeenCalledTimes(1));

    session.finish();
    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
  });

  it("マップ名とラベルをHTML要素にせず、既存SVGのエスケープを維持する", async () => {
    const label = '<script data-label="1">bad</script>';
    const name = '</title><script data-map="1">bad</script>';
    const session = start({ nodes: [createTestNode({ width: 400, label })], mapName: name });
    await waitForImages();

    expect(frame?.contentDocument?.querySelector("script, svg")).toBeNull();
    expect(frame?.contentDocument?.querySelector("title")?.textContent).toBe(name);
    const svg = await readBlob(createObjectUrl.mock.calls[0][0]);
    expect(svg).toContain("&lt;script");
    expect(svg).not.toContain("<script");
    session.cancel();
    await expect(session.done).resolves.toEqual({ status: "cancelled" });
  });

  it("SVG Blobが10MiBちょうどなら印刷できる", async () => {
    jest.spyOn(Blob.prototype, "size", "get").mockReturnValue(10 * 1024 * 1024);
    const session = start();
    const [image] = await waitForImages();

    expect(createObjectUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
    setImageReady(image);
    await waitFor(() => expect(browserPrint).toHaveBeenCalledTimes(1));
    session.finish();
    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
  });

  it("10MiB超過ではiframeやURL作成前にsize-limitを返す", async () => {
    jest.spyOn(Blob.prototype, "size", "get").mockReturnValue(10 * 1024 * 1024 + 1);
    const session = start();

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "size-limit" });
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(frame).toBeUndefined();
    expect(onPrinting).not.toHaveBeenCalled();
  });

  it("100ページ超過ではiframeやURL作成前にpage-limitを返す", async () => {
    const session = start({
      nodes: [createTestNode({ width: 72_000 })],
      settings: tileSettings,
    });

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "page-limit" });
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(frame).toBeUndefined();
  });

  it("不正な設定ではフォントを待たずinvalid-settingsを返す", async () => {
    Object.defineProperty(document, "fonts", {
      configurable: true, value: { ready: deferredReady().ready },
    });
    const session = start({
      settings: {
        ...DEFAULT_MAP_PRINT_SETTINGS,
        margins: { ...DEFAULT_MAP_PRINT_SETTINGS.margins, top: 0.01 },
      },
    });

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "invalid-settings" });
    expect(canvas).not.toHaveBeenCalled();
  });

  it("15秒の準備期限にはiframe・URLを解放し、遅延画像完了で印刷しない", async () => {
    jest.useFakeTimers();
    const startedAt = performance.now();
    const session = start();
    const [image] = await waitForImages();
    const result = jest.fn();
    void session.done.then(result);

    await jest.advanceTimersByTimeAsync(14_999 - (performance.now() - startedAt));
    expect(result).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "preparation" });
    expectReleased();
    setImageReady(image);
    await jest.advanceTimersByTimeAsync(0);
    expect(browserPrint).not.toHaveBeenCalled();
    expect(onPrinting).not.toHaveBeenCalled();
  });

  it.each(["error", "zero-width"])("画像の%sでは印刷せずpreparationを返す", async (failure) => {
    const session = start();
    const [image] = await waitForImages();

    image.dispatchEvent(new Event(failure === "error" ? "error" : "load"));

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "preparation" });
    expect(browserPrint).not.toHaveBeenCalled();
    expectReleased();
  });

  it("画像decodeの拒否では印刷せずpreparationを返す", async () => {
    const session = start();
    const [image] = await waitForImages();

    setImageReady(image, () => Promise.reject(new Error("decode failed")));

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "preparation" });
    expect(browserPrint).not.toHaveBeenCalled();
    expectReleased();
  });

  it("既にcompleteの画像もnaturalWidthを確認し、loadイベントなしに印刷する", async () => {
    mockFrameApis = (iframe) => {
      const imagePrototype = (iframe.contentWindow as Window & typeof globalThis).HTMLImageElement.prototype;
      jest.spyOn(imagePrototype, "complete", "get").mockReturnValue(true);
      jest.spyOn(imagePrototype, "naturalWidth", "get").mockReturnValue(100);
    };

    const session = start();
    await waitFor(() => expect(browserPrint).toHaveBeenCalledTimes(1));
    session.finish();
    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
  });

  it("印刷iframeの文書を取得できない場合はpreparationを返す", async () => {
    mockFrameApis = (iframe) => {
      Object.defineProperty(iframe, "contentDocument", { configurable: true, value: null });
    };

    const session = start();

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "preparation" });
    expect(browserPrint).not.toHaveBeenCalled();
    expectReleased();
  });

  it("取消後に遅延decodeが完了しても印刷せず、別iframeを残す", async () => {
    const unrelated = document.createElement("iframe");
    document.body.appendChild(unrelated);
    try {
      const pendingDecode = deferredReady();
      const decode = jest.fn(() => pendingDecode.ready);
      const session = start();
      const [image] = await waitForImages();
      setImageReady(image, decode);
      await waitFor(() => expect(decode).toHaveBeenCalledTimes(1));

      session.cancel();
      session.cancel();
      session.finish();
      pendingDecode.markReady();
      await expect(session.done).resolves.toEqual({ status: "cancelled" });

      expect(browserPrint).not.toHaveBeenCalled();
      expect(onPrinting).not.toHaveBeenCalled();
      expect(unrelated.isConnected).toBe(true);
      expectReleased();
    } finally {
      unrelated.remove();
    }
  });

  it("printの同期例外をpreparationに変換し印刷呼出通知を出さない", async () => {
    browserPrint.mockImplementation(() => { throw new Error("private detail"); });
    const session = start();
    const [image] = await waitForImages();
    setImageReady(image);

    await expect(session.done).resolves.toEqual({ status: "failed", reason: "preparation" });
    expect(onPrinting).not.toHaveBeenCalled();
    expectReleased();
  });

  it("print中に同期発火したafterprintでも一度だけ終了通知と解放を行う", async () => {
    browserPrint.mockImplementation(() => frameWindow?.dispatchEvent(new Event("afterprint")));
    const session = start();
    const [image] = await waitForImages();
    setImageReady(image);

    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
    frameWindow?.dispatchEvent(new Event("afterprint"));
    session.finish();
    session.cancel();
    expect(browserPrint).toHaveBeenCalledTimes(1);
    expect(onPrinting).toHaveBeenCalledTimes(1);
    expectReleased();
  });

  it("afterprint未発火では準備期限を過ぎても印刷文書を保持し、明示終了で解放する", async () => {
    jest.useFakeTimers();
    const session = start();
    const [image] = await waitForImages();
    setImageReady(image);
    await waitFor(() => expect(onPrinting).toHaveBeenCalledTimes(1));

    await jest.advanceTimersByTimeAsync(30_000);
    expect(frame?.isConnected).toBe(true);
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    session.finish();
    session.finish();

    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
    expectReleased();
  });

  it("準備中の二重実行を同期的に拒否し、終了後は再度開始できる", async () => {
    const session = start();
    const duplicate = start();
    await expect(duplicate.done).resolves.toEqual({ status: "failed", reason: "preparation" });

    const [image] = await waitForImages();
    setImageReady(image);
    await waitFor(() => expect(onPrinting).toHaveBeenCalledTimes(1));
    session.finish();

    const next = start();
    next.cancel();
    await expect(next.done).resolves.toEqual({ status: "cancelled" });
    expect(browserPrint).toHaveBeenCalledTimes(1);
    expectReleased();
  });

  it("印刷中のcancelはアンマウント経路として所有資源を解放する", async () => {
    const session = start();
    const [image] = await waitForImages();
    setImageReady(image);
    await waitFor(() => expect(onPrinting).toHaveBeenCalledTimes(1));

    session.cancel();

    await expect(session.done).resolves.toEqual({ status: "cancelled" });
    expectReleased();
  });

  it("URL解放で例外が出ても明示終了の結果を変えない", async () => {
    revokeObjectUrl.mockImplementation(() => { throw new Error("cleanup failed"); });
    const session = start();
    const [image] = await waitForImages();
    setImageReady(image);
    await waitFor(() => expect(onPrinting).toHaveBeenCalledTimes(1));

    expect(() => session.finish()).not.toThrow();
    await expect(session.done).resolves.toEqual({ status: "dialog-closed" });
    expectReleased();
  });
});
