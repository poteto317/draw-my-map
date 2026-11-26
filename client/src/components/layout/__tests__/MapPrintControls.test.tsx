import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MapPrintControls } from "@/components/layout/MapPrintControls";
import { useMapPrintExport } from "@/hooks/useMapPrintExport";
import type { startMapPrint } from "@/services/printExport/printMapSvg";
import { createTestNode } from "@/testing/createTestNode";
import type { MapPrintOptions, MapPrintResult, MapPrintSession } from "@/types/mapPrintExport";

jest.mock("@/services/imageExport/mapTextMeasurement", () => ({
  createMapTextMeasurer: () => (text: string) => text.length * 8,
}));

function createPrintService() {
  let resolve!: (value: MapPrintResult) => void;
  const done = new Promise<MapPrintResult>((settle) => { resolve = settle; });
  const cancel = jest.fn(() => resolve({ status: "cancelled" }));
  const finish = jest.fn(() => resolve({ status: "dialog-closed" }));
  const start = jest.fn<MapPrintSession, [MapPrintOptions]>(() => ({ done, cancel, finish }));
  return { start, cancel, finish, resolve };
}

const nodes = [createTestNode({ width: 1500, height: 1050 })];

function Harness({
  startPrint,
  exportNodes = nodes,
}: {
  startPrint: typeof startMapPrint;
  exportNodes?: typeof nodes;
}) {
  const [open, setOpen] = useState(false);
  const print = useMapPrintExport({ nodes: exportNodes, mapName: "テストのマップ", enabled: true, startPrint });
  return (
    <div inert={open} data-testid="editor-root">
      <MapPrintControls
        nodes={exportNodes}
        enabled
        canOpen={!open}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        print={print}
        onMouseClick={() => {}}
      />
    </div>
  );
}

async function openSettings(exportNodes = nodes) {
  const service = createPrintService();
  const user = userEvent.setup();
  render(<Harness startPrint={service.start} exportNodes={exportNodes} />);
  const trigger = screen.getByRole("button", { name: "PDF・印刷設定" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "PDF・印刷設定" });
  return { service, user, trigger, dialog: within(dialog), dialogElement: dialog };
}

