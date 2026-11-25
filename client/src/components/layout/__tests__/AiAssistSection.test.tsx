import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiAssistSection, type AiAssistSectionProps } from "@/components/layout/AiAssistSection";

function baseProps(overrides: Partial<AiAssistSectionProps> = {}): AiAssistSectionProps {
  return {
    summary: { enabled: true, rootId: 1 },
    importance: { enabled: true, rootId: 1 },
    childCandidates: { enabled: true, rootId: 1 },
    classifyReorder: { enabled: true, rootId: 1 },
    duplicates: { enabled: true, rootId: 1 },
    missingPerspectives: { enabled: true, rootId: 1 },
    summaryButtonRef: createRef<HTMLButtonElement>(),
    importanceButtonRef: createRef<HTMLButtonElement>(),
    childCandidatesButtonRef: createRef<HTMLButtonElement>(),
    classifyReorderButtonRef: createRef<HTMLButtonElement>(),
    duplicatesButtonRef: createRef<HTMLButtonElement>(),
    missingPerspectivesButtonRef: createRef<HTMLButtonElement>(),
    onOpenSummary: jest.fn(),
    onOpenImportance: jest.fn(),
    onOpenChildCandidates: jest.fn(),
    onOpenClassifyReorder: jest.fn(),
    onOpenDuplicates: jest.fn(),
    onOpenMissingPerspectives: jest.fn(),
    ...overrides,
  };
}

describe("AiAssistSection", () => {
  it("見出し「AI支援」と 078–081 を含む 6 ボタンを出し、押すと入口を呼ぶ", async () => {
    const user = userEvent.setup();
    const onOpenSummary = jest.fn();
    const summaryButtonRef = createRef<HTMLButtonElement>();
    render(
      <AiAssistSection {...baseProps({ onOpenSummary, summaryButtonRef })} />,
    );

    expect(screen.getByRole("region", { name: "AI支援" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "枝を要約してメモに入れる…" }));
    await user.click(screen.getByRole("button", { name: "子の候補を提案…" }));
    expect(onOpenSummary).toHaveBeenCalledTimes(1);
    expect(summaryButtonRef.current).toBe(screen.getByRole("button", { name: "枝を要約してメモに入れる…" }));
  });

  it("無効なボタンは理由を説明に結び付けて見せる（L-057）", () => {
    render(
      <AiAssistSection
        {...baseProps({
          summary: { enabled: false, reason: "子孫が無いため要約できません" },
          importance: { enabled: false, reason: "1 件のノードを選んでください" },
        })}
      />,
    );
    const summary = screen.getByRole("button", { name: "枝を要約してメモに入れる…" });
    expect(summary).toBeDisabled();
    expect(summary).toHaveAccessibleDescription("子孫が無いため要約できません");
    expect(screen.getByRole("button", { name: "重要度を提案…" })).toHaveAccessibleDescription("1 件のノードを選んでください");
  });
});
