export type DockSlotId =
  | "undoRedo"
  | "commandPalette"
  | "wheelZoom"
  | "importance"
  | "collapse"
  | "duplicateBranch"
  | "moveBranch"
  | "reorderSiblings"
  | "changeHierarchy"
  | "insertParent"
  | "deleteNodeOnly"
  | "bulkReplace"
  | "splitMerge"
  | "branchNav"
  | "viewBookmarks"
  | "resolutionFilter"
  | "depthLimit"
  | "highlightMode"
  | "nodePins"
  | "tour"
  | "presentation"
  | "learnMode"
  | "voiceInput"
  | "importBullets"
  | "importOpmlCsv"
  | "exportTarget"
  | "exportJson"
  | "exportPngSvg"
  | "printPdf"
  | "exportMdBullets"
  | "exportOpmlCsvTsv"
  | "collab"
  | "share"
  | "comments";

export type DockSlotGroup =
  | "edit"
  | "view-tools"
  | "session"
  | "voice"
  | "io"
  | "collab-share";

export type DockSlotDef = {
  readonly id: DockSlotId;
  readonly label: string;
  readonly group: DockSlotGroup;
  readonly defaultVisible: boolean;
  readonly outlineVisible: boolean;
  readonly requiresMapView: boolean;
};

function define(
  id: DockSlotId,
  label: string,
  group: DockSlotGroup,
  flags: {
    readonly defaultVisible?: boolean;
    readonly outlineVisible?: boolean;
    readonly requiresMapView?: boolean;
  } = {},
): DockSlotDef {
  const requiresMapView = flags.requiresMapView ?? false;
  return {
    id,
    label,
    group,
    defaultVisible: flags.defaultVisible ?? false,
    outlineVisible: flags.outlineVisible ?? !requiresMapView,
    requiresMapView,
  };
}

/** マップ専用（アウトラインでは非マウント） */
const MAP_ONLY = {
  outlineVisible: false,
  requiresMapView: true,
} as const;

/**
 * 設計「決めたこと」3 の閉じた一覧。順序はグループ内の定義順。
 * defaultVisible は「決めたこと」4。
 */
export const DOCK_SLOT_CATALOG: readonly DockSlotDef[] = Object.freeze([
  // edit
  define("undoRedo", "元に戻す／やり直す", "edit", { defaultVisible: true }),
  define("commandPalette", "コマンドパレット", "edit", { defaultVisible: true }),
  define("wheelZoom", "ホイールズーム感度", "edit", {
    defaultVisible: true,
    ...MAP_ONLY,
  }),
  define("importance", "重要度", "edit", { defaultVisible: true }),
  define("collapse", "折りたたみ", "edit", {
    defaultVisible: true,
    ...MAP_ONLY,
  }),
  define("duplicateBranch", "枝を複製", "edit", {
    defaultVisible: true,
    ...MAP_ONLY,
  }),
  define("moveBranch", "枝を移動", "edit", {
    defaultVisible: true,
    ...MAP_ONLY,
  }),
  define("reorderSiblings", "兄弟の並べ替え", "edit", {
    defaultVisible: true,
    ...MAP_ONLY,
  }),
  define("changeHierarchy", "階層の上げ下げ", "edit", {
    defaultVisible: true,
    ...MAP_ONLY,
  }),
  define("insertParent", "親を挿入", "edit", MAP_ONLY),
  define("deleteNodeOnly", "ノードだけ削除", "edit", MAP_ONLY),
  define("bulkReplace", "ラベル一括置換", "edit", MAP_ONLY),
  define("splitMerge", "分割／統合", "edit", MAP_ONLY),
  define("branchNav", "枝ナビ", "edit", MAP_ONLY),
  define("viewBookmarks", "ビューブックマーク", "edit", MAP_ONLY),

  // view-tools
  define("resolutionFilter", "解像度フィルタ", "view-tools", MAP_ONLY),
  define("depthLimit", "深さ制限", "view-tools", MAP_ONLY),
  define("highlightMode", "一時強調", "view-tools", MAP_ONLY),
  define("nodePins", "ノードピン", "view-tools", MAP_ONLY),

  // session
  define("tour", "ツアー", "session"),
  define("presentation", "プレゼン", "session"),
  define("learnMode", "学習モード", "session"),

  // voice
  define("voiceInput", "音声入力", "voice"),

  // io
  define("importBullets", "箇条書き取込", "io"),
  define("importOpmlCsv", "OPML／CSV 取込", "io"),
  define("exportTarget", "書き出し対象", "io"),
  define("exportJson", "JSON 入出力", "io"),
  define("exportPngSvg", "PNG／SVG 書き出し", "io"),
  define("printPdf", "PDF・印刷", "io"),
  define("exportMdBullets", "Markdown／箇条書き書き出し", "io"),
  define("exportOpmlCsvTsv", "OPML／CSV／TSV 書き出し", "io"),

  // collab-share
  define("collab", "共同編集", "collab-share"),
  define("share", "共有", "collab-share"),
  define("comments", "コメント", "collab-share"),
]);

export const DOCK_SLOT_IDS: readonly DockSlotId[] = Object.freeze(
  DOCK_SLOT_CATALOG.map((def) => def.id),
);

const DOCK_SLOT_ID_SET: ReadonlySet<string> = new Set(DOCK_SLOT_IDS);

export function listDockSlotDefs(): readonly DockSlotDef[] {
  return DOCK_SLOT_CATALOG;
}

export function isDockSlotId(value: unknown): value is DockSlotId {
  return typeof value === "string" && DOCK_SLOT_ID_SET.has(value);
}

export function getDockSlotDef(id: DockSlotId): DockSlotDef | undefined {
  return DOCK_SLOT_CATALOG.find((def) => def.id === id);
}
