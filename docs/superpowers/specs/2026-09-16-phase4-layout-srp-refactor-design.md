# Phase 4 レイアウトエンジン単一責任リファクタリング設計

## 目的

`origin/main...HEAD`で追加・変更されたPhase 4レイアウトエンジンを、変更理由が1つの純粋モジュールへ分割する。公開API、計算量、入力順、エラー契約を維持し、内部責務とユニットテストの境界を一致させる。既存動作の維持には次の不具合修正を例外として含める: 未使用の末尾演算が原因で有効な大座標入力を拒否する不具合と、設定gapが丸めで縮んだ配置を受理する不具合。前者は不要演算を省略して有効結果を返し、後者は実gapを検証して許容差を超える不足を`null`で拒否する。

## 対象の棚卸し

### リファクタリング対象

- `client/src/domain/nodes/nodeLayoutGeometry.ts`
  - 安全な数値演算
  - 深さ別X列の計算
  - 部分木spanの計算
  - 座標配置
  - 配置後の縦間隔検証
  - 以上の独立した変更理由が1ファイル・1関数へ集中している。
- `client/src/domain/nodes/nodeLayoutForest.ts`
  - ノード値と親子関係の検証
  - ルート・子配列の索引構築
  - 深さ、ルート入力順と各兄弟入力順を保つ非再帰DFSの深さ別配置順、post-orderの走査
  - 検証・索引と走査アルゴリズムという異なる変更理由が混在している。
- `client/src/domain/nodes/__tests__/nodeAutoLayout.test.ts`
  - 公開API契約、数値境界、配置、間隔検証を統合テストとして保持しつつ、内部責務の直接テストを別ファイルへ追加する。
- `client/src/domain/nodes/__tests__/nodeLayoutForest.test.ts`
  - 索引構築と走査のテストを責務別テストへ移し、合成境界だけを残す。

### 変更不要

- `client/src/domain/nodes/nodeAutoLayout.ts`
  - ツリー索引、座標計算、公開出力変換を順に呼ぶユースケース調停だけを担当している。
- `client/src/config/shapes.ts`
  - レイアウト間隔の設定値だけを担当している。
- `docs/superpowers/specs/2026-09-15-phase4-auto-layout-design.md`
  - Phase 4の外部仕様だけを記述している。
- `docs/superpowers/plans/2026-09-15-phase4-auto-layout.md`
  - 承認済み設計の実装手順だけを記述している。

## 制約

- `layoutNodeForest(nodes: readonly Node[]): Node[] | null`を変更しない。
- 有効入力では新しい配列を返す。
- 座標が変わらないノード参照を維持する。
- 最初のルートのX座標とY座標を厳密に維持する。
- ルート、兄弟、出力ノードの入力順を維持する。
- 無効入力、循環、overflow、精度飽和では`null`を返す。
- 水平列・兄弟・ツリー間の設定gapについて、絶対上限付き丸め許容範囲を超える実gap不足と実際の重なりを拒否する。
- 本番処理は時間・追加メモリともに`O(n)`とする。
- 再帰呼び出しと本番コードでの全ノードペア探索を使わない。
- 外部依存を追加しない。
- 未使用末尾演算による有効大座標の誤拒否と、丸めで設定gapが縮む配置の誤受理は修正対象とする。それ以外の公開動作変更、機能追加、ロードマップ更新、コミットを行わない。

## モジュール設計

### 安全な数値演算

`client/src/domain/nodes/nodeLayoutArithmetic.ts`を新設する。

```ts
export function checkedAdd(left: number, right: number): number | null;
export function checkedSubtract(left: number, right: number): number | null;
export function checkedMultiply(left: number, right: number): number | null;
export function calculateRoundingTolerance(
  first: number,
  second: number,
  absoluteLimit: number,
): number;
export function hasSufficientGap(
  start: number,
  end: number,
  requiredGap: number,
): boolean;
```

このモジュールは数値演算結果の有限性、加減算の単調性、座標規模に応じた丸め許容値と、安全な実差分によるgap充足判定を担当する。ノード、ツリー、レイアウト間隔の設定値には依存しない。`hasSufficientGap`は`requiredGap * 1e-9`を絶対許容上限として関数内で導出し、`checkedSubtract(end, start)`でoverflow・精度飽和・負値を拒否したうえで、必要値との差を座標規模由来かつ絶対上限付きの許容値と比較する。metrics、placement、spacingはこの3引数の判定を共用する。

