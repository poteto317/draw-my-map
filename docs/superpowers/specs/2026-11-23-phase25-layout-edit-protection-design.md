# Phase 25: 配置調整と編集保護 — 設計

- カード: [#30](https://scrum-board-jkcejsb6ka-an.a.run.app/items/30?project=5)
- ROADMAP: Phase 25（候補046 / 047 / 048 / 049 / 050）
- 日付: 2026-11-23

## 決めたこと

1. **範囲**: 046〜050 を 1 機能（1 プラン）で実装する。
2. **対象モード**: 046・047 は **自動レイアウト**（`layoutMode: "auto"`）向け。048・049 は **手動配置**（`"manual"`）向け。050 はモード共通。
3. **永続化**: 046・047 は **マップ文書 V3**（`NodeMapState` 拡張）。049 のグリッド間隔・スナップ ON/OFF は **セッション UI 設定**（`ui-prefs` パターン、マップ保存に含めない）。050 はノード属性 `locked?: true`（値があるノードのみキーを持つ）。
4. **既定値**: 方向 `lr`（現行と同じ左→右ツリー）。間隔は現行定数に一致: 子へ 120px、兄弟 40px（`config/shapes.ts` と同値がフォールバック）。
5. **切替時の挙動**: 方向・間隔を変更したら自動モードでは **即時に全ノード自動レイアウトを 1 回** 実行（Undo 可能な単一履歴エントリ）。**手動→自動**へ `layoutMode` を切り替えたときも、保存済みの `treeDirection` / `layoutSpacing` で同様に 1 回レイアウト。手動モードでは設定だけ保持し座標は変えない（047 の UI は編集可能だがリレイアウトはしない）。
6. **整列・等間隔（048）**: 選択 2 件以上・手動モード・ロックされていないノードのみが対象。整列 6 種（左・水平中央・右・上・垂直中央・下）と等間隔 2 種（水平・垂直）。1 操作 = 1 Undo。
7. **スナップ（049）**: ドラッグ終了時に X/Y を `gridStep` の倍数へ丸める（規則は下記）。既定 `gridStep=8`、ON/OFF と step はセッション。キャンバス上に**薄いグリッド線**（論理座標、ズームに追従）をオプション表示。ROADMAP の「ガイド」は **このグリッド線表示** で満たす（他ノード端へのスマートガイドは非目標）。ズーム・パンでグリッドはビューポート矩形だけ再計算し、実効 transform が変わらないフレームでは prefs State を更新しない（L-526）。
8. **編集ロック（050）**: ノード単位の `locked`。枝ロックは「選択 1 件の部分木の全ノードに `locked` を付与/解除」する一括操作。ロック中は位置・ラベル・属性・接続・削除・統合分割など **構造と内容の変更を拒否**（選択・ナビ・検索着地は可）。ロックノードのドラッグ開始は無効。子の手動ドラッグで親が動かない既存挙動は維持。
9. **実装順**: ①間隔・方向のドメインと永続化 → ②自動レイアウトへの配線 → ③整列・等間隔ドメイン → ④スナップ＋グリッド描画 → ⑤編集ロックと操作ガード → ⑥ヘッダー/コマンド/UI → ⑦ `features.md`・ROADMAP。
10. **コピー**: 日本語 UI。ヘッダーに配置系コントロールをまとめる（Phase 24 の深度/強調と同列）。

## 非目標

- 手動モードでの自動ツリー再配置（方向変更で手動座標を回転する等）。
- エッジルーティングの方向別最適化（曲がり角の個別調整）。
- ロックのパスワード保護・共有マップでの権限分離。
- スナップ時のノード間スマートガイド・距離ラベル。
- グリッド間隔のマップごと永続化。

## 背景と現状

- `layoutMode`: `manual` | `auto`（既存）。
- 自動レイアウトは **水平ツリー固定**。定数 `CHILD_HORIZONTAL_GAP` / `SIBLING_VERTICAL_GAP` を `nodeAutoLayout` 系が参照。
- 手動ではノード個別ドラッグ。複数選択は既存。整列・スナップ・ロックは未実装。
- `Node` 任意属性は `NODE_ATTRIBUTE_POLICY` で分割・統合・親挿入を宣言（L-825）。

## 要件

### 046 レイアウト方向

- 列挙: `treeDirection: "lr" | "tb"`（left-right / top-bottom）。
- UI: 自動レイアウト時のみ有効なトグル（手動時は disabled + ツールチップで説明）。
- `tb` では子は親の下、兄弟は横並び。深さ→Y、兄弟順→X に軸を入れ替えた版の既存 forest アルゴリズムを使用。
- 保存: V3 の任意フィールド。欠落時は `lr`。
- デコード: `normalizeMapDocumentTreeDirection` — 欠落・`undefined` は `lr`。`"lr"` / `"tb"` 以外は **文書全体を decode 失敗**。V1/V2 からの昇格時はフィールド無し→`lr`。エンコードは値が `lr` のときキー省略可（省略時も読み取りは `lr`）。

### 047 配置間隔

- `layoutSpacing: { childGap: number; siblingGap: number }`（正の整数、上限 400、下限 8）。
- **軸の意味**: `childGap` は親→子のツリー進行方向の隙間（`lr` では水平、`tb` では垂直）。`siblingGap` は兄弟方向の隙間（`lr` では垂直、`tb` では水平）。
- UI: スライダーまたは数値入力 2 つ。自動モードでのみ即リレイアウト。手動モードでは値のみ編集。
- デコード: `normalizeMapDocumentLayoutSpacing` — 欠落は全体省略（各所は定数フォールバック）。オブジェクトは **両キー必須**。片方欠落・非整数・範囲外は decode 失敗。エンコードは既定値と一致するときキー省略可。
- 自動レイアウト・手動の新規子プレースホルダ（`nodeManualPlacement` / `nodeIndentPlacement`）はマップ設定を参照。グローバル定数は**デフォルト値の単一ソース**として残し、文書に値が無いときだけ使う。

### 048 選択範囲の整列・等間隔

- 前提: `layoutMode === "manual"`、選択 ID が 2 以上、すべて未ロック。
- 整列: 選択集合の外接矩形に対する 6 操作。
- 等間隔: 選択を対象軸の **左端 x（または上端 y）** でソート。端点 2 ノードの外接矩形位置は固定し、中間ノードは **隣接矩形間の隙間（gap）が等しくなる** よう移動（ノード幅・高さは維持）。2 件のときは移動なし（既に端点のみ）。
- ロックされた ID が 1 つでも混ざれば操作全体を拒否（Result で理由返却）。
- UI: ヘッダー内メニューまたはサブメニュー。コマンドパレット登録は任意（時間があれば）。

### 049 グリッド・スナップ

- セッション設定キー例: `draw-my-map.layout-snap.v1` — `{ enabled: boolean; showGrid: boolean; gridStep: number }`。
- `gridStep` 検証: 4〜64、4 の倍数。
- ドラッグ中は生座標、pointerup で `snapToGrid(value, step) := Math.round(value / step) * step`（負座標も同式。0 への丸めは IEEE round）。
- グリッド線: ビューポート範囲のみ描画（Pixi または既存オーバーレイレイヤ）。`showGrid && enabled` のとき表示。
- 手動モードのみ。自動モードではコントロール非表示。

### 050 編集ロック

- 型: `locked?: true`（boolean 厳密 `true` のみ永続化。`normalize` でそれ以外は項目削除）。
- ポリシー: `split: original-only`, `merge: survivor-else-first`, `parentInsert: none`（L-825 準拠）。
- **選択集合に `locked` が 1 件でも含まれる操作**は、048 と同様 **操作全体を拒否**（一括重要度・一括削除・複数選択削除など。既存の「主選択のみ」操作は対象外だが、変更が選択集合に及ぶものは拒否）。
- ブロックする操作（テストで固定）:
  - ドラッグ移動、自動モードの兄弟並べ替え、ラベル編集、ノード削除、親子の付け替え、分割・統合・親挿入、属性パネルでの note/links/tags 等の変更。
  - **クリップボード**: コピー時は `locked` を写す。貼り付け・複製で **既存ノードの `locked` を変更しない**（新規ノードはソースの `locked` を持ち得る）。統合で survivor が `locked` なら拒否。部分木貼り付けが既存 ID を上書きする経路は拒否。
- 許可: 選択、フォーカス、検索着地、ピン、表示フィルタ、ロック自体の ON/OFF。
- UI: 選択 1 件で「ロック切替」。選択 1 件で「枝をロック/解除」。ロックノードは枠アイコンまたは鍵アイコン（軽量な視覚ヒント）。
- 部分木ロック: `lockSubtree(rootId)` / `unlockSubtree(rootId)` — 1 Undo。既に一部だけ locked の部分木では、lock は未ロックのみ付与、unlock は部分木内の全 locked を解除。

## アーキテクチャ

```
types/           treeDirection, layoutSpacing on NodeMapState; locked on Node
persistence/     normalize + encode/decode V3 fields; mapDocumentNode locked
domain/nodes/    layoutSpacing resolve, treeDirection in auto layout engine
                 selectionAlign.ts, selectionDistribute.ts
                 snapGrid.ts, nodeEditLock.ts (guard helpers)
hooks/           useLayoutSettings, useSnapGridPrefs, useSelectionLayoutActions
components/      LayoutDirectionControl, SpacingControl, SelectionAlignMenu,
                 SnapGridControl, LockControls
MapEditor        wire guards at existing mutation entry points
```

### 操作ガードパターン（050）

- 各 mutation 前に `assertNodesEditable(nodeIds, nodes)` を呼ぶ。失敗時は既存と同様 `Result` / 無操作。
- 中央ヘルパー `isNodeEditable(node)` → `!node.locked`。
- 統合テスト: `MapEditor` 相当のフック経路でロック時に変更が入らないこと。

## 知見の反映

- **L-825**: `locked` 追加時に `NODE_ATTRIBUTE_POLICY`、見本テスト、`projectMapDocumentNode`、`mapConflict` / `mapHistory` の `areNodesEqual` を更新（L-203 と同期）。
- **L-061**: 050 導入時 **操作入口インベントリ**（下表）を実装前に固定し、各入口で `assertNodesEditable` または同等の early guard。MapEditor 統合テストで代表経路を検証。
- **L-214**: ヘッダーの配置・ロック・スナップメニューは、選択変化・フィルタで対象が消えたとき開状態を閉じる（Phase 24 オーバーレイ同期と同パターン）。
- **L-526**: ビューポート変化時のみグリッドジオメトリ更新。同一 transform の連続イベントで不要な React 更新をしない。
- **L-921**（049 ストレージ）: `client/src/services/layoutSnapStorage.ts`（名称固定）。`readSnapPrefs()` → `ok | corrupt | read-error`（失敗を空成功にしない）。`writeSnapPrefs` → `ok | quota-exceeded | write-error`。更新は read→merge 1 フィールド→write。別タブ残存は `storage` イベントで再読取。

### 050 操作入口インベントリ（ロックガード対象）

| 入口 | 拒否条件 |
|------|----------|
| ノードドラッグ | 対象 ID のいずれか locked |
| ラベルインライン編集 | 対象 locked |
| 削除・Backspace | 選択集合に locked 含む |
| 分割・統合・親挿入 | 関与ノードに locked |
| 重要度・属性パネル更新 | 対象 locked |
| 兄弟 DnD（auto） | 移動対象 locked |
| クリップボード貼り付け上書き | 上記クリップボード規則 |
| 整列・等間隔 048 | 選択に locked 含む |

## 検証

- 各ドメインモジュールに単体テスト（TDD）。
- 既存 `nodeAutoLayout` / `mapDocument` テストを拡張。
- 変更後 `client` で `npm run verify`。

## 未決事項（レビューで解消予定）

なし（推奨案を上記「決めたこと」に固定）。