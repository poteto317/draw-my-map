import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { BrokenMapLinksDialog } from "@/components/layout/BrokenMapLinksDialog";
import type { CrossMapCorpus } from "@/domain/mapLibrary/crossMapCorpus";
import { removeNodeMapLink, type NodeMapLink } from "@/domain/nodes/nodeMapLink";
import { createTestNode } from "@/testing/createTestNode";
import type { Node } from "@/types/node";

type Props = ComponentProps<typeof BrokenMapLinksDialog>;

function createBrokenCorpus(): CrossMapCorpus {
  return {
    readableMaps: [
      {
        mapId: "map-current",
        mapName: "現在のマップ",
        isCurrent: true,
        isArchived: false,
        nodes: [
          createTestNode({
            id: 1,
            label: "現在ノードA",
            mapLinks: [
              { targetMapId: "map-deleted" },
              { targetMapId: "map-other", targetNodeId: 999 },
            ],
          }),
        ],
      },
      {
        mapId: "map-other",
        mapName: "別マップ",
        isCurrent: false,
        isArchived: false,
        nodes: [
          createTestNode({
            id: 20,
            label: "他マップノードB",
            mapLinks: [{ targetMapId: "map-corrupt", targetNodeId: 5 }],
          }),
        ],
      },
    ],
    unreadableMaps: [
      { mapId: "map-corrupt", mapName: "破損マップ", reason: "corrupt" },
    ],
  };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props: Props = {
    corpus: createBrokenCorpus(),
    onNavigateToSource: jest.fn(),
    onRemoveCurrentMapLink: jest.fn(() => true),
    onClose: jest.fn(),
    onMouseClick: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<BrokenMapLinksDialog {...props} />) };
}

