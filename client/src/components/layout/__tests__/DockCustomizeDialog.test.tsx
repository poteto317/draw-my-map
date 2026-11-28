import { createRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  DockCustomizeDialog,
  type DockApplyResult,
  type DockCustomizeDialogProps,
} from "@/components/layout/DockCustomizeDialog";
import { createDefaultDockVisibleSlotIds } from "@/domain/dock/defaultDockLayout";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";
import { listDockSlotDefs } from "@/domain/dock/dockSlotCatalog";

/** L-060: 必須 props が型上省略不可であることをコンパイル時に担保する参照 */
const REQUIRED_DOCK_CUSTOMIZE_DIALOG_PROP_KEYS = [
  "open",
  "draftVisibleSlotIds",
  "onDraftChange",
  "onApply",
  "onCancel",
  "onResetDefault",
  "dialogMouseClickedAtRef",
  "initialFocusRef",
] as const satisfies ReadonlyArray<keyof DockCustomizeDialogProps>;

function createProps(
  overrides: Partial<DockCustomizeDialogProps> = {},
): DockCustomizeDialogProps {
  return {
    open: true,
    draftVisibleSlotIds: createDefaultDockVisibleSlotIds(),
    onDraftChange: jest.fn(),
    onApply: jest.fn(async (): Promise<DockApplyResult> => ({ ok: true })),
    onCancel: jest.fn(),
    onResetDefault: jest.fn(),
    dialogMouseClickedAtRef: { current: null },
    initialFocusRef: createRef<HTMLElement>(),
    ...overrides,
  };
}

