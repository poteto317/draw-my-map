# ノードの分割・統合（候補035）設計

作成日: 2026-11-17。対象: Phase 17 の候補035。前提: 候補009「複数ノード選択」・候補034「一括検索・置換」（ダイアログの作り）。状態: サブエージェントレビュー 2 周通過・自動承認済み（設計確定）。

## 決めたこと（ユーザー確認済み・推奨案）

1. 分割の配置: 元のノードのラベルを区切り文字で分け、**最初の断片は元のノードに残し**（元の子・座標・重要度・イラストもそのまま）、残りの断片は**元のノードの直後の兄弟**として並べる。
2. 統合の対象: 選択が 2 件以上で、**すべて同じ親の兄弟**（親が `null` のルート同士も可）のときだけ統合できる。**主選択**が残り、ほかは消える。吸収されるノードの子は、残すノードの子の**末尾**へ付け替える（循環が起きない）。
3. 操作: ヘッダーに「ノードを分割」「ノードを統合」の 2 つのボタンを置く。どちらもダイアログで区切り文字を選び、結果を**プレビュー**で見てから確定する。確定は 1 操作として Undo / Redo できる。
4. 統合の属性: ラベルは並び順に区切り文字で連結する。重要度は選択中で最も高いもの。イラストは主選択のものを残し、無ければ吸収されるノードのうち配列順で最初のものを引き継ぐ。位置と大きさは主選択のまま（イラストを引き継ぐときだけ、`attachIllustration` と同じ規則で高さを `ILLUSTRATED_NODE_HEIGHT` にする。§3.3）。自動配置でルート同士を統合し、先頭のルートが変わるときだけ、旧先頭の座標を新しい先頭へ写す（§3.3）。

### 推奨案の具体化（設計中に決めたこと）

- **区切り文字**は、プルダウンの選択肢（`、` / `,` / `/` / `・` / 半角スペース）と「その他」（文字列を入力）から選ぶ。一致は**完全一致の文字列**（正規化しない。ノード検索や一括置換の「全角・半角を区別しない」一致とは別。分割は書かれた文字をそのまま境目にするため）。分割の既定は `、`、統合の既定は半角スペース。
- 分割: 断片は前後の空白を `trim()` で削り、**空になった断片は捨てる**。断片が **2 件未満**なら分割できない。断片の上限は **200 件**（それを超えるラベルは分割できない。ユーザー確認の対象外の安全策で、プレビューを全件描いても重くならない件数と、断片ごとの座標計算が兄弟数に比例して増える（全体で件数の 2 乗）ことへの歯止め。一括置換のプレビュー上限と同じ値）。区切り文字が空文字のときは分割できない（「その他」で空のまま）。
- 統合の区切り文字は空文字でもよい（区切りなしで連結する）。連結するラベルは**空文字のものを除き**、前後の空白は削らない。
- 分割で増える断片のノードは、既存の兄弟追加（`createSiblingNode`）と同じ規則で座標を決める（x は元のノードと同じ、y は兄弟の最も下の下端の下）。重要度は元のノードと同じ。大きさは既定。イラストは持たない。自動配置では全体の再レイアウトに任せる。
- 分割・統合は**マップ表示でだけ**ボタンを出す（一括置換と同じ。アウトライン表示では、見えない複数選択を見えないまま変えないため）。
- 分割の対象は**主選択の 1 ノード**（複数選択でも主選択だけ）。選択は変えない。統合の成功後は、選択を残したノードだけにする。
- 成功の通知は既存の構造変更の通知枠（`publishTreeEditNotice`）を共有する。新しい枠は増やさない。
- 折りたたみ集合・イラスト生成状態など ID を持つ状態は既存の整理に任せる（消えた ID は既存の仕組みで外れる）。新しい保存項目は無く、保存形式（V3）は変えない。

---

## 1. 目的と境界

1 つのノードに複数の項目を詰めた長いラベルを項目ごとのノードに分けたり、重複・類似した項目を 1 つにまとめたりして、構造を整えられるようにする。

### 対象外（YAGNI）

- 正規表現・改行・複数の区切り文字の同時指定・断片ごとの編集。
- 分割した断片を子として置く、元のノードを残さず全断片を新規にするなどの配置の切り替え。
- 親が違うノード同士の統合、祖先と子孫の統合。
- 統合時のラベルの個別編集（連結後のラベルは、統合後に通常の編集で直す）。
- 分割・統合へのキーボードショートカット、右クリックメニュー。
- アウトライン表示での分割・統合。
- 分割・統合で作る・消すノードの選択の復元（Undo の選択解除は既存どおり）。

---

## 2. 既存実装の調査と制約

