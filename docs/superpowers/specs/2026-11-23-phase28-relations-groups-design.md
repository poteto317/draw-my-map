# Phase 28: 親子関係以外の表現 — 設計

- カード: [#33](https://scrum-board-jkcejsb6ka-an.a.run.app/items/33?project=5)
- ROADMAP: Phase 28 候補 **061 / 062 / 063**（1 PR）
- 日付: 2026-11-23

## 決めたこと

1. **範囲**: 061（関連線）・062（意味付け）・063（グループ枠）を **1 PR** で実装する。マップ間の関係図（093）は非目標。
2. **データ配置**: ノード任意属性には載せない。`NodeMapState`（＝ MapDocument V3）に文書級の任意配列を追加する。
   - `relations?: readonly MapRelation[]`
   - `groups?: readonly MapGroup[]`
   - 欠落キー＝空。空配列はエンコード時にキー省略。
   - **版は V3 のまま**（`treeDirection` / `layoutSpacing` と同型の拡張）。
3. **ID 採番**: `MapRelation.id` と `MapGroup.id` は **ノード ID と同一の正整数空間を共有**する。`nextAvailableIds`（または同等）は **nodes ∪ relations ∪ groups の全 id** を見て採番する（ノード追加も relation/group id を避ける）。
4. **061 — MapRelation**:
   ```ts
   type MapRelation = {
     id: number;
     fromId: number;
     toId: number;       // fromId !== toId
     kind: RelationKind; // 必須
     directed: boolean;  // true= from→to 矢印、false=無向
   };
   type RelationKind = "dependency" | "conflict" | "reference" | "related";
   ```
   - 日本語: 依存 / 対立 / 参考 / 関連。新規既定は `related`・`directed: false`。
   - **重複拒否**（追加時も kind/directed **更新時**も同じ）:
     - 無向: 正規化キー `{min(a,b), max(a,b), directed:false}` が既存と一致したら拒否（kind が違っても拒否）。
     - 有向: `(from,to, directed:true)` が一致したら拒否。逆向きは別関係として許可。
     - 同一ノード対に無向と有向の混在は **許可しない**。
     - 更新で規則違反になる変更は拒否（例: 有向 A→B と B→A があるとき一方を無向にできない）。
5. **063 — MapGroup**:
   ```ts
   type MapGroup = {
     id: number;
     nodeIds: readonly number[]; // 重複無し・2 件以上・存在するノードのみ
     label: string;              // 空文字可（表示は「グループ」フォールバックは UI のみ。永続は空可）
   };
   ```
   - 同一ノードが複数グループに入ることを **許可**する。ヒット優先: ノード > 関連線 > グループ枠。
   - ラベル最大 100 コードポイント（超過は codec で切り詰めず **不正エントリとして除去**）。
6. **操作入口（L-061・正本）**:
   | 入口 | visible | disabled / 拒否 | 関与 |
   |------|---------|------------------|------|
   | コンテキスト「関連線を追加」→相手ピッカー（現在マップの他ノード一覧。主選択以外） | マップ・主選択1 | アウトライン／保護／競合／主選択 locked／相手 locked／重複規則 | 主選択＋相手 |
   | 選択ちょうど2→コンテキスト「関連線で結ぶ」 | マップ・選択2 | 同上 | 両端 |
   | 関連線クリックで選択 | マップ | — | その relation |
   | 関連線の削除（Delete / メニュー） | 関連線選択時 | 保護／競合／両端いずれか locked | 両端 |
   | 意味の編集（右パネル「関連線」節: kind ラジオ＋有向トグル） | 関連線選択時 | 同上 | 両端 |
   | 選択≥2→コンテキスト「グループ化」 | マップ | アウトライン／保護／競合／メンバーいずれか locked | メンバー全員 |
   | コンテキスト「この枝をグループ化」（主選択の subtree・2 件以上のとき） | マップ・主選択1・subtree≥2 | 同上 | subtree 全員 |
   | グループ枠クリックで選択／削除／ラベル編集（パネル） | マップ | 保護／競合／メンバー locked | メンバー |
7. **描画**:
   - 関連線: 親子 `renderMapEdges` と別関数。両端可視時のみ。色は kind 固定トークン（dependency=`#2563eb`, conflict=`#dc2626`, reference=`#0f766e`, related=`#64748b`）。有向は矢印。ヒット有効。
   - グループ枠: メンバー AABB＋余白 12px の角丸。背面。ラベルは上辺（空なら「グループ」を表示のみ）。
8. **GC・複製（ノード ID が消える／写る全経路）**:
   - **消える経路**（単ノード削除、枝削除、統合で吸収される ID、外部取込で落ちた ID など）: relation は端点欠損で削除。group は ID 除去→残 2 未満で削除。
   - **枝移動・切り出し**: 移動集合に閉じた relation/group は ID remap して同行。境界横断 relation は削除。メンバーが分割される group は削除。
   - **クリップボード／複製／貼付**: コピー対象のノード集合に閉じた relation/group だけを新 ID で写す。境界横断は捨てる。
   - **統合**: 吸収 ID の端点を survivor にリライト。自己ループ化したら削除。リライト後に重複規則キーが衝突したら **余剰の 1 本を削除**（安定のため id 昇順で残す）。group は吸収 ID→survivor 置換・重複除去→2 未満なら削除。
9. **永続化の不正データ**: `relations` / `groups` の各要素が不正（未知 kind、自己ループ、欠落端点、重複キー、nodeIds が 2 未満、非整数 id 等）な場合は **その要素だけ除去**して文書は成功（`icon`/`kind` ノード属性と同型の「キー削除で文書成功」）。配列全体が非配列ならキーごと無視。文書全体を corrupt にしない。
10. **既存操作×新選択（L-061 追補）**:
   - **関連線選択中**（ノード主選択はクリア）: Delete＝関連線削除。コピー／切取／貼付／接続／インデント／親挿入／分割統合／枝切り出し／ノード属性編集／コマンドパレットのノード操作＝**無効**。パレットへの新操作掲載は **非目標**（コンテキスト＋パネルのみ）。
   - **グループ選択中**: Delete＝グループ削除（中のノードは残す）。ノード対象操作は無効。ラベルはグループ用パネルのみ。
   - **相手ピッカー表示中**: inert／shortcuts 停止。
11. **Undo**: relation/group の追加・削除・kind・directed・グループラベルを履歴に載せる。
12. **可視**: 関連線の「両端可視」は親子線と同じ `visibleNodeIds` 集合を使う。
13. **実装順**: ①型・codec・equal・GC/複製 ②関連線＋選択＋ピッカー＋ガード ③意味 UI ④グループ ⑤inventory・docs（features / data-model / overview / api / ROADMAP / 型コメント）⑥verify。
14. **知見**: L-061, L-825, L-1061, L-203, L-1085。

## 非目標

- マップ間関連線、自由テキスト種別、グループ入れ子、枠の手動リサイズ、093。

## 検証

- 異枝 2 ノードを関連線で結べる。重複規則どおり拒否。
- kind / directed 変更が Undo・再読込で残る。
- グループ: メンバー移動で枠追従。メンバー削除で ID 除去→2 未満で消滅。
- locked 関与で操作 disabled。
- `npm run verify`。

## 未決事項

なし。
