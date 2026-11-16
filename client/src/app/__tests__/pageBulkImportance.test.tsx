import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import type { Node } from "@/types/node";

let mockNodes: Node[] = [];

jest.mock("@/hooks/useIllustrationGeneration", () => ({
  useIllustrationGeneration: () => ({
    generation: { status: "idle" },
    generateIllustration: jest.fn(),
    dismissGeneration: jest.fn(),
  }),
}));

jest.mock("@/hooks/useMapImageExport", () => ({
  useMapImageExport: () => ({
    exportPng: jest.fn(),
    exportSvg: jest.fn(),
    isExportingPng: false,
    notice: null,
  }),
}));

jest.mock("@/components/map/MapStage", () => ({
  MapStage: ({
    nodes,
    onDoubleClick,
    onSelectNode,
    onToggleNodeSelection,
  }: {
    nodes: Node[];
    onDoubleClick: (x: number, y: number) => void;
    onSelectNode: (id: number | null) => void;
    onToggleNodeSelection: (id: number) => void;
  }) => {
    mockNodes = nodes;
    return (
      <div data-testid="map-stage">
        <button type="button" onClick={() => onDoubleClick(10, 20)}>テスト用ノード追加</button>
        {nodes.map((node, index) => (
          <span key={node.id}>
            <button type="button" onClick={() => onSelectNode(node.id)}>
              {`テスト用選択${index + 1}`}
            </button>
            <button type="button" onClick={() => onToggleNodeSelection(node.id)}>
              {`テスト用トグル${index + 1}`}
            </button>
          </span>
        ))}
      </div>
    );
  },
}));

function importances() {
  return mockNodes.map((node) => node.importance);
}

// 3件を作り、1件目を高・2件目を中・3件目を中にする（3件目は選択しない対照）
async function setupThreeNodes(user: ReturnType<typeof userEvent.setup>) {
  render(<Home />);
  for (let i = 0; i < 3; i += 1) {
    await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
  }
  await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
  await user.click(screen.getByRole("button", { name: "重要度 高" }));
  expect(importances()).toEqual(["high", "medium", "medium"]);
}

describe("選択ノードの重要度の一括編集", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockNodes = [];
  });

  it("2件選択中に重要度を押すと両方が変わり、選択外は変わらない。Undo 1回で両方戻る", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル2" }));
    await user.click(screen.getByRole("button", { name: "重要度 低" }));

    expect(importances()).toEqual(["low", "low", "medium"]);

    await user.click(screen.getByRole("button", { name: "元に戻す" }));
    expect(importances()).toEqual(["high", "medium", "medium"]);
  });

  it("重要度が混在する2件の選択ではどのボタンも押下表示にせず、件数と混在を表示する", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル2" }));

    expect(screen.getByText("2件選択中・混在")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "重要度（2件選択中）" })).toBeInTheDocument();
    ["重要度 高", "重要度 中", "重要度 低"].forEach((name) => {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("同じ重要度の2件の選択ではその重要度を押下表示にする", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    // 既定値（中）のまま比べないよう、2件目と3件目を1件ずつ「低」にしてから選ぶ
    await user.click(screen.getByRole("button", { name: "テスト用選択2" }));
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    await user.click(screen.getByRole("button", { name: "テスト用選択3" }));
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    expect(importances()).toEqual(["high", "low", "low"]);

    await user.click(screen.getByRole("button", { name: "テスト用選択2" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル3" }));

    expect(screen.getByText("2件選択中")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重要度 低" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "重要度 高" })).toHaveAttribute("aria-pressed", "false");
  });

  it("2件選択したままアウトラインへ切り替えると、重要度の変更は主選択だけに作用する", async () => {
    const user = userEvent.setup();
    await setupThreeNodes(user);

    // 1件目を選び、2件目をトグルで追加する（主選択は2件目）
    await user.click(screen.getByRole("button", { name: "テスト用選択1" }));
    await user.click(screen.getByRole("button", { name: "テスト用トグル2" }));
    await user.click(screen.getByRole("button", { name: "アウトライン" }));

    expect(screen.getByRole("group", { name: "重要度" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "重要度 低" }));
    await user.click(screen.getByRole("button", { name: "マップ" }));

    expect(importances()).toEqual(["high", "low", "medium"]);
  });
});