- `Node`（`types/node.ts`）は `{ id, parentId, x, y, width, height, label, importance, illustration? }`。木は `parentId` のフラット配列で、**兄弟順は配列順が正本**（子がなく親の位置も配列順）。ルートも `parentId === null` の配列順。
- ID 採番は `nodeIdAllocator` の `nextAvailableIds(nodes, count)` と `useNodes` が持つ採番状態（Undo で戻しても再利用しない）。採番に巻き戻しは無く、確定しなかった ID は欠番のまま残る（既存の `insertParentNode` も、検査より前に採番するため、失敗しても欠番が出る）。
- 構造編集のドメイン関数は、`{ ok: true, ... } | { ok: false, reason }` の判別共用体を返し、元の配列は変えない。`deleteNodeOnly` / `insertParentNode` が雛形（`reason`: `node-missing` / `node-hidden` / `invalid-structure` / `id-conflict` / `placement-failed`）。失敗の文言は `*Messages.ts` の関数で `OperationNotice` にする。
- `useNodes` の構造編集は `applyTreeChangeWithOutcome(applyTreeChange, compute)` を使う。自動配置のとき `layoutNodeForest` を通し、失敗は `placement-failed`。1 回の確定が 1 操作として履歴に積まれる。構造編集は `documentRevision` を上げない（Undo / Redo / マップ入れ替えだけが上げる）。
- 自動配置の列の基準は、先頭のルート（配列順で最初の `parentId === null`）の座標。`deleteNodeOnly` と `reorderSibling` は、先頭のルートが変わるとき旧先頭の座標を新しい先頭へ写す。`deleteNodeOnly` は、座標が有限でない・幅高が 0 以下の入力を、森の検証（`indexNodeForest`）より先に調べて `placement-failed` にし、森として不正なものは `invalid-structure` にする。同じ順に倣う。
- 選択は `selectedNodeId`（主選択）と `selectedNodeIds`（配列順の複数選択）。マップ表示で表示されていないノードは `pruneSelectionToVisible` で外れる。
- ダイアログの作り: `BranchMove*` / `LabelReplace*`（状態遷移の純関数 `…DialogState.ts`、フック `use…Dialog.ts`、表示 `…Dialog.tsx`、ヘッダーのボタン `…Control.tsx`）。`useDialogFocusTrap`、`handleDialogClickCapture`、`useReannouncedNotice`、`preventRepeatedActivationClick`、`documentRevision` による stale 判定、`editorShortcutsEnabled` による全入口の停止、ルートの `inert`、ダイアログをルートの外に描画、`mapId` の変化で閉じる、がそろっている。
- 一括置換の確定は、最新の `nodes` から計画を**作り直す**（古いプレビューを信じない）。同じ方針をとる。
- `MapEditor.tsx` は既に大きい。ダイアログの状態・フック・表示は別ファイルに置き、`MapEditor` は配線だけにする。

---

## 3. ドメイン

> 注意: `Node` に属性（詳細メモ・URL・タグなど）を足すときは、分割（新しい断片へ写すか既定値にするか）と統合（吸収されるノードの値を捨てるか引き継ぐか、プレビューで開示するか）での扱いを決めて、この設計と `domain/nodes/nodeSplit.ts`・`nodeMerge.ts` を見直す。現在の実装は、分割は重要度だけを写し、統合は残すノードの値を残してラベル・重要度・イラストだけを計画どおりに更新する。

### 3.1 区切り文字（`domain/nodes/nodeSeparator.ts`）

```typescript
export const NODE_SEPARATOR_PRESETS: readonly { id: string; label: string; value: string }[];
// 、 / , / / / ・ / 半角スペース
export const SPLIT_DEFAULT_SEPARATOR = "、";
export const MERGE_DEFAULT_SEPARATOR = " ";
```

選択肢の文字列は定数にまとめ、分割・統合の両方のダイアログが共有する。

### 3.2 分割

`domain/nodes/nodeSplit.ts`:

```typescript
export const MAX_SPLIT_FRAGMENTS = 200;

export type NodeSplitFailureReason =
  | "node-missing" | "node-hidden" | "invalid-structure"
  | "separator-empty" | "not-splittable" | "too-many-fragments"
  | "id-conflict" | "placement-failed"
  | "plan-changed"; // 確定時の再計画が、プレビューで見せた計画と違う（フックが返す。§4）

// ラベルを区切り、trim して空を捨てた断片を返す（純粋。件数の上限は検査しない）。
// 区切りが空文字のときは 1 文字ずつに分けず、ラベル全体を trim した 1 件（trim して空なら 0 件）を返す
export function splitLabelFragments(label: string, separator: string): string[];

export type NodeSplitPlan =
  | { ok: true; nodeId: number; fragments: string[] }
  | { ok: false; reason: NodeSplitFailureReason };

// 対象の存在・可視・区切り文字・断片数を検査する（配列は変えない）。
// 確定時の再計画とプレビューの計画の比較は、断片の配列が同じか（`isSameNodeSplitPlan`）で行う
export function planNodeSplit(
  nodes: readonly Node[], nodeId: number, separator: string, visibleNodeIds: ReadonlySet<number>,
): NodeSplitPlan;

export function isSameNodeSplitPlan(a: NodeSplitPlan, b: NodeSplitPlan): boolean;

export type NodeSplitResult =
  | { ok: true; nodes: Node[]; insertedIds: number[] }
  | { ok: false; reason: NodeSplitFailureReason };

export function splitNode(
  nodes: readonly Node[], nodeId: number, separator: string,
  newNodeIds: readonly number[], visibleNodeIds: ReadonlySet<number>,
): NodeSplitResult;
```

