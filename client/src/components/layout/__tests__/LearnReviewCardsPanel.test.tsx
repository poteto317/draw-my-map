import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LearnReviewCardsPanel } from "@/components/layout/LearnReviewCardsPanel";

describe("LearnReviewCardsPanel", () => {
  const card = {
    id: "c1",
    prompt: "Q",
    answer: "A",
    sourceNodeIds: [1] as const,
  };

  it("空状態と表裏表示", async () => {
    const user = userEvent.setup();
    const onFlip = jest.fn();
    const base = {
      open: true,
      cardIndex: 0,
      showingAnswer: false,
      onClose: jest.fn(),
      onFlip,
      onPrevious: jest.fn(),
      onNext: jest.fn(),
      canGenerate: true,
      generateDisabledReason: null,
    };

    const { rerender } = render(<LearnReviewCardsPanel {...base} cards={[]} />);
    expect(screen.getByText(/まだありません/)).toBeInTheDocument();

    rerender(<LearnReviewCardsPanel {...base} cards={[card]} />);
    expect(screen.getByText("Q")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "表裏をめくる" }));
    expect(onFlip).toHaveBeenCalled();

    rerender(<LearnReviewCardsPanel {...base} cards={[card]} showingAnswer />);
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});