### 親子関係の検証と索引

`client/src/domain/nodes/nodeLayoutForestRelations.ts`を新設する。

```ts
export type NodeForestRelations = {
  nodes: readonly Node[];
  roots: readonly Node[];
  childrenByParent: ReadonlyMap<number, readonly Node[]>;
};

export function buildNodeForestRelations(
  nodes: readonly Node[],
): NodeForestRelations | null;
```

このモジュールは次だけを担当する。

- ID、座標、寸法の検証
- ID重複と親欠損の検証
- 入力順を保つルート配列と子配列の構築

循環、深さ、post-orderは扱わない。

### ツリー走査

`client/src/domain/nodes/nodeLayoutForestTraversal.ts`を新設する。

```ts
export type NodeForestTraversal = {
  depthById: ReadonlyMap<number, number>;
  nodesByDepth: readonly (readonly Node[])[];
  postOrder: readonly Node[];
};

export function traverseNodeForest(
  relations: NodeForestRelations,
): NodeForestTraversal | null;
```

このモジュールは、構築済み親子索引を、ルートを入力順、各親の子を入力順で進む非再帰DFSとして走査する。`nodesByDepth`の各配列は、このDFSでその深さのノードを配置した順とし、ルート入力順と各兄弟入力順を保つ。あわせて深さ、child-before-parentのpost-order、循環・未到達ノードを検証する。ノード値の妥当性と座標計算は扱わない。

### 索引の合成境界

`client/src/domain/nodes/nodeLayoutForest.ts`は次だけを担当する。

1. `buildNodeForestRelations`を呼ぶ。
2. `traverseNodeForest`を呼ぶ。
3. 2つの正常結果を`IndexedNodeForest`へまとめる。

既存の`IndexedNodeForest`と`indexNodeForest`の公開名・戻り値を維持する。

### レイアウト寸法

`client/src/domain/nodes/nodeLayoutMetrics.ts`を新設する。

```ts
export type NodeLayoutMetrics = {
  columnX: readonly number[];
  spanById: ReadonlyMap<number, number>;
  childrenHeightById: ReadonlyMap<number, number>;
};

export function calculateNodeLayoutMetrics(
  forest: IndexedNodeForest,
): NodeLayoutMetrics | null;
```

このモジュールは次だけを担当する。

- 深さごとの最大幅とX列、および算出した水平列gapの充足検証
- post-orderによる子グループ高さ
- 各部分木のspan

座標配置と配置後検証は扱わない。

### 座標配置

`client/src/domain/nodes/nodeLayoutPlacement.ts`を新設する。

```ts
export type LayoutPoint = { x: number; y: number };

export function placeNodeForest(
  forest: IndexedNodeForest,
  metrics: NodeLayoutMetrics,
): ReadonlyMap<number, LayoutPoint> | null;
```

このモジュールは計算済み列・spanを使い、非再帰で各ノードの座標を配置する。最初のルートのX・Yを厳密に維持し、後続ツリーを`TREE_VERTICAL_GAP`で積み、算出したツリー区間の実gapを検証する。後続がない末尾では次のgapを計算しない。入力検証、寸法計算、配置後の全体重なり判定は扱わない。

### 縦間隔検証

`client/src/domain/nodes/nodeLayoutSpacing.ts`を新設する。

```ts
export function hasValidVerticalSpacing(
  forest: IndexedNodeForest,
  positions: ReadonlyMap<number, LayoutPoint>,
): boolean;
```

このモジュールは深さ別の配置順だけを検査する。

- 実際の矩形重なりを無条件に拒否する。
- `SIBLING_VERTICAL_GAP`未満の不足を拒否する。
- 独立演算による数ULPの差だけを、現在と同じ絶対上限付き許容値で受け入れる。
- 非有限値と精度飽和を拒否する。

座標を修正せず、検証結果だけを返す。

### ジオメトリの合成境界