- `planNodeSplit` の検査の順: 対象が無い → `node-missing`、可視でない → `node-hidden`、座標が有限でない・幅高が 0 以下のノードがある → `placement-failed`、`indexNodeForest` が `null` → `invalid-structure`、区切り文字が空 → `separator-empty`、断片が 2 件未満 → `not-splittable`、201 件以上 → `too-many-fragments`。成功なら断片の配列を返す。
- `splitNode`: `planNodeSplit` が成功したあと、`newNodeIds` で断片 2 件目以降のノードを作る。`newNodeIds` の件数が断片数 − 1 と違う、または既存の ID と重なる・自分の中で重なるときは `id-conflict`（「新しい ID が使えない」の意味）。
  - 元のノードは `label = fragments[0]` に更新するだけで、ほかの属性は変えない。
  - 断片 k（k ≥ 2）は、`createSiblingNode` と同じ規則で、直前までに作った配列を基準に座標を決める（x は元のノードと同じ、y は同じ親の兄弟の最も下の下端 + `SIBLING_VERTICAL_GAP`）。重要度は元のノードと同じ。
  - 配列では、元のノードの直後に断片 2 件目以降を断片順に差し込む。ほかのノードは同じオブジェクトのまま、相対順も変えない。
  - 配置モードは引数に取らない。自動配置の全体の再レイアウトは `applyTreeChange` に任せる。分割は元のノードが配列上の位置のままなので、先頭のルートが変わらず、座標の引き継ぎも要らない。`placement-failed` は座標の検査と、`applyTreeChange` の再レイアウトの失敗で返る。
- `canSplitNode(nodes, nodeId: number | null, visibleNodeIds): boolean` は「対象が存在し可視」（ボタンの有効判定。断片数は区切り文字しだいなので含めない）。

### 3.3 統合

`domain/nodes/nodeMerge.ts`:

```typescript
export type NodeMergeFailureReason =
  | "too-few-nodes" | "node-missing" | "node-hidden" | "primary-missing"
  | "different-parents" | "invalid-structure" | "placement-failed"
  | "plan-changed"; // 確定時の再計画が、プレビューで見せた計画と違う（フックが返す。§4）

export type NodeMergePlan =
  | { ok: true; survivorId: number; absorbedIds: number[];
      label: string; importance: NodeImportance; illustration: string | undefined;
      illustrationFrom: "primary" | "absorbed" | "none";
      illustrationSourceId: number | null; // illustrationFrom が "absorbed" のときだけ元のノードの ID
      discardedIllustrationCount: number;  // 統合で失われるイラストの件数（引き継ぐ 1 件を除く）
      movedChildCount: number }
  | { ok: false; reason: NodeMergeFailureReason };

// 確定時の再計画とプレビューの計画が同じか（survivorId・absorbedIds の順・label・importance・illustrationFrom・illustrationSourceId・discardedIllustrationCount・movedChildCount で比べる。プレビューで見せた内容に合わせる）。
// どちらかが失敗の計画なら偽
export function isSameNodeMergePlan(a: NodeMergePlan, b: NodeMergePlan): boolean;

export function planNodeMerge(
  nodes: readonly Node[], ids: readonly number[], primaryId: number | null,
  joiner: string, visibleNodeIds: ReadonlySet<number>,
): NodeMergePlan;

export type NodeMergeResult =
  | { ok: true; nodes: Node[]; survivorId: number; absorbedIds: number[] }
  | { ok: false; reason: NodeMergeFailureReason };

export function mergeNodes(
  nodes: readonly Node[], ids: readonly number[], primaryId: number | null,
  joiner: string, visibleNodeIds: ReadonlySet<number>, mode: NodeLayoutMode,
): NodeMergeResult;
```

