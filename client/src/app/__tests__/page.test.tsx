import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Home from "@/app/page";
import { FALLBACK_NODE_LABEL } from "@/config/nodeLabel";
import type { IllustrationGenerationState } from "@/types/illustrationGeneration";
import type { Node } from "@/types/node";
import type { OperationNotice } from "@/types/operationNotice";

const mockDownloadMapJson = jest.fn();
const mockExportPng = jest.fn();
const mockExportSvg = jest.fn();
const mockUseMapImageExport = jest.fn();
const mockGenerateIllustration = jest.fn();
const mockDismissGeneration = jest.fn();
const mockUseIllustrationGeneration = jest.fn();
let mockGeneration: IllustrationGenerationState = { status: "idle" };
let mockImageExportNotice: OperationNotice | null = null;
let mockIsExportingPng = false;
let mockMapStageProps: {
  nodes: Node[];
  visibleNodeIds?: ReadonlySet<number>;
  onSelectNode: (id: number | null) => void;
  onViewportScaleChange?: (scale: number) => void;
} | null = null;

jest.mock("@/hooks/useIllustrationGeneration", () => ({
  useIllustrationGeneration: (nodes: readonly Node[], resetRevision: number) => {
    mockUseIllustrationGeneration(nodes, resetRevision);
    return {
      generation: mockGeneration,
      generateIllustration: mockGenerateIllustration,
      dismissGeneration: mockDismissGeneration,
    };
  },
}));

jest.mock("@/hooks/useMapImageExport", () => ({
  useMapImageExport: (options: { nodes: readonly Node[] }) => {
    mockUseMapImageExport(options);
    return {
      exportPng: mockExportPng,
      exportSvg: mockExportSvg,
      isExportingPng: mockIsExportingPng,
      notice: mockImageExportNotice,
    };
  },
}));

jest.mock("@/services/persistence/mapJsonDownload", () => {
  const actual = jest.requireActual("@/services/persistence/mapJsonDownload");
  return {
    ...actual,
    downloadMapJson: (json: string) => mockDownloadMapJson(json),
  };
});

jest.mock("@/components/map/MapStage", () => ({
  MapStage: ({
    nodes,
    selectedNodeId,
    resetRevision,
    onDoubleClick,
    visibleNodeIds,
    onSelectNode,
    onViewportScaleChange,
    onGenerateIllustration,
  }: {
    nodes: Node[];
    selectedNodeId: number | null;
    resetRevision?: number;
    onDoubleClick: (x: number, y: number) => void;
    visibleNodeIds?: ReadonlySet<number>;
    onSelectNode: (id: number | null) => void;
    onViewportScaleChange?: (scale: number) => void;
    onGenerateIllustration?: (nodeId: number) => void;
  }) => (
    <div data-testid="map-stage" ref={() => {
      mockMapStageProps = { nodes, visibleNodeIds, onSelectNode, onViewportScaleChange };
    }}>
      <output data-testid="node-state">{JSON.stringify(nodes)}</output>
      <output data-testid="selected-node-id">{selectedNodeId}</output>
      <output data-testid="reset-revision">{resetRevision ?? 0}</output>
      <button type="button" onClick={() => onDoubleClick(10, 20)}>
        テスト用ノード追加
      </button>
      <button type="button" onClick={() => onSelectNode(nodes[0]?.id ?? null)}>
        テスト用ノード選択
      </button>
      <button type="button" onClick={() => onSelectNode(nodes[1]?.id ?? null)}>
        テスト用2番目ノード選択
      </button>
      <button type="button" onClick={() => onViewportScaleChange?.(0.5)}>
        テスト用ズーム
      </button>
      <button type="button" onClick={() => onViewportScaleChange?.(0.97)}>
        テスト用中倍率
      </button>
      <button type="button" onClick={() => onGenerateIllustration?.(nodes[0]?.id ?? -1)}>
        テスト用メニュー生成
      </button>
    </div>
  ),
}));

const validImportedJson = `{
  "version": 1,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "読み込み済み"
    }
  ]
}\n`;

const resolutionImportedJson = `{
  "version": 2,
  "layoutMode": "auto",
  "nodes": [
    {
      "id": 10,
      "parentId": null,
      "x": 20,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "親ノード",
      "importance": "medium"
    },
    {
      "id": 11,
      "parentId": 10,
      "x": 220,
      "y": 30,
      "width": 160,
      "height": 64,
      "label": "低重要度の子",
      "importance": "low"
    }
  ]
}\n`;

function jsonFile(contents: string): File {
  const file = new File([contents], "map.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    configurable: true,
    value: jest.fn().mockResolvedValue(contents),
  });
  return file;
}

