import { act, renderHook } from "@testing-library/react";
import { useMapPrintExport } from "@/hooks/useMapPrintExport";
import { createTestNode } from "@/testing/createTestNode";
import {
  DEFAULT_MAP_PRINT_SETTINGS,
  type MapPrintOptions,
  type MapPrintResult,
  type MapPrintSession,
  type MapPrintSettings,
} from "@/types/mapPrintExport";

function createPrintService() {
  let resolve!: (value: MapPrintResult) => void;
  const done = new Promise<MapPrintResult>((settle) => { resolve = settle; });
  const cancel = jest.fn();
  const finish = jest.fn(() => resolve({ status: "dialog-closed" }));
  const startPrint = jest.fn<MapPrintSession, [MapPrintOptions]>(() => ({ done, cancel, finish }));
  return { startPrint, cancel, finish, resolve };
}

const nodes = [createTestNode({ label: "旅行の計画" })];
const settings = DEFAULT_MAP_PRINT_SETTINGS;

describe("useMapPrintExport", () => {
  it("対象外のスコープでは理由を通知し、印刷を開始しない", () => {
    const { startPrint } = createPrintService();
    const { result } = renderHook(() => useMapPrintExport({
      nodes, mapName: "旅行", enabled: false, disabledReason: "この書き出し対象では使えません", startPrint,
    }));

    act(() => result.current.start(settings));

    expect(startPrint).not.toHaveBeenCalled();
    expect(result.current.state).toBe("idle");
    expect(result.current.notice).toEqual({ kind: "warning", message: "この書き出し対象では使えません" });
  });

  it("有効なスコープでも空の対象は印刷しない", () => {
    const { startPrint } = createPrintService();
    const { result } = renderHook(() => useMapPrintExport({
      nodes: [], mapName: "旅行", enabled: true, startPrint,
    }));

    act(() => result.current.start(settings));

    expect(startPrint).not.toHaveBeenCalled();
    expect(result.current.notice).toEqual({ kind: "warning", message: "書き出すノードがありません。" });
  });

  it("同じ描画中の連続した開始を一度だけ受け付ける", () => {
    const { startPrint } = createPrintService();
    const { result } = renderHook(() => useMapPrintExport({
      nodes, mapName: "旅行", enabled: true, startPrint,
    }));

    act(() => {
      result.current.start(settings);
      result.current.start(settings);
    });

    expect(result.current.state).toBe("preparing");
    expect(startPrint).toHaveBeenCalledTimes(1);
  });

  it("変更前の対象ノード、マップ名、設定をサービスに保持する", () => {
    const { startPrint } = createPrintService();
    const originalNodes = [createTestNode({ label: "開始時のノード" })];
    const editable: MapPrintSettings = { ...settings, margins: { ...settings.margins, left: 20 } };
    const { result, rerender } = renderHook(({ nodes, mapName }) => useMapPrintExport({
      nodes, mapName, enabled: true, startPrint,
    }), { initialProps: { nodes: originalNodes, mapName: "開始時の名前" } });

    act(() => result.current.start(editable));
    originalNodes[0].label = "変更後のラベル";
    originalNodes.push(createTestNode({ id: 2 }));
    editable.paperSize = "letter";
    editable.margins.left = 15;
    rerender({ nodes: [createTestNode({ id: 3 })], mapName: "変更後の名前" });

    expect(startPrint).toHaveBeenCalledWith({
      nodes: [createTestNode({ label: "開始時のノード" })],
      mapName: "開始時の名前",
      settings: { paperSize: "a4", orientation: "portrait", pagination: "fit", margins: { top: 10, right: 10, bottom: 10, left: 20 } },
      onPrinting: expect.any(Function),
    });
  });

  it("準備取消後の古いコールバックと終了結果を無視して、新しい印刷を継続する", async () => {
    const first = createPrintService();
    const second = createPrintService();
    const startPrint = jest.fn().mockImplementationOnce(first.startPrint).mockImplementationOnce(second.startPrint);
    const { result } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));
    act(() => result.current.cancel());
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
    expect(result.current.notice).toBeNull();

    act(() => result.current.start(settings));
    await act(async () => {
      first.startPrint.mock.calls[0][0].onPrinting();
      first.resolve({ status: "failed", reason: "page-limit" });
    });

    expect(result.current.state).toBe("preparing");
    expect(result.current.notice).toBeNull();
    expect(second.cancel).not.toHaveBeenCalled();
  });

  it("アンマウントで所有セッションを終了させる", async () => {
    const { startPrint, cancel, resolve } = createPrintService();
    const { result, unmount } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));
    act(() => startPrint.mock.calls[0][0].onPrinting());
    unmount();
    await act(async () => resolve({ status: "cancelled" }));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("印刷画面を開いたことだけを通知し、ダイアログが閉じると待機状態に戻る", async () => {
    const { startPrint, cancel, resolve } = createPrintService();
    const { result } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));
    act(() => startPrint.mock.calls[0][0].onPrinting());

    expect(result.current.state).toBe("printing");
    expect(result.current.notice).toEqual({ kind: "status", message: "印刷画面を開きました。PDF保存は印刷画面で選択してください。" });
    act(() => result.current.cancel());
    expect(cancel).not.toHaveBeenCalled();

    await act(async () => resolve({ status: "dialog-closed" }));

    expect(result.current.state).toBe("idle");
    expect(result.current.notice?.message).toBe("印刷画面を開きました。PDF保存は印刷画面で選択してください。");
  });

  it("afterprint が届かない場合は明示的な終了で再実行できる", async () => {
    const first = createPrintService();
    const second = createPrintService();
    const startPrint = jest.fn().mockImplementationOnce(first.startPrint).mockImplementationOnce(second.startPrint);
    const { result } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));
    act(() => result.current.finish());
    expect(first.finish).not.toHaveBeenCalled();
    act(() => first.startPrint.mock.calls[0][0].onPrinting());
    await act(async () => result.current.finish());

    expect(first.finish).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("idle");
    act(() => result.current.start(settings));
    expect(second.startPrint).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("preparing");
  });

  it("サービスの取消をエラーや成功として通知しない", async () => {
    const { startPrint, resolve } = createPrintService();
    const { result } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));
    await act(async () => resolve({ status: "cancelled" }));

    expect(result.current.state).toBe("idle");
    expect(result.current.notice).toBeNull();
  });

  it("印刷開始が同期例外を送出しても再試行できる", () => {
    const pending = createPrintService();
    const startPrint = jest.fn()
      .mockImplementationOnce(() => { throw new Error("internal error"); })
      .mockImplementationOnce(pending.startPrint);
    const { result } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));

    expect(result.current.state).toBe("idle");
    expect(result.current.notice).toEqual({ kind: "error", message: expect.stringMatching(/印刷の準備ができませんでした。/) });
    act(() => result.current.start(settings));
    expect(result.current.state).toBe("preparing");
  });

  it.each([
    ["page-limit", /100ページ.*用紙.*全体を1ページ/],
    ["size-limit", /10 MiB/],
    ["invalid-settings", /印刷設定/],
    ["preparation", /印刷の準備ができませんでした。/],
  ] as const)("%s の失敗理由を案内し、成功通知を出さない", async (reason, expectedMessage) => {
    const { startPrint, resolve } = createPrintService();
    const { result } = renderHook(() => useMapPrintExport({ nodes, mapName: "旅行", enabled: true, startPrint }));

    act(() => result.current.start(settings));
    await act(async () => resolve({ status: "failed", reason }));

    expect(result.current.state).toBe("idle");
    expect(result.current.notice).toEqual({ kind: "error", message: expect.stringMatching(expectedMessage) });
  });
});