- 検査の順: 重複を除いた `ids` が 2 件未満 → `too-few-nodes`、いずれかの ID が配列に無い → `node-missing`、可視でない → `node-hidden`、`primaryId` が `ids` に含まれない（`null` を含む）→ `primary-missing`、座標が有限でない・幅高が 0 以下のノードがある → `placement-failed`、`indexNodeForest` が `null` → `invalid-structure`、`parentId` が揃わない → `different-parents`。
- 並びは**配列順**（`ids` の順序には依存しない）。
- 結果:
  - ラベル: 配列順にラベルを集め、空文字を除いて `joiner` で連結する（主選択のラベルも同じ規則で、配列上の位置に入る）。
  - 重要度: 選択中で最も高い。重要度の序列は `domain/nodes/nodeResolution.ts` の `IMPORTANCE_RANK`（`high` 2、`medium` 1、`low` 0。現在は未 export）が既に持つ。表を二重に作らないため、序列を `domain/nodes/nodeImportance.ts` へ移して export し、`nodeResolution.ts` と新しい `maxNodeImportance(values: readonly NodeImportance[]): NodeImportance`（同ファイル）の両方が同じ表を使う。挙動は変えず、テストで固定する。
  - イラスト: 主選択が持っていればそれ（`illustrationFrom: "primary"`、高さも主選択のまま）。無ければ、吸収されるノードのうち配列順で最初に持つもの（`"absorbed"`）。引き継いだときだけ、`replaceNodeIllustration`（`attachIllustration` の実体）と同じ規則で、残すノードの高さを `ILLUSTRATED_NODE_HEIGHT` にする。持つものが無ければ `"none"` で、`illustration` のキーを持たない。
  - 位置・大きさ・`id`・`parentId` は主選択のまま（上のイラスト引き継ぎの高さと、次の自動配置の座標の例外を除く）。
  - `mode === "auto"` で、統合前の先頭のルート（配列順で最初の `parentId === null`）が吸収されて、統合後の先頭のルートが別のノードになるときは、新しい先頭のルートへ旧先頭の座標（x, y）を写す（`deleteNodeOnly` と同じ規則）。
  - 吸収されるノードの**直下の子**（折りたたみ・解像度で隠れた子も含む）を、残すノードの子へ付け替える。吸収されるノード自身は配列から消える。付け替えた子を、残すノードの直下の子のうち**配列順で最後のものの直後**（子が無ければ残すノードの直後）に、吸収されるノードの配列順・各ノード内の元の相対順で差し込む。兄弟順は配列順だけで決まり、子孫の連続は仮定しない（子の直後に子孫があっても、その間に差し込んでよい）。子孫は動かさない。ほかのノードは同じオブジェクトで相対順を変えない。
  - 子の座標は変えない（手動配置でも位置を変えず、辺だけが残すノードへつながる。自動配置では `applyTreeChange` が再レイアウトする）。
- 兄弟だけを対象にするため、吸収されるノードの子に残すノードの祖先は含まれず、循環は起きない。

### 3.4 失敗の文言

`nodeSplitMessages.ts` / `nodeMergeMessages.ts`に、`format…FailureNotice(reason): OperationNotice` を置く（`switch` と `never` で網羅性を検査する）。

| 理由 | 分割 | 統合 |
| :--- | :--- | :--- |
| 対象なし・非表示・不正 | 「分割できるノードが選択されていません。」 | 「統合できるノードが見つかりません。」 |
| 区切り文字が空 | 「区切り文字を入力してください。」 | — |
| 断片が 2 件未満 | 「区切り文字で 2 つ以上に分けられません。」 | — |
| 断片が多すぎる | 「分割できるのは 200 件までです。」 | — |
| 選択が 2 件未満 | — | 「2 つ以上のノードを選択してください。」 |
| 主選択なし | — | 「主選択のノードがありません。」 |
| 親が違う | — | 「同じ親の兄弟のノードだけを統合できます。」 |
| 計画が変わった（`plan-changed`） | 「分割の内容が変わりました。もう一度確認してください。」 | 「統合の内容が変わりました。もう一度確認してください。」 |
| 配置不能・新しい ID が使えない（`id-conflict`） | 「ノードを分割できませんでした。」 | 「ノードを統合できませんでした。」（`id-conflict` は無い） |

---

## 4. フック（`useNodes`）

```typescript
splitNode: (
  nodeId: number, separator: string, visibleNodeIds: ReadonlySet<number>, expected: NodeSplitPlan,
) => SplitNodeResult;
mergeNodes: (
  ids: readonly number[], primaryId: number | null, joiner: string,
  visibleNodeIds: ReadonlySet<number>, expected: NodeMergePlan,
) => MergeNodesResult;

// expected はダイアログが確定ボタンを有効にした時点のプレビューの計画。最新の状態から再計画した結果と
// isSameNodeSplitPlan / isSameNodeMergePlan で比べ、違えば何も変えず "plan-changed" を返す（L-036）
type SplitNodeResult = { ok: true; insertedIds: number[] } | { ok: false; reason: NodeSplitFailureReason };
type MergeNodesResult = { ok: true; survivorId: number; absorbedCount: number } | { ok: false; reason: NodeMergeFailureReason };
```

