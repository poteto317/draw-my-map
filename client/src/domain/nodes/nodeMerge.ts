import { ILLUSTRATED_NODE_HEIGHT } from "@/config/shapes";
import { assertNodesEditable } from "@/domain/nodes/nodeEditLock";
import { keepFirstRootPosition } from "@/domain/nodes/nodeFirstRootPosition";
import { hasInvalidNodeGeometry } from "@/domain/nodes/nodeGeometryValidation";
import { maxNodeImportance } from "@/domain/nodes/nodeImportance";
import { applyProjectedLabelTextStyle } from "@/domain/nodes/labelTextStyle";
import { indexNodeForest } from "@/domain/nodes/nodeLayoutForest";
import { applyProjectedNodeIcon, normalizeNodeIcon } from "@/domain/nodes/nodeIcon";
import { applyProjectedNodeKind, normalizeNodeKind } from "@/domain/nodes/nodeKindUpdate";
import { NODE_LINKS_MAX_COUNT, areNodeLinksEqual, withNodeLinks } from "@/domain/nodes/nodeLink";
import {
  NODE_MAP_LINKS_MAX_COUNT,
  areNodeMapLinksEqual,
  isSelfNodeMapLink,
  uniqueNodeMapLinks,
  withNodeMapLinks,
} from "@/domain/nodes/nodeMapLink";
import { NODE_NOTE_MERGE_JOINER, isNodeNoteWithinLimit, withNodeNote } from "@/domain/nodes/nodeNote";
import {
  NODE_SOURCES_MAX_COUNT,
  areNodeSourcesEqual,
  uniqueNodeSources,
  withNodeSources,
} from "@/domain/nodes/nodeSource";
import { NODE_TAGS_MAX_COUNT, areNodeTagsEqual, uniqueNodeTags, withNodeTags } from "@/domain/nodes/nodeTag";
import type { Node, NodeMapLink, NodeSource } from "@/types/node";
import type { NodeImportance } from "@/types/nodeImportance";
import type { NodeLayoutMode } from "@/types/nodeLayout";

export type NodeMergeFailureReason =
  | "too-few-nodes"
  | "node-missing"
  | "node-hidden"
  | "primary-missing"
  | "different-parents"
  | "invalid-structure"
  | "placement-failed"
  // 選択中のメモを連結すると上限（NODE_NOTE_MAX_LENGTH）を超える。黙って切り詰めない
  | "note-too-long"
  // 選択中の URL を重複を除いて連結すると上限（NODE_LINKS_MAX_COUNT）を超える。黙って切り詰めない
  | "links-too-many"
  // 選択中のタグを同じタグとみなすもの（nodeTagKey）を除いて連結すると上限（NODE_TAGS_MAX_COUNT）を超える。黙って切り詰めない
  | "tags-too-many"
  // 選択中の出典を同じ出典とみなすもの（nodeSourceKey）を除いて連結すると上限（NODE_SOURCES_MAX_COUNT）を超える。黙って切り詰めない
  | "sources-too-many"
  // 選択中のマップ間リンクを同じリンクとみなすもの（nodeMapLinkKey）を除いて連結すると上限（NODE_MAP_LINKS_MAX_COUNT）を超える。黙って切り詰めない
  | "map-links-too-many"
  | "locked"
  // 確定時の再計画が、プレビューで見せた計画と違う（useNodes.mergeNodes が返す）
  | "plan-changed";

