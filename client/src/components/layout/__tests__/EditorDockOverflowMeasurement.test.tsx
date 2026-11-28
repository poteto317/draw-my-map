import { createRef } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { EditorDock, type EditorDockSlot } from "@/components/layout/EditorDock";
import type { DockSlotId } from "@/domain/dock/dockSlotCatalog";

function slot(id: DockSlotId, label: string): EditorDockSlot {
  return { id, node: <button type="button">{label}</button> };
}

describe("EditorDock overflow 計測（jsdom 契約）", () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientWidth",
  );

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
    }
  });

  function installNarrowLayoutPollution(slotWidth = 90, containerWidth = 240) {
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get(this: HTMLElement) {
        if (this.getAttribute("data-testid") === "editor-dock-slots") {
          return containerWidth;
        }
        return originalClientWidth?.get?.call(this) ?? 0;
      },
    });
    jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const isSlot = this.classList.contains("editor-dock__slot");
        const isTrigger = this.classList.contains("editor-dock__overflow-trigger");
        const width = isSlot ? slotWidth : isTrigger ? 64 : 0;
        return {
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: width,
          bottom: 24,
          width,
          height: 24,
          toJSON: () => ({}),
        } as DOMRect;
      });
  }

  it("jsdom では自動計測せず、狭幅モック下でも全スロットを primary に出す", () => {
    installNarrowLayoutPollution();
    render(
      <EditorDock
        slots={[
          slot("undoRedo", "A"),
          slot("commandPalette", "B"),
          slot("wheelZoom", "C"),
          slot("importance", "D"),
          slot("duplicateBranch", "枝を複製"),
        ]}
        onCustomize={jest.fn()}
        customizeButtonRef={createRef()}
        isNarrowViewport={false}
      />,
    );
    expect(screen.getByRole("button", { name: "枝を複製" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "その他" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "枝を複製" }));
  });

  it("スロット集合が増えたとき、短いときの計測値で後ろのスロットを隠さない", () => {
    installNarrowLayoutPollution();
    const shortSlots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
    ];
    const longSlots: EditorDockSlot[] = [
      slot("undoRedo", "スロットA"),
      slot("commandPalette", "スロットB"),
      slot("wheelZoom", "スロットC"),
      slot("importance", "スロットD"),
    ];
    const { rerender } = render(
      <EditorDock
        slots={shortSlots}
        onCustomize={jest.fn()}
        customizeButtonRef={createRef()}
        isNarrowViewport={false}
      />,
    );
    const dock = screen.getByTestId("editor-dock");
    rerender(
      <EditorDock
        slots={longSlots}
        onCustomize={jest.fn()}
        customizeButtonRef={createRef()}
        isNarrowViewport={false}
      />,
    );
    expect(within(dock).getByRole("button", { name: "スロットC" })).toBeInTheDocument();
    expect(within(dock).getByRole("button", { name: "スロットD" })).toBeInTheDocument();
    expect(
      within(dock).queryByRole("button", { name: "その他" }),
    ).not.toBeInTheDocument();
  });
});