- どちらも `applyTreeChangeWithOutcome` で**最新の状態から**計画を作り直して適用し、1 回で履歴に積む（L-453、L-036）。失敗は何も変えず `reason` を返す（L-001）。再計画そのものが失敗したときは、その失敗の `reason` を返す。`plan-changed` は、再計画が成功して `expected` と違うときだけ返す。
- `splitNode`: 最新の `nodes` で `planNodeSplit` → 採番（`nextAvailableIds`、断片数 − 1 個）→ `splitNode`。計画が失敗したときは採番しない。計画が通ったあとの `placement-failed`（自動配置の失敗）では採番だけが進み、欠番が出る（既存の `insertParentNode` と同じ）。成功時は選択を変えない。
- `mergeNodes`: 成功したら選択を残したノードだけにする（`selectOnly`）。
- 可視集合（`useNodes` は持たない）は、既存の構造編集（`insertParentNode(nodeId, visibleNodeIds)` など）と同じく**引数**で受け取る。呼び出し側は `MapEditor` の `displayState.visibleNodeIds` を各ダイアログのフックへ渡し、フックが `splitNode` / `mergeNodes` とプレビューの計画に使う。

---

## 5. ダイアログ

`useNodeSplitDialog` / `useNodeMergeDialog` の入力は、`nodes`、`selectedNodeId`、`selectedNodeIds`（統合）、`visibleNodeIds`、`documentRevision`、`mapId`、`splitNode` / `mergeNodes`、`publishNotice` とする（`useLabelReplaceDialog` の入力に倣う）。

分割と統合は、対象（分割: `nodeId`、統合: `ids` と `primaryId`）以外が同じ形なので、状態遷移の純関数は `hooks/nodeSplitMergeDialogState.ts` の 1 ファイルにまとめ、対象を `{ kind: "split"; nodeId } | { kind: "merge"; ids; primaryId }` で持つ。フックは `hooks/useNodeSplitDialog.ts` / `hooks/useNodeMergeDialog.ts`、表示は `components/layout/NodeSplitDialog.tsx` / `NodeMergeDialog.tsx`、ヘッダーのボタンは `NodeSplitControl.tsx` / `NodeMergeControl.tsx`。区切り文字の入力は `components/layout/NodeSeparatorField.tsx`（プルダウン + 「その他」の入力 + 可視のラベル）に置いて共有する。stale の文言は、既存の `STALE_LABEL_REPLACE_MESSAGE` を共有の置き場所へ移して一括置換と新規の両方から使う（文言と挙動は変えない）。ヘッダーのボタンへフォーカスを戻す処理は、`MapEditor` に同形の `useLayoutEffect` が既に 2 つある（枝の移動・一括置換）ため、新しい 2 つのダイアログは共通のフック `useHeaderFocusReturn` を使う（既存の 2 つの書き換えは今回の範囲外）。

### 5.1 状態

```typescript
type NodeSplitDialogState = {
  screen: "closed" | "open";
  nodeId: number | null;             // 開いた時点の主選択
  separatorPreset: string;           // プリセットの id、または "custom"
  customSeparator: string;
  openedRevision: number;
  mapId: string;
  error: NodeSplitDialogError;       // { sequence; message | null }
  focusRequest: "separator" | "header" | null;
};
// 統合は nodeId の代わりに ids（開いた時点の selectedNodeIds）と primaryId
```

- 開く: 開いた時点の主選択（分割）または選択集合・主選択（統合）を記録する。区切り文字は既定値にする（毎回の既定に戻す。前回の入力は保持しない）。`documentRevision` を `openedRevision` に記録する。
- `documentRevision` が `openedRevision` と違えば stale。確定できず、「マップが更新されました。閉じてから開き直してください。」を出す（`LabelReplace` と同じ）。`mapId` の変化でも閉じる（フォーカスは奪わない）。

### 5.2 プレビューと確定

