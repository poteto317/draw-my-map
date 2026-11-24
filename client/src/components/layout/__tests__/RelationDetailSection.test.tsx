import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { RelationDetailSection } from "@/components/layout/RelationDetailSection";
import type { RelationKind } from "@/types/mapRelation";

type Props = ComponentProps<typeof RelationDetailSection>;

function renderSection(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    disabled: false,
    kind: "related",
    directed: false,
    onKindChange: jest.fn(),
    onDirectedChange: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<RelationDetailSection {...props} />) };
}

describe("RelationDetailSection", () => {
  it("節名「関連線」と日本語の kind ラベル・有向トグルを出す", () => {
    renderSection();

    expect(screen.getByRole("heading", { name: "関連線" })).toBeInTheDocument();
    const kindGroup = screen.getByRole("radiogroup", { name: "意味" });
    expect(within(kindGroup).getByRole("radio", { name: "依存" })).toBeInTheDocument();
    expect(within(kindGroup).getByRole("radio", { name: "対立" })).toBeInTheDocument();
    expect(within(kindGroup).getByRole("radio", { name: "参考" })).toBeInTheDocument();
    expect(within(kindGroup).getByRole("radio", { name: "関連" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "有向" })).not.toBeChecked();
  });

  it("visible が false なら節を描画しない", () => {
    renderSection({ visible: false });
    expect(screen.queryByRole("heading", { name: "関連線" })).not.toBeInTheDocument();
  });

  it("disabled なら kind と有向を無効化する", () => {
    renderSection({ disabled: true, kind: "dependency", directed: true });
    for (const name of ["依存", "対立", "参考", "関連"] as const) {
      expect(screen.getByRole("radio", { name })).toBeDisabled();
    }
    expect(screen.getByRole("checkbox", { name: "有向" })).toBeDisabled();
  });

  it.each([
    ["依存", "dependency"],
    ["対立", "conflict"],
    ["参考", "reference"],
    ["関連", "related"],
  ] as const)("%sを選ぶと onKindChange(%s)", async (label, kind: RelationKind) => {
    const user = userEvent.setup();
    const onKindChange = jest.fn();
    // 既に選ばれている項目は onChange が飛ばないので、別 kind から開始する
    renderSection({ kind: kind === "related" ? "dependency" : "related", onKindChange });

    await user.click(screen.getByRole("radio", { name: label }));

    expect(onKindChange).toHaveBeenCalledWith(kind);
  });

  it("有向トグルで onDirectedChange を呼ぶ", async () => {
    const user = userEvent.setup();
    const onDirectedChange = jest.fn();
    renderSection({ directed: false, onDirectedChange });

    await user.click(screen.getByRole("checkbox", { name: "有向" }));

    expect(onDirectedChange).toHaveBeenCalledWith(true);
  });
});