export type NodeMergePlan =
  | {
    ok: true;
    survivorId: number;
    // 配列順
    absorbedIds: number[];
    label: string;
    importance: NodeImportance;
    illustration: string | undefined;
    illustrationFrom: "primary" | "absorbed" | "none";
    // illustrationFrom が "absorbed" のときだけ、引き継ぐ元のノードの ID
    illustrationSourceId: number | null;
    // 統合で失われるイラストの件数（引き継ぐ 1 件を除く）
    discardedIllustrationCount: number;
    // 吸収されるノードの直下の子で、残すノードへ付け替えるものの件数
    movedChildCount: number;
    // 選択中のノードのメモを配列順に空行（NODE_NOTE_MERGE_JOINER）で連結したもの。メモの無いノードは飛ばし、
    // 1 つも無ければ undefined
    note: string | undefined;
    // メモを持つノードの件数（プレビューで見せる）
    noteSourceCount: number;
    // 選択中のノードの URL を配列順に並べ、最初に出てきたものを残して重複を除いたもの。1 つも無ければ undefined
    links: readonly string[] | undefined;
    // URL を持つノードの件数
    linkSourceCount: number;
    // 重複で捨てる URL の件数（プレビューで見せる）
    linkDuplicateCount: number;
    // 選択中のノードのタグを配列順に並べ、同じタグとみなすもの（nodeTagKey）は最初に出てきたものを残して除いたもの。
    // 1 つも無ければ undefined
    tags: readonly string[] | undefined;
    // タグを持つノードの件数
    tagSourceCount: number;
    // 同じタグとみなして捨てるタグの件数（プレビューで見せる）
    tagDuplicateCount: number;
    // 選択中のノードの出典を配列順に並べ、同じ出典とみなすもの（nodeSourceKey）は最初に出てきたものを残して除いたもの。
    // 1 つも無ければ undefined
    sources: readonly NodeSource[] | undefined;
    // 出典を持つノードの件数
    sourceSourceCount: number;
    // 同じ出典とみなして捨てる出典の件数（プレビューで見せる）
    sourceDuplicateCount: number;
    // 選択中のノードのマップ間リンクを配列順に並べ、同じリンク（nodeMapLinkKey）は最初に出てきたものを残して除いたもの。
    // 1 つも無ければ undefined
    mapLinks: readonly NodeMapLink[] | undefined;
    // マップ間リンクを持つノードの件数
    mapLinkSourceCount: number;
    // 重複して捨てるマップ間リンクの件数（プレビューで見せる）。統合するノードを指すものは除いた後で数える
    mapLinkDuplicateCount: number;
    // 現在マップの統合するノード（残すノード・吸収されるノード）を指すために捨てるマップ間リンクの件数（プレビューで見せる）。
    // 残すノードを指すものは統合後に自分自身へのリンクになり、吸収されるノードを指すものは統合の直後にリンク切れになる
    mapLinkSelectedTargetCount: number;
  }
  | { ok: false; reason: NodeMergeFailureReason };

export type NodeMergeResult =
  | { ok: true; nodes: Node[]; survivorId: number; absorbedIds: number[] }
  | { ok: false; reason: NodeMergeFailureReason };

// useNodes.mergeNodes の戻り値
export type MergeNodesResult =
  | { ok: true; survivorId: number; absorbedCount: number }
  | { ok: false; reason: NodeMergeFailureReason };

function failed(reason: NodeMergeFailureReason): { ok: false; reason: NodeMergeFailureReason } {
  return { ok: false, reason };
}

type MergeSelection =
  | { ok: true; survivor: Node; selected: Node[]; absorbed: Node[] }
  | { ok: false; reason: NodeMergeFailureReason };

// 対象の個数・存在・可視・主選択・配置・構造・親の一致を、この順に検査する。
// 通れば、残すノード・選択中のノード（配列順）・吸収されるノード（配列順）を返す
function validateMergeSelection(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  visibleNodeIds: ReadonlySet<number>,
): MergeSelection {
  const idSet = new Set(ids);
  if (idSet.size < 2) return failed("too-few-nodes");
  const existingIds = new Set(nodes.map((node) => node.id));
  for (const id of idSet) {
    if (!existingIds.has(id)) return failed("node-missing");
  }
  for (const id of idSet) {
    if (!visibleNodeIds.has(id)) return failed("node-hidden");
  }
  const lockedCheck = assertNodesEditable([...idSet], nodes);
  if (!lockedCheck.ok && lockedCheck.reason === "locked") return failed("locked");

  // 選択の ID はすべて配列にあるので、primaryId が選択に含まれていれば find は必ず見つかる
  const survivor = primaryId !== null && idSet.has(primaryId)
    ? nodes.find((node) => node.id === primaryId)
    : undefined;
  if (survivor === undefined) return failed("primary-missing");
  if (hasInvalidNodeGeometry(nodes)) return failed("placement-failed");
  if (indexNodeForest(nodes) === null) return failed("invalid-structure");

  const selected = nodes.filter((node) => idSet.has(node.id));
  if (selected.some((node) => node.parentId !== survivor.parentId)) return failed("different-parents");
  return { ok: true, survivor, selected, absorbed: selected.filter((node) => node.id !== survivor.id) };
}

// イラストの選択。主選択が持っていればそれ、無ければ吸収されるノードのうち配列順で最初に持つもの、
// どちらも無ければ引き継がない
function chooseMergeIllustration(
  survivor: Node,
  absorbed: readonly Node[],
): Pick<Extract<NodeMergePlan, { ok: true }>, "illustration" | "illustrationFrom" | "illustrationSourceId"> {
  if (survivor.illustration !== undefined) {
    return { illustration: survivor.illustration, illustrationFrom: "primary", illustrationSourceId: null };
  }
  const source = absorbed.find((node) => node.illustration !== undefined);
  if (source !== undefined) {
    return { illustration: source.illustration, illustrationFrom: "absorbed", illustrationSourceId: source.id };
  }
  return { illustration: undefined, illustrationFrom: "none", illustrationSourceId: null };
}