- プレビューは**最新の `nodes`** から `planNodeSplit` / `planNodeMerge` を `useMemo` で求める。区切り文字の入力は即時に反映する（計算は軽いので遅延させない）。
- 分割のプレビュー: 対象のラベル、区切り文字、分割後の断片の一覧（番号付き。1 件目は「元のノードに残る」、2 件目以降は「新しい兄弟として追加」と注記）、件数の表示「N件に分割します（M件を追加）」。断片は折り返して全文を表示する。
- 統合のプレビュー: 統合後のラベル、重要度、イラストの扱い（「主選択のイラストを残す」「『○○』のイラストを引き継ぐ」「イラストなし」）、付け替える子の件数、統合されて消えるノードのラベルの一覧（最大 200 行。超過は「ほかに K 件」を表示。確定の対象には含める）、失われるイラストの件数（1 件以上のとき「N件のイラストは統合で失われます」を警告として表示。0 件のときは出さない）、件数の表示「N件を1件に統合します」。
- プレビューの表示（L-821、L-409。一括置換の最終形に倣う）: 断片・連結後のラベル・消えるノードのラベルは、`whitespace-pre-wrap break-words [overflow-wrap:anywhere]` で描き、前後の空白を畳まない。空文字は「（空）」、空白だけは「（空白のみ）」と表示する（`formatLabelReplacePreviewLabel` を共通の置き場所へ移して使う）。一覧は `max-h-60 shrink-0 overflow-y-auto`、ダイアログ全体も `overflow-y-auto` にして、画面が低くても一覧が潰れず確定ボタンに届くようにする。プレビューの計算は軽いので `useDeferredValue` で遅らせない（遅らせると、入力直後の古いプレビューを確定できる隙間と `pending` の管理が要るため）。
- 無効の理由は画面の文言で示す（`aria-live="polite"` の領域に常に描画し、中身だけ替える）: 失敗の `reason` に対応する §3.4 の文言（stale なら §5.1 の文言）。確定ボタンは、プランが成功し、stale でないときだけ有効。
- 確定: `splitNode` / `mergeNodes` を 1 回、現在のプレビューの計画を `expected` として渡して呼ぶ（フックが最新の状態から再計画し、`expected` と違えば何も変えず `plan-changed` を返す）。失敗したらダイアログを閉じず、§3.4 の文言を `role="alert"` で表示する。成功したら閉じ、`publishTreeEditNotice` へ「ノードを N 件に分割しました。」（N = `insertedIds.length + 1`）、「N 件のノードを 1 件に統合しました。」（N = `absorbedCount + 1`）を `status` で出し、ヘッダーのボタンへフォーカスを戻す。
- `submit` は先頭で `latest.current` の `screen` と `canSubmit` を再判定し、確定を押した同じ処理で閉じる（2 回目は呼ばない。L-653、L-101）。

### 5.3 表示・操作

- ダイアログは `role="dialog"`、`aria-modal="true"`、見出しと説明を `aria-labelledby` / `aria-describedby` で結ぶ。`useDialogFocusTrap` でフォーカスを閉じ込め、開くと区切り文字のプルダウンへフォーカスする。`Escape` で閉じ（IME 変換中は処理しない）、閉じるとヘッダーのボタンへフォーカスを戻す。
- 「その他」の入力欄の `Enter` は、IME 変換中でなく、リピートでなく、確定できるときだけ確定する（L-408、L-474）。プルダウンでは `Enter` で確定しない。
- ダイアログが開いている間は、`editorShortcutsEnabled` を `false` にする（`BranchMove`・`LabelReplace` と同じ入口をそのまま写す。履歴ショートカット・ノード操作・コピー＆ペーストを止める。L-061）。外から閉じられた場合は、フォーカスを奪わない（L-762）。
- リピートと二重実行: ヘッダーの 2 つのボタンに `preventRepeatedActivationClick` を付ける。確定・キャンセルのボタンはリピートの Enter・Space を止める。ダイアログの根で `handleDialogClickCapture`（`detail > 1` のクリックを握りつぶす）を使う（L-408、L-653）。
- フォーカスの戻り先のボタンが無効になっているとき（統合の成功後は選択が 1 件になり「ノードを統合」が無効になる）は、`LabelReplace` と同じく、常に押せる「JSON 書き出し」ボタンへ戻す。
- 区切り文字の入力欄には可視のラベルを付ける（L-554）。
- ダイアログ上のクリックの時刻を記録する配線（`onMouseClick={() => { dialogMouseClickedAtRef.current = Date.now(); }}`。`handleDialogClickCapture(event, onMouseClick)` の第 2 引数）を、既存の 4 つのダイアログと同様に渡す。抜かすと、ダブルクリックで確定した直後にキャンバス側のクリックが通る（L-408 の「閉じた後の戻り先」）。
- 新しい状態（ダイアログが開いている）を止める入口を、既存の `BranchMove` / `LabelReplace` から機械的に洗い出して同じ値にそろえる（L-061）: `editorShortcutsEnabled` の積（新しい 2 つの `screen === "closed"` を足す）、ルートの `inert`、ダイアログをルートの外に描画、`changeViewMode`（ビュー切替）、`outlineActions` の有効条件、履歴ショートカット（`useMapHistoryShortcuts`）、`mapId` / `documentRevision` による自動 close、`persistence.isConfirmOpen` との同時表示（保存確認が出ている間は開かない）、`dialogMouseClickedAtRef`。
- ヘッダーのボタン:
  - 並びは、`LabelReplaceControl`（一括置換）の**右に「ノードを分割」「ノードを統合」の順**で置き、その右に既存の「上へ」「下へ」が続く（マップ表示の `viewMode === "map"` のブロックの中）。
  - 「ノードを分割」は、主選択が無い・非表示のとき（`canSplitNode` が偽）は無効。`aria-haspopup="dialog"` と `aria-expanded` を持つ。
  - 「ノードを統合」は、選択が 2 件以上のときだけ有効（1 件以下のときは無効で、理由を `title` と `aria-describedby` の説明で示す）。親が違うなどの理由は、ダイアログを開いたあとのプレビューで示す。