describe("BrokenMapLinksDialog", () => {
  it("リンク切れが 0 件のときは案内文を表示し、初期フォーカスがダイアログ内の閉じるボタンに当たる", () => {
    const cleanCorpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: "map-current",
          mapName: "現在のマップ",
          isCurrent: true,
        isArchived: false,
          nodes: [createTestNode({ id: 1, label: "正常ノード" })],
        },
      ],
      unreadableMaps: [],
    };
    renderDialog({ corpus: cleanCorpus });

    const dialog = screen.getByRole("dialog", { name: "リンク切れの確認" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "リンク切れは見つかりませんでした",
    );
    expect(within(dialog).queryByRole("list")).toBeNull();
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toHaveFocus();
  });

  it("リンク切れ一覧の件数・理由バッジ（マップなし・ノードなし・読込失敗）・現在バッジ・リンク先情報を表示し、ボタン非入れ子構成を守る（L-835）", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "リンク切れの確認" });
    expect(within(dialog).getByRole("status")).toHaveTextContent(
      "3 件のリンク切れが見つかりました",
    );

    const list = within(dialog).getByRole("list", { name: "リンク切れ一覧" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);

    // 1 件目: 現在マップ・missing-map（targetNodeId なし）
    expect(items[0]).toHaveTextContent("現在のマップ");
    expect(items[0]).toHaveTextContent("現在");
    expect(items[0]).toHaveTextContent("現在ノードA");
    expect(items[0]).toHaveTextContent("map-deleted");
    expect(items[0]).toHaveTextContent("マップなし");
    const buttons0 = within(items[0]).getAllByRole("button");
    expect(buttons0).toHaveLength(2);
    for (const button of buttons0) {
      expect(button.querySelector("button")).toBeNull();
    }

    // 2 件目: 現在マップ・missing-node（targetMapName と #999）
    expect(items[1]).toHaveTextContent("現在のマップ");
    expect(items[1]).toHaveTextContent("現在");
    expect(items[1]).toHaveTextContent("現在ノードA");
    expect(items[1]).toHaveTextContent("別マップ #999");
    expect(items[1]).toHaveTextContent("ノードなし");
    expect(within(items[1]).getAllByRole("button")).toHaveLength(2);

    // 3 件目: 他マップ・unreadable-map（削除ボタンは出さない）
    expect(items[2]).toHaveTextContent("別マップ");
    expect(items[2]).not.toHaveTextContent("現在");
    expect(items[2]).toHaveTextContent("他マップノードB");
    expect(items[2]).toHaveTextContent("破損マップ #5");
    expect(items[2]).toHaveTextContent("読込失敗");
    expect(within(items[2]).getAllByRole("button")).toHaveLength(1);
    expect(
      within(items[2]).queryByRole("button", { name: "このリンクを削除" }),
    ).toBeNull();
  });

  it("「参照元へ移動」ボタンで onNavigateToSource(sourceMapId, sourceNodeId) を呼ぶ", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();

    const items = within(screen.getByRole("list", { name: "リンク切れ一覧" })).getAllByRole("listitem");

    await user.click(within(items[0]).getByRole("button", { name: "参照元へ移動" }));
    expect(props.onNavigateToSource).toHaveBeenNthCalledWith(1, "map-current", 1);

    await user.click(within(items[2]).getByRole("button", { name: "参照元へ移動" }));
    expect(props.onNavigateToSource).toHaveBeenNthCalledWith(2, "map-other", 20);
  });

  it("現在マップの「このリンクを削除」は item.link を値渡しし、削除後に項目が消えても閉じるボタンへ安全にフォーカス復帰する（L-035・L-397）", async () => {
    const user = userEvent.setup();
    const onRemoveSpy = jest.fn();

    function Harness() {
      const [currentNodes, setCurrentNodes] = useState<Node[]>(() => [
        createTestNode({
          id: 1,
          label: "現在ノードA",
          mapLinks: [{ targetMapId: "map-deleted", targetNodeId: 77 }],
        }),
      ]);

      const corpus: CrossMapCorpus = {
        readableMaps: [
          {
            mapId: "map-current",
            mapName: "現在のマップ",
            isCurrent: true,
        isArchived: false,
            nodes: currentNodes,
          },
        ],
        unreadableMaps: [],
      };

      const handleRemove = (sourceNodeId: number, link: NodeMapLink): boolean => {
        onRemoveSpy(sourceNodeId, link);
        const next = removeNodeMapLink(currentNodes, sourceNodeId, link);
        if (next === null) return false;
        setCurrentNodes(next);
        return true;
      };

      return (
        <BrokenMapLinksDialog
          corpus={corpus}
          onNavigateToSource={jest.fn()}
          onRemoveCurrentMapLink={handleRemove}
          onClose={jest.fn()}
          onMouseClick={jest.fn()}
        />
      );
    }

    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "このリンクを削除" }));

    expect(onRemoveSpy).toHaveBeenCalledTimes(1);
    expect(onRemoveSpy).toHaveBeenCalledWith(1, {
      targetMapId: "map-deleted",
      targetNodeId: 77,
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "リンク切れは見つかりませんでした",
    );
    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  });

  it("onRemoveCurrentMapLink が false を返したときはフォーカスを閉じるボタンへ奪わない", async () => {
    const user = userEvent.setup();
    renderDialog({ onRemoveCurrentMapLink: jest.fn(() => false) });

    const firstItem = within(
      screen.getByRole("list", { name: "リンク切れ一覧" }),
    ).getAllByRole("listitem")[0];
    const removeButton = within(firstItem).getByRole("button", { name: "このリンクを削除" });

    await user.click(removeButton);
    expect(removeButton).toHaveFocus();
  });

  it("unreadableMaps があるときは role=alert で読み取れなかったマップ名を列挙する（L-002）", () => {
    const corpus: CrossMapCorpus = {
      readableMaps: [
        {
          mapId: "map-current",
          mapName: "現在のマップ",
          isCurrent: true,
        isArchived: false,
          nodes: [createTestNode({ id: 1, label: "ノード" })],
        },
      ],
      unreadableMaps: [
        { mapId: "map-bad-1", mapName: "破損マップX", reason: "corrupt" },
        { mapId: "map-bad-2", mapName: "読込失敗マップY", reason: "read-error" },
      ],
    };
    renderDialog({ corpus });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("破損マップX");
    expect(alert).toHaveTextContent("読込失敗マップY");
  });

  it("Escape キーと「閉じる」ボタンで onClose を呼び、IME 変換中・repeat の Escape では閉じない", async () => {
    const user = userEvent.setup();
    const { props } = renderDialog();
    const closeButton = screen.getByRole("button", { name: "閉じる" });

    fireEvent.keyDown(closeButton, { key: "Escape", isComposing: true });
    fireEvent.keyDown(closeButton, { key: "Escape", keyCode: 229 });
    fireEvent.keyDown(closeButton, { key: "Escape", repeat: true });
    expect(props.onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(closeButton, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await user.click(closeButton);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("マウスクリックを onMouseClick で通知し、ダブルクリック 2 回目は抑止し、detail 0 では通知しない（L-408）", () => {
    const { props } = renderDialog();
    const closeButton = screen.getByRole("button", { name: "閉じる" });

    fireEvent.click(closeButton, { detail: 1 });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).toHaveBeenCalledTimes(1);

    fireEvent.click(closeButton, { detail: 2 });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onMouseClick).toHaveBeenCalledTimes(2);

    fireEvent.click(closeButton, { detail: 0 });
    expect(props.onClose).toHaveBeenCalledTimes(2);
    expect(props.onMouseClick).toHaveBeenCalledTimes(2);
  });
});
