import { COMMAND_CATALOG, getCommandDefinition } from "@/domain/commands/commandCatalog";
import type { CommandDefinition, CommandId } from "@/domain/commands/commandTypes";

const REQUIRED_V1_IDS: readonly CommandId[] = [
  "view.map",
  "view.outline",
  "view.fit-all",
  "view.fit-selection",
  "view.focus-branch",
  "view.focus-clear",
  "view.expand-subtree",
  "view.collapse-subtree",
  "edit.undo",
  "edit.redo",
  "edit.duplicate-branch",
  "edit.delete-node-only",
  "edit.insert-parent",
  "edit.move-sibling-up",
  "edit.move-sibling-down",
  "edit.indent",
  "edit.outdent",
  "edit.open-label-replace",
  "edit.open-branch-move",
  "edit.open-node-split",
  "edit.open-node-merge",
  "search.focus-in-map",
  "search.open-cross-map",
  "outline.add-root",
  "outline.add-child",
  "outline.add-sibling",
  "outline.begin-edit",
];

const OPENS_DIALOG_IDS = new Set<CommandId>([
  "edit.open-label-replace",
  "edit.open-branch-move",
  "edit.open-node-split",
  "edit.open-node-merge",
  "search.open-cross-map",
]);

const CATEGORY_ORDER = ["view", "edit", "search", "outline"] as const;

describe("COMMAND_CATALOG", () => {
  it("第1版必須 ID がすべて登録され、必須以外の ID は含まれない", () => {
    expect(COMMAND_CATALOG.map((def) => def.id)).toEqual([...REQUIRED_V1_IDS]);
    for (const def of COMMAND_CATALOG) {
      expect(def.requiredInV1).toBe(true);
    }
  });

  it("カテゴリ順（表示 → 編集 → 検索 → アウトライン）・登録順が安定している", () => {
    const categoryIndexes = COMMAND_CATALOG.map((def) => CATEGORY_ORDER.indexOf(def.categoryId as (typeof CATEGORY_ORDER)[number]));
    expect(categoryIndexes.every((index) => index >= 0)).toBe(true);
    for (let i = 1; i < categoryIndexes.length; i += 1) {
      expect(categoryIndexes[i]).toBeGreaterThanOrEqual(categoryIndexes[i - 1]!);
    }
  });

  it("opensDialog は必須 5 ID のみ true で、それ以外は false", () => {
    for (const def of COMMAND_CATALOG) {
      expect(def.opensDialog).toBe(OPENS_DIALOG_IDS.has(def.id));
    }
  });

  it("表示名・カテゴリ名・既定ラベルを持ち、複合キーを文字列連結で作らない", () => {
    const byId = new Map(COMMAND_CATALOG.map((def) => [def.id, def]));
    expect(byId.get("view.fit-all")).toMatchObject({
      categoryId: "view",
      categoryLabel: "表示",
      label: "全体に合わせる",
    } satisfies Partial<CommandDefinition>);
    expect(byId.get("edit.undo")).toMatchObject({
      categoryLabel: "編集",
      label: "元に戻す",
      aliases: expect.arrayContaining(["Undo"]),
    });
    expect(byId.get("edit.open-label-replace")?.aliases).toEqual(expect.arrayContaining(["一括置換"]));
    expect(byId.get("edit.open-branch-move")?.aliases).toEqual(expect.arrayContaining(["枝を移動"]));
    expect(byId.get("view.fit-all")?.aliases).toEqual(expect.arrayContaining(["フィット"]));
    // Cmd+K は起動専用でカタログに載せない
    expect(COMMAND_CATALOG.some((def) => def.aliases.includes("Cmd+K") || def.id.includes("Cmd"))).toBe(false);
  });

  it("getCommandDefinition は登録 ID を返し、未登録は undefined", () => {
    expect(getCommandDefinition("edit.undo")?.label).toBe("元に戻す");
    expect(getCommandDefinition("io.export-json")).toBeUndefined();
    expect(getCommandDefinition("view.nav-back")).toBeUndefined();
  });
});
