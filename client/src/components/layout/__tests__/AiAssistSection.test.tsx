import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiAssistSection } from "@/components/layout/AiAssistSection";

describe("AiAssistSection", () => {
  it("見出し「AI支援」と 2 つのボタンを出し、押すと入口を呼ぶ", async () => {
    const user = userEvent.setup();
    const onOpenSummary = jest.fn();
    const onOpenImportance = jest.fn();
    const summaryButtonRef = createRef<HTMLButtonElement>();
    render(
      <AiAssistSection
        summary={{ enabled: true, rootId: 1 }}
        importance={{ enabled: true, rootId: 1 }}
        summaryButtonRef={summaryButtonRef}
        importanceButtonRef={createRef<HTMLButtonElement>()}
        onOpenSummary={onOpenSummary}
        onOpenImportance={onOpenImportance}
      />,
    );

    expect(screen.getByRole("region", { name: "AI支援" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "枝を要約してメモに入れる…" }));
    await user.click(screen.getByRole("button", { name: "重要度を提案…" }));
    expect(onOpenSummary).toHaveBeenCalledTimes(1);
    expect(onOpenImportance).toHaveBeenCalledTimes(1);
    expect(summaryButtonRef.current).toBe(screen.getByRole("button", { name: "枝を要約してメモに入れる…" }));
  });

  it("無効なボタンは理由を説明に結び付けて見せる（L-057）", () => {
    render(
      <AiAssistSection
        summary={{ enabled: false, reason: "子孫が無いため要約できません" }}
        importance={{ enabled: false, reason: "1 件のノードを選んでください" }}
        summaryButtonRef={createRef<HTMLButtonElement>()}
        importanceButtonRef={createRef<HTMLButtonElement>()}
        onOpenSummary={jest.fn()}
        onOpenImportance={jest.fn()}
      />,
    );
    const summary = screen.getByRole("button", { name: "枝を要約してメモに入れる…" });
    expect(summary).toBeDisabled();
    expect(summary).toHaveAccessibleDescription("子孫が無いため要約できません");
    expect(screen.getByRole("button", { name: "重要度を提案…" })).toHaveAccessibleDescription("1 件のノードを選んでください");
  });
});