`client/src/domain/nodes/nodeLayoutGeometry.ts`は次だけを担当する。

1. 空forestへ空Mapを返す。
2. `calculateNodeLayoutMetrics`を呼ぶ。
3. `placeNodeForest`を呼ぶ。
4. `hasValidVerticalSpacing`を呼ぶ。
5. いずれかが失敗した場合に`null`を返す。

既存の`calculateNodePositions`と`LayoutPoint`の公開名・戻り値を維持する。`LayoutPoint`は配置モジュールから再exportする。

## データフロー

```text
readonly Node[]
  → buildNodeForestRelations
  → traverseNodeForest
  → indexNodeForest
  → calculateNodeLayoutMetrics
  → placeNodeForest
  → hasValidVerticalSpacing
  → calculateNodePositions
  → layoutNodeForest
  → Node[] | null
```

各段階は入力を変更せず、失敗時は`null`または`false`を返す。後続段階は失敗結果を受け取らないため、部分的な公開出力は発生しない。

## テスト設計

### 数値演算

`nodeLayoutArithmetic.test.ts`を追加し、通常の正負加減算、0、非有限結果、正負方向の精度飽和、乗算overflow、丸め許容値の座標規模追従と絶対上限を検証する。共通gap判定では正確なgap、数ULP不足の許容、意味のある不足、負gap、実差分overflow・精度飽和を直接検証する。

### 親子索引

`nodeLayoutForestRelations.test.ts`を追加し、入力順、親が子より後に現れる入力、ID重複、親欠損、非有限値、0以下の寸法を検証する。

### ツリー走査

`nodeLayoutForestTraversal.test.ts`を追加し、深さ、ルート入力順と各兄弟入力順を保つ非再帰DFSの深さ別配置順、child-before-parentのpost-order、自己参照、複数ノード循環、未到達成分、2,000階層の非再帰処理を検証する。たとえば、ルート`[1, 9]`、`1`の子`[2, 3]`、`2`の子`[4]`では、`nodesByDepth`の期待順は`[[1, 9], [2, 3], [4]]`とする。

### レイアウト寸法

`nodeLayoutMetrics.test.ts`を追加し、深さ別最大幅によるX列、異なる高さの部分木span、兄弟間隔、overflowと精度飽和を検証する。

### 座標配置

`nodeLayoutPlacement.test.ts`を追加し、先頭ルートの厳密な座標保持、親の中央配置、入力順の子配置、複数ルートの積み上げ、非再帰の深い配置を検証する。

### 縦間隔

`nodeLayoutSpacing.test.ts`を追加し、正確な間隔、実際の重なり、意味のある間隔不足、数ULPだけの不足、極端な座標で許容値が上限を超えないことを検証する。

### 合成・公開契約

- `nodeLayoutForest.test.ts`はrelationsとtraversalの成功・失敗伝播と、逆順2,000ノードに対する合成境界の線形入力読み取り契約を検証する。
- `nodeAutoLayout.test.ts`は既存の公開API契約、非重複、参照保持、無効入力の原子的失敗を維持する。子が親より先でroot IDも非昇順の入力順保持と、大座標で水平・兄弟・ツリーgapが縮む配置の拒否を回帰として検証する。
- 既存テストを削除する場合は、同じ失敗を新しい責務別テストまたは公開契約テストが検出できることを確認してから移動する。

不具合修正は回帰テストを先に追加・実行し、契約違反によるREDを確認してから実装する。新モジュール未作成による失敗はその旨を区別する。既存動作の特性追加が最初からGREENならREDと記録しない。

## 完了条件

- 棚卸しで要対応と判断した2つの本番モジュールが、合成境界だけを持つ。
- 新設する各モジュールに変更理由が1つだけある。
- 公開API・入力順・参照保持・失敗の戻り値契約を維持する。既存動作からの変更は、未使用末尾演算による有効大座標の誤拒否を解消することと、丸めで設定gapが縮む不正配置を拒否することに限定し、両方を公開回帰テストで検証する。
- 責務別ユニットテストと公開統合テストが成功する。
- `npm run verify`が成功する。
- `origin/main...HEAD`を再点検し、追加の単一責任違反が0件である。
- Gitコミットを作成しない。
