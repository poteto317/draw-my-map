# Phase 30（一部）: OPML・CSV/TSV 交換 — 設計

- カード: [#35](https://scrum-board-jkcejsb6ka-an.a.run.app/items/35?project=5)
- ROADMAP: Phase 30 のうち **068 / 069**（1 PR）。067 / 070 / 071 は Todo 切り出し（#56 / #57 / #58）
- 日付: 2026-11-24
- ユーザー確認: 推奨案すべて採用（範囲・OPML深さ・CSV列・UI入口・非目標）
- feature-spec 第1周対応: ForestItem 拡張・取り込みガードを既存同型に修正・OPML 祖先閉包を CSV と同型に固定
- feature-spec 第2周対応: 検証を §9 に合わせる・入口を OutlineImport 実挙動（アウトラインでも表示）に固定

## 決めたこと

1. **範囲**: 候補 **068（OPML 入出力）** と **069（CSV/TSV 入出力）** を **1 PR** で実装する。
2. **非目標（本 PR）**: 067 PDF／印刷、070 他マインドマップ形式、071 単体 HTML。かんばん Todo: [#56](https://scrum-board-jkcejsb6ka-an.a.run.app/items/56?project=5)、[#57](https://scrum-board-jkcejsb6ka-an.a.run.app/items/57?project=5)、[#58](https://scrum-board-jkcejsb6ka-an.a.run.app/items/58?project=5)。ROADMAP の当該チェックは未完了のまま。
3. **版・永続化**: MapDocument V3 のスキーマは変えない。交換はダウンロード／ファイル取り込みのみ（localStorage キー追加なし）。
4. **書き出し対象**: 既存 `ExportScope`（全件／表示中／選択）を OPML・CSV/TSV でも共有する。選択が空で「選択」のときは既存 JSON／画像と同型の拒否または無効（現行 `resolveExportNodes` に揃える）。
5. **部分集合の親子（OPML・CSV 共通）**: 表示中／選択の書き出しでは、対象 ID の **祖先を閉包**してから森／表を作る（全件はそのまま）。集合外親を空にする `normalizeExportForestParents` 方式は使わない（親子を保つ）。
6. **取り込みペイロードと挿入 API**:
   - `ForestItem` を後方互換で拡張する: `{ label; parentIndex; importance?; note?; tags? }`（欠落時は現行どおり既定 importance・属性なし）。
   - `insertNodeForest`（および必要なら呼び出し側）がこれらの任意フィールドを新規ノードへ載せる。アウトライン取り込みは従来どおり label＋階層のみ渡せば振る舞い不変。
   - OPML／CSV 取り込みはこの拡張経路を使う（挿入後の手書き属性付与に頼らない）。
7. **OPML（068）**:
   - 出力: 閉包後の森を OPML 2.0 互換にする。`<outline text="…">`＝`label`。`note` があるときだけ **`_note` 属性**に載せる（要素は書かない。読取は属性優先、要素があればフォールバック可）。
   - 入力: ファイル（`.opml` / `.xml`）。`text`→`label`、`_note`→`note`。tags／links／座標／layout／locked 等は **読み書きしない**（lossy を仕様・UI に明記）。
   - 追加先: 「新しいルート（森）」または「主選択の子」。auto なら再配置。1 操作 1 Undo。
   - 不正／空はダイアログ拒否、マップ非変更。
8. **CSV/TSV（069）**:
   - 固定列（ヘッダ必須）: `id`, `parentId`, `label`, `importance`, `note`, `tags`
   - `tags` は `;` 区切り。空は欠落。`importance` 不明値は **`medium` へフォールバック**し、プレビューに警告行を出す（行スキップしない）。
   - 書き出し: §5 の祖先閉包後に表化。
   - 読み込み: `.csv`／`.tsv`。区切りは拡張子既定（`.tsv`→タブ、`.csv`→カンマ）またはダイアログ上書き。RFC4180 風クォート。
   - ファイル内 `id`／`parentId` は親子解決のみ。マップ載せ時は **新規採番**。座標は `insertNodeForest` 規則。
   - 未知列は無視（既存属性のみ）。
9. **UI（L-061・正本）**:
   | 入口 | visible | disabled / 拒否 | 関与 |
   |------|---------|------------------|------|
   | ヘッダー「取り込み」→ OPML / CSV・TSV | **マップ・アウトライン**（`OutlineImportControl` と同位置・同可視） | 保護・競合では **押せる**（箇条書き追加と同型）。関連線／グループ選択中の扱いは OutlineImport と同一。ラベル編集中は既存どおり確定してから開く | 文書（追加） |
   | ヘッダー書き出し群へ OPML・CSV・TSV | **マップ・アウトライン**（既存 PNG/JSON/MD 書き出し群と同じ可視条件） | 既存 ExportScope／書き出しと同則（選択空など）。保護中も可 | 文書 |
   | コマンドパレット | 本 PR **非必須** | — | — |
   - ダイアログ: ファイル選択 → プレビュー（件数・警告）→ 確定（OutlineImport 二段に寄せる）。
10. **Undo**: 取り込み成功は 1 Undo。書き出しは履歴に載せない。
11. **実装順**: ① `ForestItem`／`insertNodeForest` 拡張＋RED ② OPML/CSV codec ③ export（閉包＋download） ④ import UI ⑤ inventory・docs・ROADMAP（068/069 のみ） ⑥ verify。
12. **知見**: L-061、L-203、L-825。L-1085 N/A。

## 非目標

- PDF／印刷、Freemind／XMind 等、単体 HTML、カスタム属性列、OPML への座標・イラスト埋め込み、コマンドパレット必須化。

## 検証

- OPML 往復で階層と label／note が保たれ、tags は落ちる（lossy 明示）。
- CSV/TSV 書き出し→読み込みで label／importance／note／tags／親子が再現され、ID は採番し直される。
- ExportScope 全件／表示中／選択が効く（表示中・選択は祖先閉包）。空選択は既存と同則。
- 取り込みは保護・競合でも開ける（OutlineImport 同型）。アウトライン表示でも入口が見える。
- `npm run verify`。

## 未決事項

なし（推奨案採用済み。feature-spec 第1・2周 Blocking は上記へ反映済み）。
