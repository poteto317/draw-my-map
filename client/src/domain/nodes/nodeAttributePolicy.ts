import type { Node } from "@/types/node";

// Node の任意の属性（値の無いノードでは項目ごと持たない属性）のキー。illustration・note・links・tags・sources・mapLinks・locked・layoutPinned・labelFontSize・labelBold・labelUnderline・icon・kind
export type OptionalNodeKey = {
  [K in keyof Node]-?: undefined extends Node[K] ? K : never;
}[keyof Node];

// 任意の属性の、構造の操作での扱い（宣言）。各操作の実装を置き換えるものではなく、実装との一致は
// __tests__/nodeAttributePolicy.test.ts で固定する。値の種類を増やすのは、実際に別の扱いの属性が現れたとき
export type NodeAttributePolicy = {
  // 分割（domain/nodes/nodeSplit.ts）: 元のノード（最初の断片）にだけ残し、新しい断片には持たせない
  split: "original-only";
  // 統合（domain/nodes/nodeMerge.ts）: survivor-else-first は残すノードの値、無ければ吸収されるノードのうち配列順で
  // 最初の値。joined は選択中の値を配列順に連結。union は選択中の並びを配列順に連結して重複を除く
  merge: "survivor-else-first" | "joined" | "union";
  // 親の挿入（domain/nodes/nodePlacement.ts の createParentNode）: 新しい親は持たない
  parentInsert: "none";
};

// 任意の属性を Node に足したら、ここにも足す（足さないと satisfies で型エラーになる。L-825）。
// あわせて __tests__/nodeAttributePolicy.test.ts の見本（Required<Node>）と、別の値の表も更新する
export const NODE_ATTRIBUTE_POLICY = {
  illustration: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  note: { split: "original-only", merge: "joined", parentInsert: "none" },
  links: { split: "original-only", merge: "union", parentInsert: "none" },
  tags: { split: "original-only", merge: "union", parentInsert: "none" },
  sources: { split: "original-only", merge: "union", parentInsert: "none" },
  mapLinks: { split: "original-only", merge: "union", parentInsert: "none" },
  locked: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  layoutPinned: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  labelFontSize: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  labelBold: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  labelUnderline: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  icon: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  task: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
  customAttributes: { split: "original-only", merge: "union", parentInsert: "none" },
  kind: { split: "original-only", merge: "survivor-else-first", parentInsert: "none" },
} satisfies Record<OptionalNodeKey, NodeAttributePolicy>;