function queryOperationNoticeWrapper(): HTMLElement | null {
  return screen.queryByTestId("operation-notices");
}

describe("Home", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockDownloadMapJson.mockClear();
    mockExportPng.mockClear();
    mockExportSvg.mockClear();
    mockUseMapImageExport.mockClear();
    mockGenerateIllustration.mockClear();
    mockDismissGeneration.mockClear();
    mockUseIllustrationGeneration.mockClear();
    mockGeneration = { status: "idle" };
    mockImageExportNotice = null;
    mockIsExportingPng = false;
    mockMapStageProps = null;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe("配置モード配線", () => {
    it("選択したノードの重要度変更をstage propsへ反映する", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      await user.click(screen.getByRole("button", { name: "重要度 高" }));

      expect(mockMapStageProps?.nodes[0]).toMatchObject({ importance: "high" });
    });

    it("auto・手動high・auto復帰とviewport scaleをvisibleNodeIdsへ反映する", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      await user.click(screen.getByRole("button", { name: "重要度 高" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));

      const [highNode, mediumNode] = mockMapStageProps!.nodes;
      await user.click(screen.getByRole("button", { name: "テスト用中倍率" }));
      expect([...mockMapStageProps!.visibleNodeIds!]).toEqual([highNode.id, mediumNode.id]);
      await user.click(screen.getByRole("button", { name: "表示 高のみ" }));
      expect([...mockMapStageProps!.visibleNodeIds!]).toEqual([highNode.id]);
      await user.click(screen.getByRole("button", { name: "表示 自動" }));
      expect([...mockMapStageProps!.visibleNodeIds!]).toEqual([highNode.id, mediumNode.id]);
      await user.click(screen.getByRole("button", { name: "テスト用ズーム" }));
      expect([...mockMapStageProps!.visibleNodeIds!]).toEqual([highNode.id]);
    });
    it("配置モードと変更commandをヘッダーへ接続する", async () => {
      const user = userEvent.setup();
      render(<Home />);

      expect(screen.getByRole("button", { name: "手動配置" }))
        .toHaveAttribute("aria-pressed", "true");
      await user.click(screen.getByRole("button", { name: "自動配置" }));

      expect(screen.getByRole("button", { name: "自動配置" }))
        .toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("永続化配線", () => {
    it("現在のマップをJSON書き出しcommandへ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "JSON書き出し" }));

      expect(mockDownloadMapJson).toHaveBeenCalledWith(`{
  "version": 3,
  "layoutMode": "manual",
  "nodes": []
}\n`);
      const persistenceNotice = screen.getByText("JSONファイルを書き出しました。");
      expect(persistenceNotice).toBeInTheDocument();
      expect(queryOperationNoticeWrapper()).toContainElement(persistenceNotice);
    });

    it("検証済みファイルでノード・モードを置換してstageをリセットする", async () => {
      const user = userEvent.setup();
      const { container } = render(<Home />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await user.upload(input, jsonFile(validImportedJson));

      await waitFor(() => {
        expect(screen.getByTestId("node-state")).toHaveTextContent("読み込み済み");
      });
      expect(screen.getByTestId("node-state"))
        .toHaveTextContent('"importance":"medium"');
      expect(screen.getByRole("button", { name: "自動配置" }))
        .toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("selected-node-id")).toHaveTextContent("");
      expect(screen.getByTestId("reset-revision")).toHaveTextContent("1");
      expect(screen.getByText("マップを読み込みました。"))
        .toBeInTheDocument();
    });

    it.each([
      ["auto", null],
      ["high", "表示 高のみ"],
      ["medium", "表示 中以上"],
      ["all", "表示 すべて"],
    ] as const)("%s modeからの読み込みresetはMapStageの最終scale=1と同期して自動ですべてを表示する", async (_mode, modeButton) => {
      const user = userEvent.setup();
      const { container } = render(<Home />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await user.click(screen.getByRole("button", { name: "テスト用ズーム" }));
      if (modeButton !== null) {
        await user.click(screen.getByRole("button", { name: modeButton }));
      }
      await user.upload(input, jsonFile(resolutionImportedJson));

      await waitFor(() => {
        expect(screen.getByTestId("reset-revision")).toHaveTextContent("1");
      });
      expect(screen.getByText("現在: すべて")).toBeInTheDocument();
      expect([...mockMapStageProps!.visibleNodeIds!]).toEqual([10, 11]);

      act(() => mockMapStageProps?.onViewportScaleChange?.(1));

      expect(screen.getByRole("button", { name: "表示 自動" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByText("現在: すべて")).toBeInTheDocument();
      expect([...mockMapStageProps!.visibleNodeIds!]).toEqual([10, 11]);
    });

    it("不正ファイルではマップとstage revisionを変更しない", async () => {
      const user = userEvent.setup();
      const { container } = render(<Home />);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
      const before = screen.getByTestId("node-state").textContent;

      await user.upload(input, jsonFile("{broken"));

      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(
        "現在のマップは変更されていません。",
      ));
      expect(screen.getByTestId("node-state")).toHaveTextContent(before ?? "");
      expect(screen.getByTestId("reset-revision")).toHaveTextContent("0");
    });

    it("ノード変更をlocalStorageへ自動保存する", async () => {
      jest.useFakeTimers();
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      jest.advanceTimersByTime(300);

      const stored = window.localStorage.getItem("draw-my-map.map.v1");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toMatchObject({
        version: 3,
        layoutMode: "manual",
        nodes: [expect.objectContaining({
          x: -40,
          y: -10,
          importance: "medium",
        })],
      });
    });
  });

  describe("画像書き出し配線", () => {
    it("現在のノード配列を画像書き出しHookへ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);

      expect(mockUseMapImageExport).toHaveBeenLastCalledWith({ nodes: [] });

      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));

      expect(mockUseMapImageExport).toHaveBeenLastCalledWith({
        nodes: [expect.objectContaining({ x: -40, y: -10 })],
      });
    });

    it("PNGとSVGの各ボタンを画像書き出しcommandへ接続する", async () => {
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "PNG書き出し" }));
      await user.click(screen.getByRole("button", { name: "SVG書き出し" }));

      expect(mockExportPng).toHaveBeenCalledTimes(1);
      expect(mockExportSvg).toHaveBeenCalledTimes(1);
    });

    it("PNG処理中はPNG書き出しボタンを無効化する", () => {
      mockIsExportingPng = true;

      render(<Home />);

      expect(screen.getByRole("button", { name: "PNG書き出し" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "SVG書き出し" })).toBeEnabled();
    });

    it("永続化通知と画像書き出し通知を同時に表示する", async () => {
      mockImageExportNotice = {
        kind: "warning",
        message: "書き出すノードがありません。",
      };
      const user = userEvent.setup();
      render(<Home />);

      await user.click(screen.getByRole("button", { name: "JSON書き出し" }));

      const persistenceNotice = screen.getByText("JSONファイルを書き出しました。");
      const imageExportNotice = screen.getByText("書き出すノードがありません。");
      expect(persistenceNotice).toHaveAttribute("role", "status");
      expect(imageExportNotice).toHaveAttribute("role", "alert");
      expect(queryOperationNoticeWrapper()).toContainElement(persistenceNotice);
      expect(queryOperationNoticeWrapper()).toContainElement(imageExportNotice);
    });
  });

  describe("レイアウト", () => {
    it("通知がない通常時はheaderに全幅の通知行を確保しない", () => {
      render(<Home />);

      expect(queryOperationNoticeWrapper()).not.toBeInTheDocument();
    });

    it("可変高headerを除いたviewport内の残領域をmapへ割り当てる", () => {
      render(<Home />);
      const main = screen.getByTestId("map-stage").closest("main")!;
      const shell = main.parentElement!;

      expect(shell).toHaveClass("h-dvh");
      expect(shell).not.toHaveClass("overflow-hidden");
      expect(main).toHaveClass("min-h-0", "flex-1", "overflow-hidden");
    });
  });

  describe("イラスト生成パネルの配線", () => {
    it("ノード未選択のときは案内を表示し、生成ボタンを無効にする", () => {
      render(<Home />);

      expect(screen.getByRole("complementary", { name: "イラスト" })).toBeInTheDocument();
      expect(screen.getByText("ノードを選択してください")).toBeVisible();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
    });

    it("ノードを選択すると、ラベルを表示し、生成ボタンを有効にする", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));

      expect(screen.getByText(FALLBACK_NODE_LABEL)).toBeVisible();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeEnabled();
    });

    it("パネルの生成ボタンで、選択中のノードIDを生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      const selectedId = mockMapStageProps!.nodes[0].id;

      await user.click(screen.getByRole("button", { name: "イラストを生成" }));

      expect(mockGenerateIllustration).toHaveBeenCalledTimes(1);
      expect(mockGenerateIllustration).toHaveBeenCalledWith(selectedId);
    });

    it("生成結果の「ノードに設定」で、ノードにイラストが入り、プレビューを破棄する", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      const nodeId = mockMapStageProps!.nodes[0].id;
      mockGeneration = { status: "succeeded", nodeId, label: mockMapStageProps!.nodes[0].label, dataUrl: "data:image/jpeg;base64,AAAA" };
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" })); // 再描画させ、モックの生成状態を反映する

      await user.click(screen.getByRole("button", { name: "ノードに設定" }));

      expect(mockMapStageProps!.nodes[0].illustration).toBe("data:image/jpeg;base64,AAAA");
      expect(mockDismissGeneration).toHaveBeenCalledTimes(1);
    });

    it("設定したあと「イラストを削除」を押すと、設定済みのイラストが消え、生成ボタンが「イラストを生成」に戻る", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      const nodeId = mockMapStageProps!.nodes[0].id;
      mockGeneration = { status: "succeeded", nodeId, label: mockMapStageProps!.nodes[0].label, dataUrl: "data:image/jpeg;base64,AAAA" };
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" })); // 再描画させ、モックの生成状態を反映する
      await user.click(screen.getByRole("button", { name: "ノードに設定" }));
      mockGeneration = { status: "idle" }; // 実物では dismissGeneration でプレビューが消える
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      expect(screen.getByText("設定済みのイラスト")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "イラストを再生成" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "イラストを削除" }));

      expect(mockMapStageProps!.nodes[0].illustration).toBeUndefined();
      expect(screen.queryByText("設定済みのイラスト")).toBeNull();
      expect(screen.queryByRole("button", { name: "イラストを削除" })).toBeNull();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeInTheDocument();
    });

    it("選択したノードが2番目でも、そのノードのIDを生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用2番目ノード選択" }));
      const [firstNode, secondNode] = mockMapStageProps!.nodes;

      await user.click(screen.getByRole("button", { name: "イラストを生成" }));

      expect(mockGenerateIllustration).toHaveBeenCalledTimes(1);
      expect(mockGenerateIllustration).toHaveBeenCalledWith(secondNode.id);
      expect(mockGenerateIllustration).not.toHaveBeenCalledWith(firstNode.id);
    });

    it("選択を2番目から1番目へ切り替えると、生成の入口へ渡すIDも切り替わる", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      const [firstNode, secondNode] = mockMapStageProps!.nodes;

      await user.click(screen.getByRole("button", { name: "テスト用2番目ノード選択" }));
      await user.click(screen.getByRole("button", { name: "イラストを生成" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      await user.click(screen.getByRole("button", { name: "イラストを生成" }));

      expect(mockGenerateIllustration.mock.calls).toEqual([[secondNode.id], [firstNode.id]]);
    });

    it("右クリックメニューからの要求も、同じ生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      const nodeId = mockMapStageProps!.nodes[0].id;

      await user.click(screen.getByRole("button", { name: "テスト用メニュー生成" }));

      expect(mockGenerateIllustration).toHaveBeenCalledWith(nodeId);
    });

    it("ノードの一覧を、生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));

      expect(mockUseIllustrationGeneration).toHaveBeenLastCalledWith(mockMapStageProps!.nodes, expect.any(Number));
    });

    it("マップを読み込むと、増えた resetRevision を生成の入口へ渡す", async () => {
      const user = userEvent.setup();
      const { container } = render(<Home />);
      expect(mockUseIllustrationGeneration).toHaveBeenLastCalledWith(expect.anything(), 0);
      const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;

      await user.upload(input, jsonFile(validImportedJson));

      await waitFor(() => {
        expect(screen.getByTestId("reset-revision")).toHaveTextContent("1");
      });
      expect(mockUseIllustrationGeneration).toHaveBeenLastCalledWith(expect.anything(), 1);
    });

    it("生成の状態を、パネルへ渡す（選択中のノードの結果を画像で表示する）", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      const nodeId = mockMapStageProps!.nodes[0].id;
      mockGeneration = { status: "succeeded", nodeId, label: mockMapStageProps!.nodes[0].label, dataUrl: "data:image/jpeg;base64,AAA" };
      await user.click(screen.getByRole("button", { name: "テスト用中倍率" })); // 再描画を起こす

      expect(screen.getByRole("img")).toHaveAttribute("src", "data:image/jpeg;base64,AAA");
    });

    it("選択を解除すると、パネルは案内に戻る", async () => {
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "テスト用ノード追加" }));
      await user.click(screen.getByRole("button", { name: "テスト用ノード選択" }));
      act(() => mockMapStageProps!.onSelectNode(null));

      expect(screen.getByText("ノードを選択してください")).toBeVisible();
      expect(screen.getByRole("button", { name: "イラストを生成" })).toBeDisabled();
    });

    it("キャンバスとパネルを同じ作業領域に表示する", () => {
      render(<Home />);

      const main = screen.getByRole("main");
      expect(main).toContainElement(screen.getByTestId("map-stage"));
      const panel = screen.getByRole("complementary", { name: "イラスト" });
      expect(main).toContainElement(panel);
    });
  });
});