// 対象を検査して統合の計画を作る（配列は変えない）。並びは配列順で、ids の順序には依存しない。
// currentMapId は統合するマップの ID で、統合するノードを指すマップ間リンクを除くために使う
export function planNodeMerge(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  joiner: string,
  visibleNodeIds: ReadonlySet<number>,
  currentMapId: string,
): NodeMergePlan {
  const selection = validateMergeSelection(nodes, ids, primaryId, visibleNodeIds);
  if (!selection.ok) return selection;
  const { survivor, selected, absorbed } = selection;
  const absorbedIdSet = new Set(absorbed.map((node) => node.id));
  const illustrationCount = selected.filter((node) => node.illustration !== undefined).length;
  const notes = selected.flatMap((node) => (node.note === undefined ? [] : [node.note]));
  const note = notes.length === 0 ? undefined : notes.join(NODE_NOTE_MERGE_JOINER);
  // 検査の順: different-parents の後
  if (note !== undefined && !isNodeNoteWithinLimit(note)) return failed("note-too-long");
  const linkLists = selected.flatMap((node) => (node.links === undefined || node.links.length === 0 ? [] : [node.links]));
  const allLinks = linkLists.flat();
  const links = [...new Set(allLinks)];
  // 検査の順: note-too-long の後
  if (links.length > NODE_LINKS_MAX_COUNT) return failed("links-too-many");
  const tagLists = selected.flatMap((node) => (node.tags === undefined || node.tags.length === 0 ? [] : [node.tags]));
  const allTags = tagLists.flat();
  const tags = uniqueNodeTags(allTags);
  // 検査の順: links-too-many の後
  if (tags.length > NODE_TAGS_MAX_COUNT) return failed("tags-too-many");
  const sourceLists = selected.flatMap((node) =>
    (node.sources === undefined || node.sources.length === 0 ? [] : [node.sources]),
  );
  const allSources = sourceLists.flat();
  const sources = uniqueNodeSources(allSources);
  // 検査の順: tags-too-many の後
  if (sources.length > NODE_SOURCES_MAX_COUNT) return failed("sources-too-many");
  const mapLinkLists = selected.flatMap((node) =>
    (node.mapLinks === undefined || node.mapLinks.length === 0 ? [] : [node.mapLinks]),
  );
  const allMapLinks = mapLinkLists.flat();
  // 統合するノードを指すリンクは除く。残すノードを指すものは統合後に自分自身へのリンクになり（追加の self-node と揃える）、
  // 吸収されるノードを指すものは統合の直後にリンク切れになるため
  const mapLinksOutsideSelection = allMapLinks.filter(
    (link) => !selected.some((item) => isSelfNodeMapLink(link, currentMapId, item.id)),
  );
  const mapLinks = uniqueNodeMapLinks(mapLinksOutsideSelection);
  // 検査の順の最後（sources-too-many の後）
  if (mapLinks.length > NODE_MAP_LINKS_MAX_COUNT) return failed("map-links-too-many");

  return {
    ok: true,
    survivorId: survivor.id,
    absorbedIds: absorbed.map((node) => node.id),
    // 空文字のラベルを除いて連結する。前後の空白は削らない
    label: selected.map((node) => node.label).filter((label) => label !== "").join(joiner),
    importance: maxNodeImportance(selected.map((node) => node.importance)),
    ...chooseMergeIllustration(survivor, absorbed),
    discardedIllustrationCount: Math.max(0, illustrationCount - 1),
    movedChildCount: nodes.filter((node) => node.parentId !== null && absorbedIdSet.has(node.parentId)).length,
    note,
    noteSourceCount: notes.length,
    links: links.length === 0 ? undefined : links,
    linkSourceCount: linkLists.length,
    linkDuplicateCount: allLinks.length - links.length,
    tags: tags.length === 0 ? undefined : tags,
    tagSourceCount: tagLists.length,
    tagDuplicateCount: allTags.length - tags.length,
    sources: sources.length === 0 ? undefined : sources,
    sourceSourceCount: sourceLists.length,
    sourceDuplicateCount: allSources.length - sources.length,
    mapLinks: mapLinks.length === 0 ? undefined : mapLinks,
    mapLinkSourceCount: mapLinkLists.length,
    mapLinkDuplicateCount: mapLinksOutsideSelection.length - mapLinks.length,
    mapLinkSelectedTargetCount: allMapLinks.length - mapLinksOutsideSelection.length,
  };
}