---

## 6. 既存機能との接続

| 機能 | 挙動 |
| :--- | :--- |
| Undo / Redo | 確定全体が 1 操作。Undo で元の構造・ラベル・イラストに戻る。選択集合は既存どおり Undo で解除される。 |
| 保存・エクスポート | 既存のフィールドだけを使う。保存形式（V3）は変えない。 |
| 自動配置 | `applyTreeChange` が全体を再レイアウトする。失敗時は何も変えず「配置不能」を出す。 |
| 手動配置 | 新しい断片のノードだけ座標を決める。統合で付け替えた子は座標を変えない。 |
| 折りたたみ・解像度フィルター | 隠れた子も付け替える。折りたたみの集合は変えない（消えたノードの ID は既存の整理で外れる）。付け替えた子の見え方は、残すノードの折りたたみ状態と解像度に従う（吸収されたノードが閉じていて残すノードが開いていれば、子は見えるようになる。逆もある）。 |
| イラスト生成 | 生成中のノードが統合で消えた・ラベルが変わった場合は、既存の失効の仕組みに従う（新しい処理は足さない）。 |
| 選択 | 分割は変えない。統合は残したノードだけを選択する。 |
| ノード検索・一括置換 | 変えない。`nodes` の変化で索引は既存どおり再計算される。 |
| 複数タブの競合検出・保護モード | 既存の保存経路に従う。 |
| マップ切替・JSON 読込 | ダイアログが開いていれば閉じる（`mapId` と `documentRevision`）。 |

---

## 7. テスト方針

- `splitLabelFragments`: 区切りで分ける、前後の空白を削る、空の断片を捨てる、区切りが無ければ 1 件、区切りが連続・先頭・末尾にある、複数文字の区切り、区切りが空文字のとき、正規化しない（全角・半角の区切りを区別する）。
- `planNodeSplit` / `splitNode`: 各 `reason`（検査の順序を別のテストで固定する）、元のノードが最初の断片を残し子・座標・重要度・イラストを保つ、断片 2 件目以降が直後の兄弟になり座標が `createSiblingNode` の規則どおり、新しいノードがイラストを持たず重要度が元と同じ、ほかのノードが同じオブジェクトで相対順が不変、ルートの分割（`parentId === null`）、`newNodeIds` の件数違い・既存 ID との衝突、自動配置で全体の再レイアウト（`useNodes` の層）。
- `planNodeMerge` / `mergeNodes`: 自動配置でルート同士を統合し先頭のルートが吸収されたとき新しい先頭のルートが旧先頭の座標を引き継ぐ（手動配置では引き継がない）、`maxNodeImportance`、`illustrationFrom` の 3 通りと高さ、折りたたみ状態の違う親へ子を付け替えたときの見え方、各 `reason`、並びは配列順（`ids` の順を変えても同じ）、ラベルの連結（空文字を除く・区切り文字が空・主選択が先頭でない）、重要度の最大、イラストの優先順位（主選択 → 配列順で最初の吸収側 → なし。高さの調整）、子の付け替え（隠れた子・孫は動かない・順序は「残すノードの子の末尾」で吸収される順）、ルート同士の統合、吸収されるノードが配列から消える、ほかのノードが同じオブジェクトで不変、兄弟でない選択の拒否、祖先と子孫の選択の拒否。
- `useNodes`: `splitNode` / `mergeNodes` が 1 回の Undo で戻る、失敗で履歴を積まない、計画の失敗では採番が進まない（自動配置の失敗では欠番が出てよい）、`mergeNodes` 成功後の選択が残したノードだけ、自動配置の失敗が `placement-failed`。
- ダイアログ状態: 開く・既定の区切り文字・stale・閉じる・外から閉じたときに `focusRequest` を出さない。
- コンポーネント: プレビューの内容、無効の理由の文言、`Enter` と `Escape` の IME（`isComposing` と `keyCode 229` を別のテスト）、リピートの `Enter`・`Space`、ダブルクリックの 2 回目の握りつぶし、確定の 2 回目で `splitNode` / `mergeNodes` が呼ばれないこと、プルダウンの `Enter` で確定しないこと、可視のラベル、統合の消えるノード一覧の 200 行上限。
- 統合のプレビューの表示: 空白だけが違う結果（`A ` と ` B` を区切りなしで統合など）が見分けられる、空・空白のみの代替表示、失われるイラストの警告（0 件のときは出さない）。確定の照合: プレビューの後で再計画の結果が変わったとき（`expected` を意図的に食い違わせる）、何も変えず `plan-changed` の文言を出す。
- 入口の洗い出し（L-061）: 新しいダイアログが開いている間、`editorShortcutsEnabled` が偽になることを、分割・統合それぞれのテストで確かめる（積に足し忘れると落ちる）。
- ページ統合: 統合の確定後にフォーカスが「JSON 書き出し」へ移る、マップ表示で分割して断片が直後の兄弟として現れ Undo 1 回で戻る、複数選択を統合して子が付け替えられ Undo 1 回で戻る、アウトライン表示ではボタンが出ない、ダイアログ表示中にショートカットが働かない、統合ボタンが選択 1 件で無効。
- 手動確認（AE 節）には、低い画面での一覧の見え方と、手動配置で分割したときの断片の y と配列順のずれを入れる。
- fixture は、分割できるラベルとできないラベル、子を持つノード・隠れた子・ルート・イラスト付き・重要度が混在する兄弟を混ぜ、ラベルは全ノード同じ値にしない（L-168、L-170、L-616）。
- 仕様: `docs/specifications/features.md` に新しい章（分割・統合）と履歴の単位の表・ヘッダー構成・通知枠・ショートカット停止の列挙を追記。`docs/architecture/overview.md` のファイル一覧・件数。`docs/testing/browser-test-cases.md` に確認節（AE 節）。