describe("DockCustomizeDialog", () => {
  it("L-060: 必須 props キーが揃っている（未配線 RED 用の正本）", () => {
    const props = createProps();
    for (const key of REQUIRED_DOCK_CUSTOMIZE_DIALOG_PROP_KEYS) {
      expect(props[key]).toBeDefined();
    }
    render(<DockCustomizeDialog {...props} />);
    expect(screen.getByTestId("dock-customize-dialog")).toBeInTheDocument();
  });

  it("L-060 外し変異: 必須 props を欠落させると型エラー（コンパイル時）", () => {
    const full = createProps();
    // @ts-expect-error L-060: dialogMouseClickedAtRef は必須
    const missingMouse: DockCustomizeDialogProps = {
      open: full.open,
      draftVisibleSlotIds: full.draftVisibleSlotIds,
      onDraftChange: full.onDraftChange,
      onApply: full.onApply,
      onCancel: full.onCancel,
      onResetDefault: full.onResetDefault,
      initialFocusRef: full.initialFocusRef,
    };
    // @ts-expect-error L-060: initialFocusRef は必須
    const missingFocus: DockCustomizeDialogProps = {
      open: full.open,
      draftVisibleSlotIds: full.draftVisibleSlotIds,
      onDraftChange: full.onDraftChange,
      onApply: full.onApply,
      onCancel: full.onCancel,
      onResetDefault: full.onResetDefault,
      dialogMouseClickedAtRef: full.dialogMouseClickedAtRef,
    };
    void missingMouse;
    void missingFocus;
    expect(REQUIRED_DOCK_CUSTOMIZE_DIALOG_PROP_KEYS).toContain(
      "dialogMouseClickedAtRef",
    );
    expect(REQUIRED_DOCK_CUSTOMIZE_DIALOG_PROP_KEYS).toContain("initialFocusRef");
  });

  it("open=false では描画しない", () => {
    render(<DockCustomizeDialog {...createProps({ open: false })} />);
    expect(screen.queryByTestId("dock-customize-dialog")).not.toBeInTheDocument();
  });

  it("グループ見出しと全スロットが一覧に出る", () => {
    render(<DockCustomizeDialog {...createProps()} />);
    const dialog = screen.getByTestId("dock-customize-dialog");
    expect(within(dialog).getByText("編集")).toBeInTheDocument();
    expect(within(dialog).getByText("表示ツール")).toBeInTheDocument();
    expect(within(dialog).getByText("セッション")).toBeInTheDocument();
    expect(within(dialog).getByText("音声")).toBeInTheDocument();
    expect(within(dialog).getByText("入出力")).toBeInTheDocument();
    expect(within(dialog).getByText("共同編集・共有")).toBeInTheDocument();

    for (const def of listDockSlotDefs()) {
      expect(
        within(dialog).getByRole("checkbox", { name: def.label }),
      ).toBeInTheDocument();
    }
  });

  it("表示ゼロなら適用が disabled で、1つ以上で有効になる", async () => {
    const user = userEvent.setup();
    const onApply = jest.fn(async (): Promise<DockApplyResult> => ({ ok: true }));
    const onDraftChange = jest.fn();
    const { rerender } = render(
      <DockCustomizeDialog
        {...createProps({
          draftVisibleSlotIds: [],
          onDraftChange,
          onApply,
        })}
      />,
    );
    const apply = screen.getByRole("button", { name: "適用" });
    expect(apply).toBeDisabled();
    await user.click(apply);
    expect(onApply).not.toHaveBeenCalled();

    rerender(
      <DockCustomizeDialog
        {...createProps({
          draftVisibleSlotIds: ["undoRedo"],
          onDraftChange,
          onApply,
        })}
      />,
    );
    expect(screen.getByRole("button", { name: "適用" })).toBeEnabled();
  });

  it("上へ／下へで draftVisibleSlotIds の並びを入れ替える", async () => {
    const user = userEvent.setup();
    const onDraftChange = jest.fn();
    const draft: DockSlotId[] = ["undoRedo", "commandPalette", "wheelZoom"];
    render(
      <DockCustomizeDialog
        {...createProps({
          draftVisibleSlotIds: draft,
          onDraftChange,
        })}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "コマンドパレットを上へ" }),
    );
    expect(onDraftChange).toHaveBeenCalledWith([
      "commandPalette",
      "undoRedo",
      "wheelZoom",
    ]);

    onDraftChange.mockClear();
    await user.click(
      screen.getByRole("button", { name: "コマンドパレットを下へ" }),
    );
    expect(onDraftChange).toHaveBeenCalledWith([
      "undoRedo",
      "wheelZoom",
      "commandPalette",
    ]);
  });

  it("既定に戻すで onResetDefault を呼び、キャンセルは onCancel のみ（適用しない）", async () => {
    const user = userEvent.setup();
    const props = createProps();
    render(<DockCustomizeDialog {...props} />);

    await user.click(screen.getByRole("button", { name: "既定に戻す" }));
    expect(props.onResetDefault).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onApply).not.toHaveBeenCalled();
  });

  it("キャンセルで破棄し適用前の visible は不変（親の下書きのみ戻る）", async () => {
    const user = userEvent.setup();
    const applied: DockSlotId[] = createDefaultDockVisibleSlotIds();
    let draft = [...applied];
    const onApply = jest.fn(async (): Promise<DockApplyResult> => {
      applied.splice(0, applied.length, ...draft);
      return { ok: true };
    });

    function Harness() {
      const [ids, setIds] = useState<DockSlotId[]>(draft);
      const [open, setOpen] = useState(true);
      draft = ids;
      return (
        <DockCustomizeDialog
          open={open}
          draftVisibleSlotIds={ids}
          onDraftChange={setIds}
          onApply={onApply}
          onCancel={() => {
            setIds([...applied]);
            setOpen(false);
          }}
          onResetDefault={() => setIds(createDefaultDockVisibleSlotIds())}
          dialogMouseClickedAtRef={{ current: null }}
          initialFocusRef={createRef<HTMLElement>()}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("checkbox", { name: "元に戻す／やり直す" }));
    expect(draft).not.toEqual(applied);

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(applied).toEqual(createDefaultDockVisibleSlotIds());
  });

  it("L-408: repeat Enter/Space と detail>1 では適用・キャンセル・上下・閉じない", () => {
    const props = createProps({
      draftVisibleSlotIds: ["undoRedo", "commandPalette"],
    });
    render(<DockCustomizeDialog {...props} />);

    const apply = screen.getByRole("button", { name: "適用" });
    const cancel = screen.getByRole("button", { name: "キャンセル" });
    const up = screen.getByRole("button", { name: "コマンドパレットを上へ" });

    for (const keyEvent of [
      { key: "Enter", repeat: true },
      { key: " ", repeat: true },
    ]) {
      expect(fireEvent.keyDown(apply, keyEvent)).toBe(false);
      expect(fireEvent.keyDown(cancel, keyEvent)).toBe(false);
      expect(fireEvent.keyDown(up, keyEvent)).toBe(false);
    }
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(props.onDraftChange).not.toHaveBeenCalled();

    fireEvent.click(apply, { detail: 2 });
    fireEvent.click(cancel, { detail: 2 });
    fireEvent.click(up, { detail: 2 });
    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onCancel).not.toHaveBeenCalled();
    expect(props.onDraftChange).not.toHaveBeenCalled();

    fireEvent.click(apply, { detail: 1 });
    expect(props.onApply).toHaveBeenCalledTimes(1);
  });

  it("ダイアログ内のマウスのクリックを dialogMouseClickedAtRef に記録する（L-408）", () => {
    const dialogMouseClickedAtRef = { current: null as number | null };
    render(
      <DockCustomizeDialog
        {...createProps({ dialogMouseClickedAtRef })}
      />,
    );
    expect(dialogMouseClickedAtRef.current).toBeNull();
    fireEvent.click(screen.getByTestId("dock-customize-dialog"), { detail: 1 });
    expect(dialogMouseClickedAtRef.current).not.toBeNull();
  });

  it("閉じた後フォーカスが initialFocusRef（カスタマイズボタン）へ戻る", async () => {
    const user = userEvent.setup();
    const customizeRef = createRef<HTMLButtonElement>();
    const onCancel = jest.fn();

    function Harness({ open }: { open: boolean }) {
      return (
        <>
          <button ref={customizeRef} type="button">
            カスタマイズ
          </button>
          <DockCustomizeDialog
            {...createProps({
              open,
              onCancel,
              initialFocusRef: customizeRef,
            })}
          />
        </>
      );
    }

    const { rerender } = render(<Harness open />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
    });

    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(onCancel).toHaveBeenCalled();

    rerender(<Harness open={false} />);
    await waitFor(() => {
      expect(customizeRef.current).toHaveFocus();
    });
  });

  it("閉じた後は Escape が onCancel を再度呼ばない（フォーカストラップ解除）", async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();

    function Harness({ open }: { open: boolean }) {
      return (
        <DockCustomizeDialog
          {...createProps({
            open,
            onCancel,
          })}
        />
      );
    }

    const { rerender } = render(<Harness open />);
    await waitFor(() => {
      expect(screen.getByTestId("dock-customize-dialog")).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");
    expect(onCancel).toHaveBeenCalledTimes(1);

    rerender(<Harness open={false} />);
    expect(screen.queryByTestId("dock-customize-dialog")).not.toBeInTheDocument();

    onCancel.mockClear();
    await user.keyboard("{Escape}");
    expect(onCancel).not.toHaveBeenCalled();
  });


  it("保存失敗時はダイアログ内インラインエラーのみ（operationNotices を増やさない。L-166）", async () => {
    const user = userEvent.setup();
    const onApply = jest.fn(async (): Promise<DockApplyResult> => ({
      ok: false,
      message: "Dock の設定を保存できませんでした。",
    }));
    render(
      <DockCustomizeDialog
        {...createProps({ onApply })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "適用" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Dock の設定を保存できませんでした。");
    expect(screen.queryByTestId("operation-notices")).not.toBeInTheDocument();
    expect(screen.getByTestId("dock-customize-dialog")).toBeInTheDocument();
  });
});