// 確定時の再計画とプレビューの計画が同じか。プレビューで見せた内容（残すノード・吸収されるノードの順・ラベル・重要度・
// イラストの扱いと引き継ぎ元・失われるイラストの件数・付け替える子の件数・連結したメモとその件数・連結した URL と
// その元の件数・重複で捨てる件数・連結したタグとその元の件数・重複で捨てる件数・連結した出典とその元の件数・
// 重複で捨てる件数・連結したマップ間リンクとその元の件数・重複で捨てる件数・統合するノードを指すため捨てる件数）で比べる（L-036）。URL・タグ・出典・
// マップ間リンクは要素ごとに比べる（別の配列でも内容が同じなら同じ）。
// 引き継ぐイラスト本体は illustrationFrom と引き継ぎ元で決まるので比べない。失敗した計画は同じとみなさない
export function isSameNodeMergePlan(a: NodeMergePlan, b: NodeMergePlan): boolean {
  if (!a.ok || !b.ok) return false;
  return a.survivorId === b.survivorId
    && a.label === b.label
    && a.importance === b.importance
    && a.illustrationFrom === b.illustrationFrom
    && a.illustrationSourceId === b.illustrationSourceId
    && a.discardedIllustrationCount === b.discardedIllustrationCount
    && a.movedChildCount === b.movedChildCount
    && a.note === b.note
    && a.noteSourceCount === b.noteSourceCount
    && areNodeLinksEqual(a.links, b.links)
    && a.linkSourceCount === b.linkSourceCount
    && a.linkDuplicateCount === b.linkDuplicateCount
    && areNodeTagsEqual(a.tags, b.tags)
    && a.tagSourceCount === b.tagSourceCount
    && a.tagDuplicateCount === b.tagDuplicateCount
    && areNodeSourcesEqual(a.sources, b.sources)
    && a.sourceSourceCount === b.sourceSourceCount
    && a.sourceDuplicateCount === b.sourceDuplicateCount
    && areNodeMapLinksEqual(a.mapLinks, b.mapLinks)
    && a.mapLinkSourceCount === b.mapLinkSourceCount
    && a.mapLinkDuplicateCount === b.mapLinkDuplicateCount
    && a.mapLinkSelectedTargetCount === b.mapLinkSelectedTargetCount
    && a.absorbedIds.length === b.absorbedIds.length
    && a.absorbedIds.every((id, index) => id === b.absorbedIds[index]);
}

// 残すノードの属性を計画どおりに更新する。位置と大きさは変えない（イラストを引き継ぐときだけ、
// attachIllustration と同じ規則で高さをイラスト付きの高さにする）。メモは計画の連結結果で置き換え
// （残すノードのメモも連結に含まれるので失われない）、連結結果が無ければ note のキーを持たせない。URL も同じく
// 計画の連結結果で置き換え、連結結果が無ければ links のキーを持たせない。タグも同じく計画の連結結果で置き換え、
// 連結結果が無ければ tags のキーを持たせない。出典も同じく計画の連結結果で置き換え、連結結果が無ければ
// sources のキーを持たせない。マップ間リンクも同じく計画の連結結果で置き換え、無ければ mapLinks のキーを持たせない。
// Node に属性を足したときは、ここで残すノードの値を残すか、吸収されるノードの値を引き継ぐかを決める
// （何もしないと、吸収されるノードの値は警告なしに捨てられる）。計画・プレビュー・isSameNodeMergePlan も合わせて見直す
function mergeNodeLocked(survivor: Node, absorbed: readonly Node[]): Node {
  if (survivor.locked === true) return survivor;
  if (absorbed[0]?.locked === true) return { ...survivor, locked: true };
  return survivor;
}

// labelFontSize / labelBold / labelUnderline: survivor-else-first（残すノードの値、無ければ吸収側の配列順で最初の値）
function mergeNodeLabelTextStyle(survivor: Node, absorbed: readonly Node[]): Node {
  const labelFontSize =
    survivor.labelFontSize !== undefined
      ? survivor.labelFontSize
      : absorbed.find((node) => node.labelFontSize !== undefined)?.labelFontSize;
  const labelBold =
    survivor.labelBold === true
      ? true
      : absorbed.find((node) => node.labelBold === true)?.labelBold;
  const labelUnderline =
    survivor.labelUnderline === true
      ? true
      : absorbed.find((node) => node.labelUnderline === true)?.labelUnderline;
  return applyProjectedLabelTextStyle(survivor, {
    labelFontSize,
    labelBold,
    labelUnderline,
  });
}