---

## 8. 知見（実装時に気をつける ID）

- L-001 / L-002: 構造編集の成否と失敗理由を返し、空の計画・全 ID 不在・部分一致を成功として扱わない。
- L-453: 分割・統合を独立した複数回の更新に分けず、1 回の更新関数でまとめる。
- L-036 / L-063: プレビューと確定を食い違わせず、確定は最新の状態から計画を作り直して行う。破壊的な一括操作（統合）は、対象の決定 → 確認 → 検証 → 実行を 1 つの流れにする。
- L-457 / L-472: フラット配列上の親子の差し込みで、兄弟順の位置を取り違えない（元のノードの直後・残すノードの最後の直下の子の直後の規則を、子孫が間にあるケースを含めてテストで固定する）。
- L-460: 兄弟順は配列順が正本であることを前提に、隠れたノードを含む全体の配列を基準に並べ替える（見えているノードだけを基準にしない）。
- L-062: 確定操作を「入口の前提 → 対象 → 検査 → 書き込み → 確定 → 通知」の流れで設計し、各段階の失敗を §3.4 の表と §7 のテストで押さえる。
- L-432: 採番は検査のあとにまとめて 1 回（`nextAvailableIds`）。
- L-821 / L-409: プレビューの空白と空文字の表示、低い画面での一覧の潰れ（§5.2）。
- L-061: ダイアログが開いている間のショートカット・ヘッダー操作の入口をすべて同じ値で止める。
- L-408 / L-653 / L-101 / L-474: リピート・ダブルクリック・IME・二重実行。
- L-057 / L-058 / L-554: 無効の理由を文言で示し、入力欄に可視のラベルを付ける。
- L-818: 見えない表示で選択を変えない。ボタンをマップ表示に限る。
- L-591: 設計書の更新対象にアーキテクチャ概要（ファイル数・関数の列挙）を入れる（§9）。
- L-048: 既存の `deleteNodeOnly` / `insertParentNode` / `createSiblingNode` の挙動を読んで規則を決める（本書 §2、§3）。

---

## 9. ドキュメント更新

- `docs/specifications/features.md`（行番号は目安。実装時に `grep` で全箇所を洗い出す）:
  - 冒頭の対象機能一覧、Phase 17 の行、ヘッダー構成の図（ボタンの並びは §5.3: 一括置換の右に「ノードを分割」「ノードを統合」、その右に「上へ」「下へ」）。「上へ」「下へ」の位置を「一括置換の右隣」と書いた箇所（2 か所）を直す。
  - 新しい章「ノードの分割・統合」、履歴の単位の表。
  - 「重要度だけは選択集合全体に作用、そのほかは主選択だけ」の記述（3 か所）に、統合も選択集合全体を使うことを加える。
  - 「枝の移動・一括置換のダイアログを開いている間は…」の列挙（8 か所）に新しい 2 つのダイアログを足す。
  - 元に戻した直後に破棄する通知の列挙、枝の構造の変更の通知の系統の列挙。
- `docs/architecture/overview.md`: 新しいファイル（ドメイン・フック・状態・コンポーネント・`useHeaderFocusReturn`）の一覧、`domain/nodes/` `hooks/` `components/layout/` のファイル数、`useNodes` の説明、重要度の序列の移動。
- `docs/testing/browser-test-cases.md`: AE 節（手順と期待結果、結果の集計表）。
- `ROADMAP.md`: 候補035 の完了、現在地（Phase 17 の完了と次の未完了項目＝Phase 18 の先頭）、Phase 17 の見出し「（進行中）」を完了の表記に、「最終更新」の日付。
