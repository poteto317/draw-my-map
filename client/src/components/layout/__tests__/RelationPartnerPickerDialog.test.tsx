import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RelationPartnerPickerDialog } from "@/components/layout/RelationPartnerPickerDialog";
import { createTestNode } from "@/testing/createTestNode";
import type { MapRelation } from "@/types/mapRelation";

function relation(partial: Partial<MapRelation> & Pick<MapRelation, "id" | "fromId" | "toId">): MapRelation {
  return { kind: "related", directed: false, ...partial };
}

const nodes = [
  createTestNode({ id: 1, label: "主選択" }),
  createTestNode({ id: 2, parentId: 1, label: "相手A", x: 200 }),
  createTestNode({ id: 3, parentId: 1, label: "locked", x: 200, y: 100, locked: true }),
];

describe("RelationPartnerPickerDialog", () => {
  it("role=dialog・aria-modal を持ち、候補を列挙する", () => {
    render(
      <RelationPartnerPickerDialog
        fromId={1}
        nodes={nodes}
        relations={undefined}
        onPick={jest.fn()}
        onCancel={jest.fn()}
        onMouseClick={jest.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "関連線の相手を選ぶ" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "相手A" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "locked" })).toBeDisabled();
  });

  it("重複相手は disabled、選択で onPick", async () => {
    const onPick = jest.fn();
    render(
      <RelationPartnerPickerDialog
        fromId={1}
        nodes={nodes}
        relations={[relation({ id: 10, fromId: 1, toId: 2 })]}
        onPick={onPick}
        onCancel={jest.fn()}
        onMouseClick={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "相手A" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "キャンセル" }));
  });

  it("有効候補クリックで onPick を呼ぶ", async () => {
    const onPick = jest.fn();
    render(
      <RelationPartnerPickerDialog
        fromId={1}
        nodes={nodes}
        relations={undefined}
        onPick={onPick}
        onCancel={jest.fn()}
        onMouseClick={jest.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "相手A" }));
    expect(onPick).toHaveBeenCalledWith(2);
  });
});