// icon / kind: survivor-else-first
function mergeNodeAppearance(survivor: Node, absorbed: readonly Node[]): Node {
  const iconRaw =
    survivor.icon !== undefined
      ? survivor.icon
      : absorbed.find((node) => node.icon !== undefined)?.icon;
  const kindRaw =
    survivor.kind !== undefined
      ? survivor.kind
      : absorbed.find((node) => node.kind !== undefined)?.kind;
  return applyProjectedNodeKind(
    applyProjectedNodeIcon(survivor, normalizeNodeIcon(iconRaw)),
    normalizeNodeKind(kindRaw),
  );
}

function applyPlanToSurvivor(survivor: Node, plan: Extract<NodeMergePlan, { ok: true }>): Node {
  const updated = withNodeMapLinks(
    withNodeSources(
      withNodeTags(
        withNodeLinks(
          withNodeNote({ ...survivor, label: plan.label, importance: plan.importance }, plan.note),
          plan.links,
        ),
        plan.tags,
      ),
      plan.sources,
    ),
    plan.mapLinks,
  );
  if (plan.illustrationFrom !== "absorbed" || plan.illustration === undefined) return updated;
  return { ...updated, illustration: plan.illustration, height: ILLUSTRATED_NODE_HEIGHT };
}

// 吸収されるノードを配列から消し、その直下の子を、残すノードの直下の子のうち配列順で最後のものの
// 直後（子が無ければ残すノードの直後）へ、吸収されるノードの配列順・各ノード内の元の相対順で付け替える。
// 子孫は動かさず、座標も変えない。残すノードの属性は変えない（呼び出し側が更新する）
function reattachAbsorbedChildren(
  nodes: readonly Node[],
  plan: Extract<NodeMergePlan, { ok: true }>,
  updatedSurvivor: Node,
): Node[] {
  const absorbedIdSet = new Set(plan.absorbedIds);
  const movedChildren: Node[] = [];
  for (const absorbedId of plan.absorbedIds) {
    for (const node of nodes) {
      if (node.parentId === absorbedId) movedChildren.push({ ...node, parentId: plan.survivorId });
    }
  }
  const movedChildIds = new Set(movedChildren.map((node) => node.id));

  const remaining = nodes
    .filter((node) => !absorbedIdSet.has(node.id) && !movedChildIds.has(node.id))
    .map((node) => (node.id === plan.survivorId ? updatedSurvivor : node));
  let anchorIndex = remaining.findIndex((node) => node.id === plan.survivorId);
  remaining.forEach((node, index) => {
    if (node.parentId === plan.survivorId) anchorIndex = index;
  });
  return [...remaining.slice(0, anchorIndex + 1), ...movedChildren, ...remaining.slice(anchorIndex + 1)];
}

// 主選択を残し、ほかを配列から消す。吸収されるノードの直下の子は、残すノードへ付け替える（規則は
// reattachAbsorbedChildren）。自動配置の再レイアウトは applyTreeChange に任せる
export function mergeNodes(
  nodes: readonly Node[],
  ids: readonly number[],
  primaryId: number | null,
  joiner: string,
  visibleNodeIds: ReadonlySet<number>,
  mode: NodeLayoutMode,
  currentMapId: string,
): NodeMergeResult {
  const plan = planNodeMerge(nodes, ids, primaryId, joiner, visibleNodeIds, currentMapId);
  if (!plan.ok) return plan;
  const survivor = nodes.find((node) => node.id === plan.survivorId);
  // 計画が成功なら残すノードは必ず見つかる。型の絞り込みのため到達しない
  if (survivor === undefined) return failed("primary-missing");
  const absorbed = nodes.filter((node) => plan.absorbedIds.includes(node.id));
  const updatedSurvivor = mergeNodeAppearance(
    mergeNodeLabelTextStyle(
      mergeNodeLocked(applyPlanToSurvivor(survivor, plan), absorbed),
      absorbed,
    ),
    absorbed,
  );

  const reattached = reattachAbsorbedChildren(nodes, plan, updatedSurvivor);
  // 先頭のルート（自動配置の列の基準）が吸収されて別のノードに変わるときだけ、旧先頭の座標を新しい先頭へ写す
  const next = mode === "auto" ? keepFirstRootPosition(nodes, reattached) : reattached;
  return { ok: true, nodes: next, survivorId: plan.survivorId, absorbedIds: plan.absorbedIds };
}