describe("MapPrintControls", () => {
  it("名前付き入力に既定値を表示し、既存SVGの寸法で実寸の列・行・ページ数を更新する", async () => {
    const { user, dialog } = await openSettings();

    const paper = dialog.getByRole("combobox", { name: "用紙サイズ" });
    const orientation = dialog.getByRole("combobox", { name: "方向" });
    const pagination = dialog.getByRole("combobox", { name: "配置" });
    expect(paper).toHaveValue("a4");
    expect(within(paper).getAllByRole("option").map((option) => option.textContent)).toEqual(["A4", "A3", "Letter"]);
    expect(orientation).toHaveValue("portrait");
    for (const label of ["上の余白", "右の余白", "下の余白", "左の余白"]) {
      const margin = dialog.getByRole("spinbutton", { name: label });
      expect(margin).toHaveValue(10);
      expect(margin).toHaveAttribute("min", "0");
      expect(margin).toHaveAttribute("max", "50");
      expect(margin).toHaveAttribute("step", "0.1");
    }
    expect(pagination).toHaveValue("fit");
    expect(dialog.getByRole("status")).toHaveTextContent("1ページ（1列 × 1行）");
    expect(dialog.getByText(/96px.*25.4mm/)).toBeInTheDocument();
    expect(dialog.getByText(/PDFとして保存.*100%.*ヘッダーとフッター/)).toBeInTheDocument();

    await user.selectOptions(pagination, "tile");
    expect(dialog.getByRole("status")).toHaveTextContent("6ページ（3列 × 2行）");
    await user.selectOptions(orientation, "landscape");
    expect(dialog.getByRole("status")).toHaveTextContent("4ページ（2列 × 2行）");
  });

  it.each(["", "-1", "50.1", "10.01", "50.000000000000001", "-1e-400"])("余白 %j の入力エラーを欄に関連付けて印刷を止める", async (value) => {
    const { dialog, service } = await openSettings();
    const top = dialog.getByRole("spinbutton", { name: "上の余白" });

    fireEvent.change(top, { target: { value } });

    expect(top).toHaveAttribute("aria-invalid", "true");
    expect(top).toHaveAccessibleDescription(/0〜50 mm/);
    expect(dialog.getByRole("spinbutton", { name: "右の余白" })).not.toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByRole("button", { name: "印刷画面を開く" })).toBeDisabled();
    expect(service.start).not.toHaveBeenCalled();
  });

  it("100ページを超える設定に変更案内を出し、全体を1ページに戻すと実行できる", async () => {
    const { user, dialog } = await openSettings([createTestNode({ width: 80_000 })]);
    const pagination = dialog.getByRole("combobox", { name: "配置" });
    const submit = dialog.getByRole("button", { name: "印刷画面を開く" });

    await user.selectOptions(pagination, "tile");
    expect(dialog.getByRole("alert")).toHaveTextContent(/100ページ.*用紙を大きく/);
    expect(submit).toBeDisabled();

    await user.selectOptions(pagination, "fit");
    expect(submit).toBeEnabled();
  });

  it("背景の外でTabを循環し、Escapeで閉じた後に設定ボタンへフォーカスを戻す", async () => {
    const { user, trigger, dialog, dialogElement } = await openSettings();
    const paper = dialog.getByRole("combobox", { name: "用紙サイズ" });
    expect(paper).toHaveFocus();
    expect(screen.getByTestId("editor-root")).toHaveAttribute("inert");
    expect(screen.getByTestId("editor-root")).not.toContainElement(dialogElement);

    await user.tab({ shift: true });
    expect(dialog.getByRole("button", { name: "印刷画面を開く" })).toHaveFocus();
    await user.tab();
    expect(paper).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(dialogElement).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("追加した設定で準備を始め、取消でセッションを解放する", async () => {
    const { user, trigger, dialog, dialogElement, service } = await openSettings();
    await user.selectOptions(dialog.getByRole("combobox", { name: "用紙サイズ" }), "a3");
    fireEvent.change(dialog.getByRole("spinbutton", { name: "左の余白" }), { target: { value: "12.3" } });
    await user.click(dialog.getByRole("button", { name: "印刷画面を開く" }));

    expect(service.start.mock.calls[0][0].settings).toEqual({
      paperSize: "a3", orientation: "portrait", pagination: "fit", margins: { top: 10, right: 10, bottom: 10, left: 12.3 },
    });
    expect(dialog.getByRole("status")).toHaveTextContent("印刷を準備しています。");
    const cancel = dialog.getByRole("button", { name: "キャンセル" });
    expect(cancel).toHaveFocus();
    await user.click(cancel);

    expect(service.cancel).toHaveBeenCalledTimes(1);
    expect(dialogElement).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole("spinbutton", { name: "左の余白" })).toHaveValue(12.3);
  });

  it("印刷開始後はEscapeで閉じず、手動終了後は再実行できる", async () => {
    const { user, dialog, dialogElement, service } = await openSettings();
    await user.click(dialog.getByRole("button", { name: "印刷画面を開く" }));
    act(() => service.start.mock.calls[0][0].onPrinting());

    expect(dialog.getByText(/印刷画面を閉じたら.*印刷を終了/)).toBeInTheDocument();
    const finish = dialog.getByRole("button", { name: "印刷を終了" });
    expect(finish).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(dialogElement).toBeInTheDocument();
    expect(service.cancel).not.toHaveBeenCalled();

    await user.click(finish);
    expect(service.finish).toHaveBeenCalledTimes(1);
    expect(dialog.getByRole("button", { name: "印刷画面を開く" })).toBeEnabled();
  });

  it("準備の失敗理由を設定画面内で読める", async () => {
    const { user, dialog, service } = await openSettings();
    await user.click(dialog.getByRole("button", { name: "印刷画面を開く" }));
    await act(async () => service.resolve({ status: "failed", reason: "size-limit" }));

    expect(dialog.getByRole("alert")).toHaveTextContent(/10 MiB/);
    expect(dialog.getByRole("button", { name: "印刷画面を開く" })).toBeEnabled();
  });
});
