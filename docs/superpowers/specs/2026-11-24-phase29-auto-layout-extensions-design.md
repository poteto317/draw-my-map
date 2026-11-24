# Phase 29: 自動配置の拡張 — 設計

- カード: [#34](https://scrum-board-jkcejsb6ka-an.a.run.app/items/34?project=5)
- ROADMAP: Phase 29 候補 **064 / 065 / 066**（1 PR）
- 日付: 2026-11-24
- ユーザー確認: 推奨案すべて採用（layoutStyle 分離・文書級 branchLayouts・layoutPinned・ヘッダー／コンテキスト入口）
- feature-spec 第1周対応: 放射幾何・rl/bt 鏡映・manual 時 UI・ピン座標ドラッグ／局所原点・即時再配置・parentInsert を追記
- feature-spec 第2周対応: 中心鏡映式・混在枝 span・多ルート扇／残角・ピン回避矩形・ピン関与の間隔検証を追記

## 決めたこと

1. **範囲**: 064（放射状）・065（枝ごとの配置方向）・066（位置固定付き自動配置）を **1 PR** で実装する。Phase 30 の入出力・プレゼンは非目標。
2. **版**: MapDocument **V3 のまま**（`treeDirection` / `layoutSpacing` / `relations` と同型の任意キー追加）。
3. **064 — レイアウト様式（文書級）**:
   ```ts
   type LayoutStyle = "orthogonal" | "radial";
   // NodeMapState.layoutStyle?: LayoutStyle  // 欠落＝"orthogonal"
   ```
   - `orthogonal`: 既存どおり `treeDirection`（`lr`|`tb`）＋間隔で直交ツリー配置。
   - `radial`: 中心テーマから周囲へ。詳細幾何は下の「放射の幾何契約」。
   - `treeDirection` は **保持するが radial 中は配置に使わない**（orthogonal に戻したとき再開）。
   - UI: ヘッダーに「直交 / 放射」切替（日本語）。**`layoutMode === "manual"` のときは `TreeDirectionControl` と同型で disabled**（値は保持・変更不可）。再配置は `auto` のときだけ走る。
   - **放射の幾何契約**:
     - **原点**: 単一ルートならそのルートの **中心**（`x + width/2`, `y + height/2`）。複数ルートなら、配置前の全ルート中心の幾何平均を仮想中心 C とし、半径 `R0 = layoutSpacing.childGap` の円周上に置く。
     - **多ルートの角と残角**: ピン留めルートは円周再配置しない（座標固定）。非ピンルートは **常に 360° を非ピンルート数で等分**した偏角（文書順、開始角 0＝+X）に置き、ピンの偏角ギャップには合わせない（単純等分。ピンと重なっても Phase 29 は許容し衝突ソルバを置かない）。
     - **各ルート配下の扇幅**: 単一ルートは全周 360°。複数ルートでは各ルートに幅 `360° / ルート総数`（ピン含む）のセクタを与え、セクタ中心をそのルートの偏角（ピンなら C から見た現座標の偏角）に合わせる。子以降は親セクタを兄弟数で等分。
     - **扇形（子）**: 親セクタ内で子を **兄弟の文書順で等角**。深さの半径増分は `layoutSpacing.childGap`。同一円弧上の最小弦長は `layoutSpacing.siblingGap`（足りなければ半径を足す）。部分木サイズ比例は **しない**。
     - **失敗**: 既存と同様、森の索引不能または座標計算不能なら `null`。Phase 29 に別の衝突ソルバは置かない。
     - **layoutSpacing**: radial 中もヘッダーから変更可で、上の半径／弦に効く。`treeDirection` だけ radial 中 disabled。
4. **065 — 枝ごとの配置方向（文書級・L-825）**:
   ```ts
   type BranchLayoutDirection = "lr" | "rl" | "tb" | "bt";
   type BranchLayout = { nodeId: number; direction: BranchLayoutDirection };
   // NodeMapState.branchLayouts?: readonly BranchLayout[]
   ```
   - **ノード任意属性には載せない**。欠落キー＝空。空配列はエンコード時キー省略。
   - エントリは「その `nodeId` を根とするサブツリー」の成長方向。未指定ノードは文書の `treeDirection`（orthogonal）に従う。祖先に指定があれば **最も近い祖先の指定**を使う（自分のエントリが最優先）。
   - **radial 中は branchLayouts を配置計算に使わない**（値は保持。orthogonal 復帰で効く）。
   - 不正（未知 direction、存在しない nodeId、同一 nodeId の重複）は **そのエントリだけ除去**して文書成功。
   - GC: ノード削除・枝移動・切り出し・統合・clipboard で ID が消える／写る経路は `relations`/`groups` と同様に prune / 閉じた写し（移動集合に閉じたエントリは remap、境界は捨てる）。統合で吸収 ID → survivor に寄せ、survivor に既存があれば吸収側を捨てる（id 昇順で残す必要は無し・nodeId キー）。
   - **rl / bt の幾何（直交のみ）**:
     - 既存エンジンは内部で `lr` 空間計算 → `tb` は軸スワップ（現行どおり）。Node の `x`/`y` は **top-left**。
     - 鏡映は **中心座標**で行い、結果を top-left に戻す（AABB の視覚鏡映になる）:
       - 中心: `cx = x + width/2`, `cy = y + height/2`
       - `rl`: サブツリーを `lr` 配置後、アンカー中心 `A=(ax,ay)`（親の中心。枝ルート自身がルートなら配置後の自中心を固定点とし配下のみ鏡映）について `cx' = 2*ax - cx`, `cy' = cy` → `x' = cx' - width/2`, `y' = cy' - height/2`。幅・高さは入れ替えない。
       - `bt`: サブツリーを `tb` 配置後、同様に `cy' = 2*ay - cy`, `cx' = cx` → top-left 復帰。
     - **枝方向混在時の親パック用 span**: 親が子を並べるとき、各子の所要サイズは **その子を根とするサブツリーを、その子に効く BranchLayoutDirection（なければ文書 treeDirection）で仮配置したときの軸平行バウンディングボックス**の、親の成長軸に直交する辺の長さ（`lr`/`rl` 親なら高さ、`tb`/`bt` 親なら幅）。仮配置の原点は子ノード中心をアンカーにした相対配置で、親パックにはこの span だけ渡し、子枝内部の最終座標は枝方向パスで上書きする。
5. **066 — 位置固定（ノード属性 `layoutPinned`）**:
   ```ts
   // Node.layoutPinned?: true  // 欠落＝非固定。false はエンコードでキー省略
   ```
   - **編集ロック `locked` とは別**。`locked` は従来どおり構造・属性編集の拒否。`layoutPinned` は auto 配置時の座標保持のみ。
   - **L-825 表（必須）**:
     | 属性 | split | merge | parentInsert |
     |------|-------|-------|--------------|
     | `layoutPinned` | `original-only`（先頭断片のみ） | `survivor-else-first`（absorb 捨て） | `none`（新親は非ピン） |
     複製・clipboard は値コピー。
   - **auto 配置契約（ピン＝局所原点）**:
     - ピン留めノードの `x`/`y` はレイアウトが変更しない。
     - 非ピンは 064/065 のアルゴリズムで動く。あるノードの **最も近いピン留め祖先**（いなければフォレスト原点／通常ルート）をアンカーにする。
     - 非ピン親が動いてもピンは追従しない（エッジは伸びてよい）。
     - **ピン回避の矩形**: 同階層でピンと非ピンが混在するとき、避け対象はピンノード単体の **ノード box**（`x,y,width,height`）ではなく、**そのピンを根とするサブツリー全体の軸平行 span**（現行 orthogonal のメトリクスと同型。ピン配下にさらにピンがあっても、そのピン固定座標を含んだ実際の外包）。非ピン兄弟は `siblingGap` を挟んでその span を避けてパックする。
     - radial 併用時もピンは固定・非ピンは上記アンカーからの放射配置。回避は弦長計算時にピンのノード box 中心角を予約角として除く（span 角は Phase 29 では近似せずノード box のみ）。
   - **ピン関与の間隔検証と `null`**:
     - 既存 `hasValidVerticalSpacing` 相当の検証で、**比較ペアの少なくとも一方が layoutPinned** ならそのペアはスキップする（ピン同士・ピンと非ピンの間隔不足では `null` にしない）。
     - 非ピン同士の間隔不足、森の索引不能、メトリクス不能は従来どおり `null` → `applyTreeChange` が木編集を棄却。
     - ピン座標が極端でも、非ピン同士が合法ならレイアウトは成功し、ピンは重なり得る（Phase 29 の割り切り）。
   - **auto 中のドラッグ分岐**:
     - **非ピン**: 既存どおり兄弟並べ替えのみ（座標ドラッグではない）。
     - **ピン**: manual と同様に **そのノードだけの座標変更**（子孫はドラッグ中は追従しない）。`locked` なら拒否。
     - ドロップ後: ピン座標を確定したまま、他ノードを 1 回再配置してよい。ジェスチャ全体（座標変更＋再配置）を **1 Undo**。
   - **即時再配置**: `layoutPinned` の付与・解除は `auto` なら設定変更と同時に 1 回リレイアウト（1 Undo）。解除直後、元ピンは非ピンとして動いてよい。
6. **操作入口（L-061・正本）**:
   | 入口 | visible | disabled / 拒否 | 関与 |
   |------|---------|------------------|------|
   | ヘッダー「レイアウト様式」直交／放射 | マップ | アウトライン／保護／競合／**manual 時 disabled（値保持）** | 文書 |
   | ヘッダー既存「ツリー方向」lr/tb | マップ・orthogonal | アウトライン／保護／競合／**manual 時 disabled（値保持・既存）**／radial 中は **disabled（値保持）** | 文書 |
   | ヘッダー「配置間隔」 | マップ（orthogonal・radial とも） | アウトライン／保護／競合／manual 時 disabled（既存） | 文書 |
   | コンテキスト「この枝の配置方向」→ lr/rl/tb/bt／「文書の既定に戻す」 | マップ・orthogonal・主選択1 | アウトライン／保護／競合／主選択 locked／radial | 主選択ノード |
   | コンテキスト／詳細パネル「位置を固定」「固定を解除」 | マップ・主選択1（複数は主選択のみ Phase29） | アウトライン／保護／競合／主選択 locked | 主選択 |
   | auto 中のピンノードドラッグ | マップ・auto・対象が layoutPinned | locked／保護／競合 | そのノード |
7. **既存操作×新状態・即時再配置**:
   - `layoutStyle` 切替: `auto` なら即再配置（1 Undo）。`manual` なら様式だけ保存（UI は disabled のため切替操作自体なし）。
   - `branchLayouts` の設定・「文書の既定に戻す」: `auto` かつ orthogonal なら即再配置（設定＋座標で 1 Undo）。radial / manual なら配列だけ更新。
   - `layoutPinned` 付与・解除: 上 §5。
   - 関連線／グループ選択中は既存 §10 どおりノード操作無効（本 Phase の入口も inventory で「無効」）。
   - アウトライン切替で非ノード選択クリア（既存）。本 Phase の文書級設定 UI はアウトラインでは非表示。
8. **Undo**: `layoutStyle`・`branchLayouts`・`layoutPinned`・様式／方向／ピン変更に伴う座標一括更新、およびピンの座標ドラッグ＋再配置を履歴に載せる（1 操作 1 Undo）。
9. **equal / 永続化**: history・conflict equal に `layoutStyle` / `branchLayouts` / ノード `layoutPinned` を含める。codec は不正エントリ除去・未知 layoutStyle は orthogonal 扱い（キー削除で文書成功）。
10. **実装順**: ①型・codec・equal・GC/複製表（`layoutPinned` の policy 含む） ②layoutPinned＋auto 尊重 ③branchLayouts（orthogonal・rl/bt） ④radial ⑤inventory・docs・ROADMAP ⑥verify。
11. **知見**: L-061, L-825, L-1061, L-203。合成名なしのため L-1085 は N/A。

## 非目標

- 自由曲線エッジ、3D、アニメーション補間の高度化、枝方向のマップ全体プリセット UI、複数選択一括ピン、放射＋枝方向の同時適用、放射の部分木サイズ比例扇、高度な衝突ソルバ。

## 検証

- orthogonal ↔ radial 切替で auto 時に再配置され、Undo で戻る。manual では様式 UI が disabled。
- 多ルート放射: ルートが等角配置され、各サブツリーが扇形に広がる。ピン留めルートは動かない。
- 枝方向 `rl`/`bt` で当該サブツリーだけ鏡映され、削除で branchLayouts が GC される。枝方向変更は auto+orthogonal で即再配置。
- ピン留めノードは auto 再配置後も座標を保ち、非ピンは動く。解除で即再配置され得る。locked ノードはピン操作・ドラッグ不可。
- auto 中: 非ピンは並べ替え、ピンは座標ドラッグ＋ドロップ後リレイアウト（1 Undo）。
- `npm run verify`。

## 未決事項

なし（推奨案採用済み。feature-spec 第1・2周の Blocking は上記へ反映済み）。
