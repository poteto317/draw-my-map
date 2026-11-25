import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import type { EditorViewMode } from "@/domain/view/editorViewMode";
import type { AiAssistFocusRequest } from "@/hooks/aiAssistDialogState";
import { useAiAssistFocusReturn } from "@/hooks/useAiAssistFocusReturn";

type HarnessProps = {
  focusRequest: AiAssistFocusRequest;
  viewMode?: EditorViewMode;
  summaryDisabled?: boolean;
  onConsume: () => void;
};

function Harness({ focusRequest, viewMode = "map", summaryDisabled = false, onConsume }: HarnessProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { summaryButtonRef, importanceButtonRef } = useAiAssistFocusReturn({
    focusRequest,
    consumeFocusRequest: onConsume,
    viewMode,
    canvasRef,
  });
  return (
    <>
      <div ref={canvasRef} tabIndex={-1} data-testid="canvas" />
      <div data-outline-root>
        <ol>
          <li><button>アウトラインの行</button></li>
        </ol>
      </div>
      <button ref={summaryButtonRef} disabled={summaryDisabled}>枝を要約</button>
      <button ref={importanceButtonRef}>重要度を提案</button>
    </>
  );
}

describe("useAiAssistFocusReturn", () => {
  it("右パネルから開いた要約を閉じると、要約のボタンへ戻して要求を消費する", () => {
    const onConsume = jest.fn();
    render(<Harness focusRequest={{ target: "panel", kind: "branch-summary" }} onConsume={onConsume} />);
    expect(screen.getByRole("button", { name: "枝を要約" })).toHaveFocus();
    expect(onConsume).toHaveBeenCalledTimes(1);
  });

  it("右パネルから開いた重要度の提案を閉じると、重要度のボタンへ戻す", () => {
    render(<Harness focusRequest={{ target: "panel", kind: "importance" }} onConsume={jest.fn()} />);
    expect(screen.getByRole("button", { name: "重要度を提案" })).toHaveFocus();
  });

  it("右パネルのボタンが無効なら、マップ表示ではキャンバスへ戻す", () => {
    render(
      <Harness focusRequest={{ target: "panel", kind: "branch-summary" }} summaryDisabled onConsume={jest.fn()} />,
    );
    expect(screen.getByTestId("canvas")).toHaveFocus();
  });

  it("コマンドパレットから開いたときは、ボタンが有効でもキャンバスへ戻す", () => {
    render(<Harness focusRequest={{ target: "palette", kind: "branch-summary" }} onConsume={jest.fn()} />);
    expect(screen.getByTestId("canvas")).toHaveFocus();
  });

  it("アウトライン表示でパレットから開いたときは、アウトラインの行へ戻す", () => {
    render(
      <Harness focusRequest={{ target: "palette", kind: "importance" }} viewMode="outline" onConsume={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: "アウトラインの行" })).toHaveFocus();
  });

  it("要求が無いときは、フォーカスを動かさず消費もしない", () => {
    const onConsume = jest.fn();
    render(<Harness focusRequest={null} onConsume={onConsume} />);
    expect(document.body).toHaveFocus();
    expect(onConsume).not.toHaveBeenCalled();
  });
});
