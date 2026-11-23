# Phase 26（前半）: アイコン・任意画像・ノード種別 — 設計

- カード: [#31](https://scrum-board-jkcejsb6ka-an.a.run.app/items/31?project=5)（Phase 26 全体）
- ROADMAP: Phase 26 のうち **候補 051 / 052 / 055**（**074 ファイル添付は本 PR 対象外・後続**）
- 日付: 2026-11-23

## 決めたこと

1. **範囲**: カードは Phase 26 全体だが、1 PR に収めるため **051・052・055 のみ**実装する。074 は ROADMAP を未完了のまま残し、別 `/feature` で設計する（L-825 属性・容量が独立のため）。
2. **アイコン・絵文字（051）**: 任意属性 `icon?: string`。
   - **受理**: `Intl.Segmenter("ja", { granularity: "grapheme" })` で **書記素ちょうど 1 つ**、かつその書記素のコードポイント数が **1〜16**（ZWJ / 異体セレクタ結合可）。
   - **拒否（キー削除）**: 書記素 0 個・2 個以上、CP 数 0 または 17 超、**絵文字でも記号でもない latín 等の「通常文字 1 書記素」も含め、Extended_Pictographic を含まない書記素**（実装は `/\p{Extended_Pictographic}/u` を書記素内に含むかで判定。含まなければ削除）。
   - 欠落＝無し。キャンバス・アウトライン・PNG/SVG でラベル左に表示（約 16px）。
3. **任意画像の添付（052）**: **新属性なし**。既存 `illustration` へファイル選択アップロードを追加。AI 生成・添付・削除は同一キー（上書き時は確認ダイアログ）。サムネイルは既存パイプライン。上限は既存どおり **data URL 文字列の `.length` ≤ `MAX_ILLUSTRATION_DATA_URL_LENGTH`（100_000）**（illustration はバイト判定にしない）。
4. **ノード種別（055）**: 任意属性 `kind?: NodeKind`。`NodeKind = "question" | "conclusion" | "evidence" | "idea"`。欠落＝種別なし。表示は **左端色バー 4px**（question=青 / conclusion=緑 / evidence=橙 / idea=紫。CSS 変数。glow なし）。
5. **ポリシー（L-825）**: `icon` / `kind` は `split: original-only`, `merge: survivor-else-first`, `parentInsert: none`。`illustration` は既存のまま。
6. **編集ロック（L-061）**: アイコン・種別・画像添付／削除／生成は `assertNodesEditable`。入口は末尾表。
7. **Undo**: 各操作 1 履歴（`applyNonStructuralChange`。戻り `null`＝無操作）。
8. **UI**: 主選択ちょうど 1・マップ・非保護で右パネルに「見た目」（icon・kind）。画像アップロードは `IllustrationPanel` に「画像を添付」。アウトライン行にも icon と kind バーを反映。
9. **実装順**: ①型・永続化・policy ②icon/kind 描画＋UI ③illustration アップロード ④features / data-model / overview 等 grep 同期（L-203）⑤ROADMAP（051/052/055 のみ完了、074 残、現在地更新）。

## 非目標

- **ファイル添付（074）**（本 PR 外）。
- カスタムアイコン画像セット、クラウド同期。
- `illustration` と別の装飾画像二枚持ち。
- kind による検索フィルタ・LOD 連携。
- 複数選択への一括変更。
- キャンバス上の「資料あり」クリップ印（074 向け。本 PR では出さない）。

## 背景と現状

- `illustration` は JPEG data URL。アップロード UI は未実装。
- 任意属性は `NODE_ATTRIBUTE_POLICY`（L-825）。

## 要件

### icon

- UI: よく使う絵文字チップ＋入力。クリアでキー削除。入力が受理条件外ならエラー表示して反映しない（保存文書を壊さない）。
- decode: 受理条件外は **キー削除**（文書は ok）。
- encode: 欠落時キー省略。

### illustration アップロード

- `accept="image/*"` → サムネイル → `attachIllustration`。
- 既存 illustration あり → 置き換え確認。
- 高さ・decode 規則は既存のまま。

### kind

- UI: 「なし / 疑問 / 結論 / 根拠 / アイデア」。
- decode: 許可外はキー削除。
- 検索一覧はプレーン（種別表示なし）。

## アーキテクチャ

```
types/node.ts              icon?, kind?
types/nodeKind.ts          NodeKind + bar colors
domain/nodes/nodeIcon.ts   segmenter 受理・normalize
domain/nodes/nodeKindUpdate.ts   normalize
domain/persistence/        mapDocumentNodeIcon.ts / mapDocumentNodeKind.ts
components/layout/         NodeAppearanceSection
IllustrationPanel          + file input
pixi/renderMapNodes        icon + kind bar
outline/OutlineEditor      icon + kind
```

## 操作入口インベントリ（L-061）

| 入口 | 拒否／無効条件 |
|------|----------------|
| `IllustrationPanel` 添付・削除・生成 | 主選択≠1、locked、保護モード |
| `NodeAppearanceSection` icon / kind | 同上 |
| `useNodes` setters | locked → `null` |

Phase25 lock-inventory に「見た目（icon/kind/illustration アップロード）」行を追記。

## 知見

- **L-825 / L-203**: policy・SAMPLE・投影・履歴／競合・clipboard。docs は `illustration` / `OptionalNodeKey` / `areNodesEqual` 等で **リポジトリ全体を grep** し、`features.md`・`data-model.md`・`overview.md`・`api.md` など列挙箇所を同期。
- **L-061**: 上表＋ editLock 統合テスト。
- **L-836**: icon は正規化後の受理条件。illustration は既存 length。074 は後続で name / dataUrl 上限を別設計。
- **L-133**: 本 PR の illustration / icon は文字列 length / 書記素判定。File.size はアップロード入口の事前チェックにのみ使う（任意）。
- **L-1061**: 単一ノード非構造属性のみ。

## 検証

- 単体: icon 受理／拒否、kind normalize、policy、locked、アップロード経路。
- `cd client && npm run verify`。

## 未決事項

なし（推奨案を採用。074 は後続と明記）。
