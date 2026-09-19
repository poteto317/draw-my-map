import { fireEvent, render, screen } from "@testing-library/react";
import { LayoutModeSelector } from "@/components/layout/LayoutModeSelector";

describe("LayoutModeSelector", () => {
  it("選択肢を名前付きグループとして提供する", () => {
    render(
      <LayoutModeSelector
        layoutMode="manual"
        onLayoutModeChange={jest.fn()}
      />,
    );

    expect(screen.getByRole("group", { name: "レイアウトモード" }))
      .toBeInTheDocument();
  });

  it.each([
    ["manual", "手動配置", "自動配置"],
    ["auto", "自動配置", "手動配置"],
  ] as const)(
    "%sモードを選択状態として示す",
    (layoutMode, selectedLabel, idleLabel) => {
      render(
        <LayoutModeSelector
          layoutMode={layoutMode}
          onLayoutModeChange={jest.fn()}
        />,
      );

      const selectedButton = screen.getByRole("button", { name: selectedLabel });
      const idleButton = screen.getByRole("button", { name: idleLabel });
      expect(selectedButton).toHaveAttribute("aria-pressed", "true");
      expect(selectedButton).toHaveClass("bg-blue-600", "text-white");
      expect(idleButton).toHaveAttribute("aria-pressed", "false");
      expect(idleButton).toHaveClass("bg-zinc-100", "text-zinc-700");
    },
  );

  it.each([
    ["manual", "自動配置", "auto"],
    ["auto", "手動配置", "manual"],
  ] as const)(
    "%sモードからクリックしたモードへの変更を通知する",
    (layoutMode, targetLabel, expectedMode) => {
      const onLayoutModeChange = jest.fn();
      render(
        <LayoutModeSelector
          layoutMode={layoutMode}
          onLayoutModeChange={onLayoutModeChange}
        />,
      );

      const targetButton = screen.getByRole("button", { name: targetLabel });
      expect(targetButton).toHaveAttribute("type", "button");

      fireEvent.click(targetButton);

      expect(onLayoutModeChange).toHaveBeenCalledTimes(1);
      expect(onLayoutModeChange).toHaveBeenCalledWith(expectedMode);
    },
  );
});
