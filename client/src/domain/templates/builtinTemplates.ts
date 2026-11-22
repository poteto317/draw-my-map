import { CHILD_HORIZONTAL_GAP, RECT_HEIGHT, RECT_WIDTH, SIBLING_VERTICAL_GAP } from "@/config/shapes";
import { DEFAULT_NODE_IMPORTANCE } from "@/domain/nodes/nodeImportance";
import { createMapDocument } from "@/domain/persistence/mapDocumentEncoder";
import type { MapDocumentV3 } from "@/types/mapDocument";
import type { Node } from "@/types/node";

export type BuiltinTemplateSummary = {
  id: string;
  name: string;
};

export type BuiltinTemplate = BuiltinTemplateSummary & {
  document: MapDocumentV3;
};

type TemplateDefinition = {
  id: string;
  name: string;
  rootLabel: string;
  childLabels: readonly string[];
};

const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = [
  {
    id: "meeting-minutes",
    name: "議事録",
    rootLabel: "議事録",
    childLabels: ["日時", "出席者", "議題", "決定事項", "次のアクション"],
  },
  {
    id: "learning",
    name: "学習",
    rootLabel: "学習ノート",
    childLabels: ["目標", "要点", "疑問", "まとめ"],
  },
  {
    id: "planning",
    name: "企画",
    rootLabel: "企画",
    childLabels: ["目的", "背景", "案", "リスク", "次の一歩"],
  },
  {
    id: "comparison",
    name: "比較検討",
    rootLabel: "比較検討",
    childLabels: ["観点", "候補A", "候補B", "結論"],
  },
];

const ROOT_X = 80;
const ROOT_Y = 80;

function buildShallowTree(rootLabel: string, childLabels: readonly string[]): Node[] {
  const root: Node = {
    id: 1,
    parentId: null,
    x: ROOT_X,
    y: ROOT_Y,
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label: rootLabel,
    importance: DEFAULT_NODE_IMPORTANCE,
  };
  const childX = ROOT_X + RECT_WIDTH + CHILD_HORIZONTAL_GAP;
  const children: Node[] = childLabels.map((label, index) => ({
    id: index + 2,
    parentId: 1,
    x: childX,
    y: ROOT_Y + index * (RECT_HEIGHT + SIBLING_VERTICAL_GAP),
    width: RECT_WIDTH,
    height: RECT_HEIGHT,
    label,
    importance: DEFAULT_NODE_IMPORTANCE,
  }));
  return [root, ...children];
}

function buildTemplateDocument(definition: TemplateDefinition): MapDocumentV3 {
  return createMapDocument(
    buildShallowTree(definition.rootLabel, definition.childLabels),
    "manual",
  );
}

// UI の選択肢用。document は組み立てない（作成時は findBuiltinTemplate）
export function listBuiltinTemplateSummaries(): BuiltinTemplateSummary[] {
  return TEMPLATE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
  }));
}

export function listBuiltinTemplates(): BuiltinTemplate[] {
  return TEMPLATE_DEFINITIONS.map((definition) => ({
    id: definition.id,
    name: definition.name,
    document: buildTemplateDocument(definition),
  }));
}

export function findBuiltinTemplate(templateId: string): BuiltinTemplate | null {
  const definition = TEMPLATE_DEFINITIONS.find((item) => item.id === templateId);
  if (definition === undefined) return null;
  return {
    id: definition.id,
    name: definition.name,
    document: buildTemplateDocument(definition),
  };
}
