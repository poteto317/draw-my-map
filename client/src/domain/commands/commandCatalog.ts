import type { CommandDefinition, CommandId } from "@/domain/commands/commandTypes";

function define(
  id: CommandId,
  categoryId: CommandDefinition["categoryId"],
  categoryLabel: string,
  label: string,
  options: {
    readonly aliases?: readonly string[];
    readonly opensDialog?: boolean;
  } = {},
): CommandDefinition {
  return {
    id,
    categoryId,
    categoryLabel,
    label,
    aliases: options.aliases ?? [],
    opensDialog: options.opensDialog ?? false,
    requiredInV1: true,
  };
}

export const COMMAND_CATALOG: readonly CommandDefinition[] = Object.freeze([
  define("view.map", "view", "表示", "マップ表示へ切替"),
  define("view.outline", "view", "表示", "アウトライン表示へ切替"),
  define("view.fit-all", "view", "表示", "全体に合わせる", { aliases: ["フィット"] }),
  define("view.fit-selection", "view", "表示", "選択に合わせる"),
  define("view.focus-branch", "view", "表示", "枝に集中"),
  define("view.focus-clear", "view", "表示", "集中表示を終了"),
  define("view.expand-subtree", "view", "表示", "枝を一括展開"),
  define("view.collapse-subtree", "view", "表示", "枝を一括折りたたみ"),

  define("edit.undo", "edit", "編集", "元に戻す", { aliases: ["Undo"] }),
  define("edit.redo", "edit", "編集", "やり直す"),
  define("edit.duplicate-branch", "edit", "編集", "枝を複製"),
  define("edit.delete-node-only", "edit", "編集", "ノードだけ削除"),
  define("edit.insert-parent", "edit", "編集", "親を挿入"),
  define("edit.move-sibling-up", "edit", "編集", "兄弟を上へ"),
  define("edit.move-sibling-down", "edit", "編集", "兄弟を下へ"),
  define("edit.indent", "edit", "編集", "階層を下げる"),
  define("edit.outdent", "edit", "編集", "階層を上げる"),
  define("edit.open-label-replace", "edit", "編集", "ラベルを一括置換…", {
    aliases: ["一括置換"],
    opensDialog: true,
  }),
  define("edit.open-branch-move", "edit", "編集", "枝を別マップへ移動…", {
    aliases: ["枝を移動"],
    opensDialog: true,
  }),
  define("edit.open-node-split", "edit", "編集", "ノードを分割…", { opensDialog: true }),
  define("edit.open-node-merge", "edit", "編集", "ノードを統合…", { opensDialog: true }),
  define("edit.open-ai-branch-summary", "edit", "編集", "枝を要約してメモに入れる（AI）…", {
    aliases: ["AI", "要約"],
    opensDialog: true,
  }),
  define("edit.open-ai-importance", "edit", "編集", "重要度を提案（AI）…", {
    aliases: ["AI", "重要度"],
    opensDialog: true,
  }),
  define("edit.open-ai-child-candidates", "edit", "編集", "子の候補を提案（AI）…", {
    aliases: ["AI", "子候補"],
    opensDialog: true,
  }),
  define("edit.open-ai-classify-reorder", "edit", "編集", "分類・並べ替えを提案（AI）…", {
    aliases: ["AI", "分類"],
    opensDialog: true,
  }),
  define("edit.open-ai-duplicates", "edit", "編集", "重複・類似を検出（AI）…", {
    aliases: ["AI", "重複"],
    opensDialog: true,
  }),
  define("edit.open-ai-missing-perspectives", "edit", "編集", "不足観点を提案（AI）…", {
    aliases: ["AI", "観点"],
    opensDialog: true,
  }),
  define("edit.register-part", "edit", "編集", "選択を部品に登録…", {
    aliases: ["部品登録"],
    opensDialog: true,
  }),
  define("edit.insert-part", "edit", "編集", "部品を挿入…", {
    aliases: ["部品挿入"],
    opensDialog: true,
  }),
  define("edit.delete-part", "edit", "編集", "部品を削除…", {
    aliases: ["部品削除"],
    opensDialog: true,
  }),

  define("search.focus-in-map", "search", "検索", "マップ内検索へフォーカス"),
  define("search.open-cross-map", "search", "検索", "全マップ検索…", { opensDialog: true }),

  define("outline.add-root", "outline", "アウトライン", "ルート追加"),
  define("outline.add-child", "outline", "アウトライン", "子を追加"),
  define("outline.add-sibling", "outline", "アウトライン", "兄弟を末尾に追加"),
  define("outline.begin-edit", "outline", "アウトライン", "ラベル編集"),
]);

const CATALOG_BY_ID = new Map(COMMAND_CATALOG.map((def) => [def.id, def]));

export function getCommandDefinition(id: CommandId): CommandDefinition | undefined {
  return CATALOG_BY_ID.get(id);
}
