# Phase 13: 箇条書きからマップを作成 Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスクを1つずつ実装し、別担当の仕様・品質レビュー後に次へ進む。インライン実装はユーザーの明示指示時のみ。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。

**Goal:** ROADMAP Phase 13の4項目を実装し、インデント付きの箇条書きテキストをダイアログでプレビューしてから、新しいルート（森）または選択中のノードの子として、1回の Undo / Redo で戻せる1操作でマップへ追加できるようにする。
**Architecture:** 解析とプレビュー用の木は純関数（`client/src/domain/outline/`）で、段階（上限・行の分割・ラベル・階層・合成・プレビュー・文言）ごとにモジュールを分ける。森の挿入は純関数 `insertNodeForest`（`domain/nodes/nodeForestInsertion.ts`）で、手動配置の共通の規則は `domain/nodes/nodeManualPlacement.ts` に切り出して既存の複製・貼り付け・子の追加と共有する。`useNodes.insertForest` が `applyTreeChange` を1回だけ呼び、`useOutlineImport` がダイアログの状態・操作・成功の通知を持つ。`MapEditor` がヘッダーのボタン、ダイアログ（根の兄弟）、7系統目の通知、`editorShortcutsEnabled` を配線する。
**Tech Stack:** TypeScript、React 19、Next.js 16、Jest、Testing Library。追加依存なし。
**Spec:** `docs/superpowers/specs/2026-10-22-phase13-outline-import-design.md`

## Global Constraints

- 新規依存なし。`Node`、`NodeMapState`、V3 の保存形式、JSON の形式、履歴の形式を変えない。追加するノードの重要度はすべて `DEFAULT_NODE_IMPORTANCE`（`"medium"`）、イラストは無し、寸法は幅100・高さ60（`RECT_WIDTH`・`RECT_HEIGHT`）。
- 境界: 解析・プレビュー用の木の構築は純関数（`domain/outline/`）、森の挿入は純関数（`domain/nodes/nodeForestInsertion.ts`）、状態と操作の順序は React フック、表示と操作は部品。解析は段階ごとにモジュールを分け、段階ごとに単体テストを付ける（L-325）。`domain/nodes` から `domain/outline` を import しない（`OutlineItem` は `ForestItem` の形を満たすので、フックがそのまま渡す）。
- 解析の結果と挿入の結果は判別共用体で返し、呼び出し元は成功したときだけ状態更新・通知・後続処理を行う（L-001）。共用体の分岐は `switch` で網羅し、`default` で新しいメンバーを既定の分岐へ流さない（網羅は `const unreachable: never = value;` で型検査する。L-233）。
- 上限は費用の安い順に、費用のかかる処理の前に判定する（文字数 → 行の分割と行数 → ラベルの取り出し → 階層。L-443）。上限の定数: `OUTLINE_MAX_TEXT_LENGTH = 1_000_000`（UTF-16 コード単位、`text.length`。BOM と改行を含む。L-133: バイト数ではなく、クリップボードと同じ単位であることをコメントに書く）、`OUTLINE_MAX_ITEMS = 10_000`（空行でない行の数。記号だけの行は数える）、`OUTLINE_LONG_LABEL_THRESHOLD = 200`（コードポイント数）。ちょうどは受け付け、1つ超えは拒否する（L-182）。`MAX_SUBTREE_CLIPBOARD_NODES` と同じ値であることはテストで確かめない。
- 大きな配列に `Math.max(...arr)` や `push(...arr)` を使わない（L-529）。計算量は入力の大きさに比例させ、時間ではなく操作・読み取りの回数を数えるテストで固定する（L-431）。正規表現は先頭への固定（`^`）だけを使い、後戻りが爆発する形を使わない。
- ノードの ID は1回の `allocateIds` でまとめて採番し、失敗しうる検査（親の存在、項目の形、座標の計算と有限性）をすべて済ませてから呼ぶ（L-432）。確定しなかった ID は欠番のままにし、allocator を巻き戻さない。
- 履歴: 取り込み全体（全ノードの追加と、自動配置での既存ノードの再配置）を `applyTreeChange` の1回の commit にする（L-063）。`documentRevision` は増やさない。
- 文言は設計書の「警告の種類と件数」「上限」「通知の文言」の表をそのまま使い、数値は `toLocaleString("en-US")` で桁区切りを付け、上限の数値は定数から組み立てる。
- 新しい props とコールバックと引数は必須にする（省略可能な引数と既定値を足さない。例外は設計書が既定値を決めている純関数 `buildOutlinePreview(outline, maxItems = OUTLINE_PREVIEW_MAX_ITEMS)` だけ）。実際の `Home` から `MapEditor`、ヘッダー、ダイアログまで通す結合テストで配線を確かめる（L-060）。
- 対象外（作らない）: 貼り付け（Ctrl/Cmd+V）の内容の自動判定、取り込み専用のショートカット、ファイルからの読み込み、Markdown の見出し・チェックボックス・引用・コードブロックの特別な扱い、記法による重要度・イラスト・折りたたみの指定、マップから箇条書きへの書き出し、マップ全体のノード数の上限、`createSiblingNode` の変更。
- 実装は `.worktrees/codex/phase13-outline-import` の `codex/phase13-outline-import` ブランチで行う。タスク単位のサブエージェント実装、別担当の仕様・品質レビュー、TDD（先にテストを書いて RED を確かめる）、各タスクの最後に `cd client && npm run verify` を必須とする。途中のタスクでも verify が通る状態で終える。
- コミット・push・PR 作成は依頼時のみ。依頼された場合のメッセージは Conventional Commits（例: `feat(outline): ...`、`refactor(nodes): ...`、`test(outline): ...`、`docs(outline): ...`）にする。最後のタスクで `ROADMAP.md` を実態に合わせて更新する。

## Review Focus

- 解析の正しさ: 設計書の例の表（1〜25）がすべて `parseOutlineText` のテストにあり（段階ごとのテストは「設計書の例の表（1〜25）の写し方」のとおり関係する列だけ）、表の木と警告に一致する。`W` の決定（最も多い増分、同数なら先に現れた値）、「一致・深い・揃える」の3つの場合、揃えた段の `values` への追加、警告が不揃いな行にだけ出ること（Task 3/4）。
- 空行の判定の一本化: 行数の上限と、ラベルの取り出しが同じ `isBlankOutlineRest`（その中の `normalizeOutlineRest`）を使う。行数の超過で `extractOutlineLabel` が呼ばれない（Task 1/2/4。L-136、L-443）。
- 計算量: 10,000段の鎖と10,000件の兄弟で、`levels` の操作回数と、挿入での配列の読み取り回数が入力の定数倍以内。スプレッドを使わない（Task 3/6/7。L-431、L-529）。
- 採番と失敗: `allocateIds` は検査の後に1回だけ。親が無い・不正な項目・座標の失敗では呼ばれず、ノード・選択・履歴・Redo が変わらない（Task 7/8。L-432、L-001）。
- 1回の commit: 1回の Undo で取り込んだノードがすべて消え、自動配置で動いた既存ノードも戻る。Redo で同じ ID・座標で戻る（Task 8/15。L-063）。
- 親が無くなった場合: 開いた時点の `documentRevision` から変わっていれば、同じ ID のノードがあっても `parent-missing` で、`insertForest` を呼ばない（Task 9/14/15。L-037）。
- 入口の停止: `editorShortcutsEnabled` を根の `inert`、`useMapHistoryShortcuts`、`MapStage` のすべてに渡す。ダイアログは根の兄弟（Task 14/15。L-061、L-173）。
- 通知: 成功は操作通知バーの7系統目（`useRevisionScopedNotice`）、失敗はダイアログ内。同じ結果を2か所に出さない（Task 9/13/14。L-249）。入力のエラーは常設の `role="alert"` に `useReannouncedNotice` で入れ直す（Task 12。L-153、L-166）。
- 押し続けとダブルクリック: ヘッダーのボタン・入力欄の Enter・「プレビュー」・「マップに追加」の `repeat`、「マップに追加」の `detail > 1`（Task 10/11/12/15。L-408、L-150）。

## ファイル構成

| ファイル | 責務 | 作成・変更タスク |
| :--- | :--- | :--- |
| `client/src/domain/outline/outlineLimits.ts` | 上限の定数と、解析前の判定（文字数・行数） | 1 |
| `client/src/domain/outline/outlineLines.ts` | BOM の除去、行の分割、インデントの測定、空行の判定、空行でない行の一覧 | 1 |
| `client/src/domain/outline/outlineLabel.ts` | 記号・番号の除去とラベルの分類 `extractOutlineLabel` | 2 |
| `client/src/domain/outline/outlineHierarchy.ts` | 標準の1段の幅 `W` の決定と、階層の決定・補正 | 3 |
| `client/src/domain/outline/outlineParser.ts` | 段階の合成 `parseOutlineText`、結果の型、警告の集計 | 4 |
| `client/src/domain/outline/outlinePreview.ts` | プレビュー用の木（上限付き）と表示用ラベル | 5 |
| `client/src/domain/outline/outlineMessages.ts` | 警告・エラー・要約・通知の文言 | 5, 9 |
| `client/src/domain/nodes/nodeManualPlacement.ts` | 手動配置の共通の規則（`calculateManualOffsetY`、`calculateChildPlacement`） | 6 |
| `client/src/domain/nodes/nodeSubtreeInsertion.ts` | `calculateManualOffsetY` を共通のモジュールから使う | 6 |
| `client/src/domain/nodes/nodePlacement.ts` | `createChildNode` が `calculateChildPlacement` を使う | 6 |
| `client/src/domain/nodes/nodeForestInsertion.ts` | 森の挿入 `insertNodeForest` | 7 |
| `client/src/hooks/useNodes.ts` | `insertForest` | 8 |
| `client/src/hooks/useOutlineImport.ts` | ダイアログの状態と操作、成功の通知 | 9 |
| `client/src/components/layout/OutlineImportControl.tsx` | ヘッダーの「箇条書きから追加」ボタン | 10 |
| `client/src/components/layout/OutlinePreviewTree.tsx` | プレビューの入れ子の `<ul>` | 11 |
| `client/src/components/layout/OutlineImportPreviewScreen.tsx` | プレビューの画面 | 11 |
| `client/src/components/layout/OutlineImportInputScreen.tsx` | テキスト入力の画面 | 12 |
| `client/src/components/layout/OutlineImportDialog.tsx` | ダイアログの枠、画面の切り替え、フォーカス、ダイアログ内の通知 | 13 |
| `client/src/components/map/MapEditor.tsx` | 配線（ボタン、ダイアログ、7系統目の通知、`editorShortcutsEnabled`、戻し先のフォーカス） | 14 |
| `client/src/app/__tests__/pageOutlineImport.test.tsx` | 実際の `Home` からの流れ・追加先・Undo / Redo・失敗の結合テスト | 15 |
| `client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx` | ショートカットの停止・キーボード・フォーカス・押し続け・ダブルクリックの結合テスト | 15 |
| `docs/specifications/features.md` ほか文書 | 仕様・構成・手動テストの更新 | 16 |
| `ROADMAP.md` | Phase 13 の完了、現在地、最終更新 | 17 |

テストは各ソースと同じ階層の `__tests__/` に置く（例: `client/src/domain/outline/__tests__/outlineLines.test.ts`）。

## 既存のテストへの影響と対処するタスク

| 影響 | 内容 | 対処するタスク |
| :--- | :--- | :--- |
| `calculateManualOffsetY` の移動 | `nodeSubtreeInsertion.ts` の非公開関数を `nodeManualPlacement.ts` へ移す。`nodeSubtreeInsertion.test.ts`、`nodeSubtreeDuplication.test.ts`、`useNodesDuplication.test.ts`、`useNodesClipboard.test.ts` は変更なしで通ること | 6 |
| `createChildNode` の位置の計算 | `calculateChildPlacement` に切り出し、スプレッドをループに置き換える。`nodePlacement.test.ts`、`useNodes.test.ts`、`useNodesAutoLayout.test.ts` は変更なしで通ること | 6 |
| `MapEditor` の通知の系統数 | `operationNotices` の「すべて `null` なら `null`」の条件に、取り込みの通知（7系統目）を足さないと通知が表示されない。`page.test.tsx` の `queryOperationNoticeWrapper()` が `null` を期待するテスト（通知が無いときは `operation-notices` が無い）は、取り込みの通知が無い限りそのまま通ること | 14 |
| 操作のボタンの並び | `operationControls` の中で、クリップボードの案内の後、「JSON書き出し」（`MapPersistenceControls`）の前に「箇条書きから追加」を置く。`AppHeader.test.tsx` は `AppHeader` を変えないので影響なし。並びは `MapEditor.test.tsx` に新しいテストで固定する | 14 |
| ヘッダーの `getByRole` | 新しいボタン「箇条書きから追加」が、既存のテストの正規表現の名前（`name: /…/`）に一致しないこと。Task 14 で `grep -rn 'name: /' client/src/app/__tests__ client/src/components/map/__tests__` を実行し、「追加」「箇条」「から」を含む正規表現があれば、文字列の完全一致に直す（計画作成時点では一致なし） | 14 |
| `role="status"`・`role="alert"` | ダイアログの常設のライブリージョンは、ダイアログを開いている間だけ描画する（`MapEditor` の根の外）。既存のページのテストはダイアログを開かないので、`within(screen.getByRole("banner"))` で絞った既存の検索は影響を受けない。新しい結合テストでは `within(screen.getByRole("dialog"))` で絞る | 13, 15 |
| `MapEditor` の根 | `MapEditor` がフラグメントを返すようになる（根の `<div data-map-id>` とダイアログが兄弟）。`MapEditor.test.tsx` と `pageMapLibraryDialog.test.tsx` の `editorRoot()` は `[data-map-id]` と `closest` で根を探すので、そのまま通ること。ダイアログに `data-map-id` を付けない | 14 |
| 文書の「6系統」 | `features.md` の 11.4 の「6系統」の記述 | 16 |

## 設計書の例の表（1〜25）の写し方

全25例を `parseOutlineText` のテスト（Task 4）に1例1テストで写すことを完了条件にする。段階ごとの関数のテストは、その段階に関係する列（入力の一部、中間の値）だけを、関係する例について写す。

| 段階（タスク） | 写す例 | 確かめる列 |
| :--- | :--- | :--- |
| 行の分割・インデントの測定・空行（Task 1） | 2、3、12、13、15、23 | 空行でない行の数と行番号、`tabs`・`spaces`、空行を除くこと、行数の数え方（例23） |
| ラベルの取り出し（Task 2） | 1、4、5、6、7、16、19、20 | 各行の `rest` に対する分類（`label`・`marker-only`・`blank`）とラベル |
| 階層（Task 3） | 1、2、3、4、8、9、10、11、14、18、21、22 | `W`、各行の深さと親、`depth-adjusted` の行番号（取り込む行の `tabs`・`spaces` を直接渡す） |
| 合成（Task 4） | 1〜25 のすべて | 表の木・ルート数・ノード数・警告・エラー |

## 進め方

開始前に `git status` と worktree を確認し、既存のユーザー変更を reset しない。各タスクは「テスト追加 → 対象テストの RED を確認 → 実装 → 対象テストの GREEN → `cd client && npm run verify`」の順で進め、別のサブエージェントで仕様・品質を確認する。テストのコマンドは `client` ディレクトリで実行する。ファイルのパスはリポジトリ相対。テストの期待値は実装の定数を import せずリテラルで書く（例: `"1,000,000"`、`200`。L-167）。テストを書いた後、主要な分岐を1つずつ外す変異（条件の反転、別の値への置換、呼び出しの削除）を当てて失敗することを確かめ、結果をタスクの報告に書く（L-167）。

`␣` は半角スペース、`□` は全角スペース（`　`）、`→` はタブ（`\t`）を表す。テストのコードでは実際の文字（`" "`、`"　"`、`"\t"`）で書く。

---

### Task 1: 上限・行の分割・空行の判定

**Files**
- Create: `client/src/domain/outline/outlineLimits.ts`、`client/src/domain/outline/__tests__/outlineLimits.test.ts`
- Create: `client/src/domain/outline/outlineLines.ts`、`client/src/domain/outline/__tests__/outlineLines.test.ts`

**Interfaces**
- Produces（`outlineLimits.ts`）:
  ```ts
  export const OUTLINE_MAX_TEXT_LENGTH = 1_000_000;   // UTF-16 コード単位（text.length）
  export const OUTLINE_MAX_ITEMS = 10_000;            // 空行でない行の数
  export const OUTLINE_LONG_LABEL_THRESHOLD = 200;    // コードポイント数
  export function isOutlineTextTooLong(text: string): boolean;        // text.length > OUTLINE_MAX_TEXT_LENGTH。O(1)
  export function isOutlineLineCountTooLarge(count: number): boolean; // count > OUTLINE_MAX_ITEMS
  ```
  - 設計書の `checkOutlineTextLimits` は、文字数（分割の前に判定）と行数（分割の後に判定）で判定の時点が違うため、この2つの関数に分ける。どちらも解析（Task 4）が順に呼ぶ。
- Produces（`outlineLines.ts`）:
  ```ts
  export type OutlineRawLine = {
    lineNumber: number; // 1 始まり。分割の結果の行番号（空行も数える）
    tabs: number;       // 行頭のタブの数 T
    spaces: number;     // 行頭の空白の幅 S（半角スペースの数 + 全角スペースの数 × 2）
    rest: string;       // インデントの後の残り（未加工）
  };
  export function stripOutlineBom(text: string): string;          // 先頭の1文字が U+FEFF のときだけ取り除く
  export function splitOutlineText(text: string): string[];       // /\r\n|\r|\n/ で分割
  export function measureOutlineIndent(line: string): { tabs: number; spaces: number; rest: string };
  export function normalizeOutlineRest(rest: string): string;     // 制御文字（U+0000〜U+001F、U+007F）を半角空白へ置き換えて trim
  export function isBlankOutlineRest(rest: string): boolean;      // normalizeOutlineRest(rest) === ""
  export function splitOutlineLines(text: string): OutlineRawLine[]; // BOM 除去 → 分割 → 測定 → 空行を除く（入力の順）
  ```
  - 行数の上限は `splitOutlineLines(text).length` で数える（記号だけの行は含み、空白・制御文字だけの行は含まない）。空行の判定はこの `isBlankOutlineRest` の1か所だけで行い、Task 2 の `extractOutlineLabel` も `normalizeOutlineRest` を使う（L-136）。
  - 入力の文字列は書き戻さないので、改行コードを保たない（L-013 の対象外であることを `splitOutlineText` のコメントに書く）。

- [ ] `outlineLimits.test.ts` を書く（L-182）。
  - `isOutlineTextTooLong`: `"a".repeat(1_000_000)` → `false`、`"a".repeat(1_000_001)` → `true`。`"😀".repeat(500_000)`（コード単位で1,000,000）→ `false`、`"😀".repeat(500_000) + "a"` → `true`（コードポイントではなくコード単位で数えること）。
  - `isOutlineLineCountTooLarge`: `10_000` → `false`、`10_001` → `true`、`0` → `false`。
- [ ] `outlineLines.test.ts` を書く（L-138、L-167）。「設計書の例の表（1〜25）の写し方」の Task 1 の行（例 2、3、12、13、15、23）を、`describe("設計書の例")` の中に、空行でない行の数・行番号・`tabs`・`spaces` の列だけ写す。
  - `splitOutlineText`: `"A\r\nB\rC\nD"` → `["A","B","C","D"]`（`\r\n` を1つの改行と数え、空行を作らない）。`"A\r\n\r\nB"` → `["A","","B"]`。`"A B C\u0085D"` → 1要素（U+2028・U+2029・U+0085 で分割しない）。`"A\n"` → `["A",""]`。少数派の改行の行が1つだけある入力 `"A\nB\nC\rD"` → `["A","B","C","D"]`（多数派の改行で分割する変異や `split("\n")` への変異で落ちる）。
  - `stripOutlineBom`: `"﻿A"` → `"A"`、`"A﻿"` → 変えない、`"﻿﻿A"` → `"﻿A"`（1文字だけ）。
  - `measureOutlineIndent`: `"\t\tA"` → `{ tabs: 2, spaces: 0, rest: "A" }`、`"  A"` → `{ tabs: 0, spaces: 2 }`、`"　　A"` → `spaces: 4`、`" \t　 A"` → `{ tabs: 1, spaces: 4 }`（順序によらず合計）、`" A"` → `{ tabs: 0, spaces: 0, rest: " A" }`（ノーブレークスペースは数えない）、`"   "` → `{ spaces: 3, rest: "" }`。
  - `normalizeOutlineRest`・`isBlankOutlineRest`: `"A\tB"` → `"A B"`、`"C\u0007D"` → `"C D"`、`"\u007F"` → 空、`"\u0007"` → 空行、`"　"` → 空行（trim で消える）、`"​"` → 空行ではない（L-602）、`"-"` → 空行ではない。
  - `splitOutlineLines`: `"A\n\n   \n  B"` → 2行（行番号 1 と 4、B は `spaces: 2`）。`"﻿  A\n    B"` → 1行目が `spaces: 2, rest: "A"`（BOM が先に除かれ、インデントの測定がずれない）。`"A\n"` → 1行（末尾の空行を無視）。`""` → `[]`。
  - 計算量（L-431）: `"A\n".repeat(10_000)` で `splitOutlineLines` の結果が10,000行。時間は測らない。
- [ ] RED: `npm test -- --runInBand outlineLimits.test.ts outlineLines.test.ts`（モジュールが無いため失敗）。
- [ ] 実装する。インデントの測定は先頭からの1回の走査（`for` ループ）で行い、正規表現の繰り返しを使わない。制御文字の置き換えは `/[\u0000-\u001F\u007F]/g`。
- [ ] GREEN: 同じコマンド。続けて `cd client && npm run verify`。
- 知見: L-013、L-133、L-136、L-138、L-167、L-182、L-325、L-443、L-602。
- 完了条件: 2ファイルの全ケースが通り、verify が成功する。既存のコードは変えていない。

### Task 2: ラベルの取り出し（記号と番号の除去）

**Files**
- Create: `client/src/domain/outline/outlineLabel.ts`、`client/src/domain/outline/__tests__/outlineLabel.test.ts`

**Interfaces**
- Consumes: Task 1 の `normalizeOutlineRest`。
- Produces:
  ```ts
  export type OutlineLabelResult =
    | { kind: "label"; label: string }   // 空でないラベル
    | { kind: "marker-only" }            // 記号を取り除くと空になる行
    | { kind: "blank" };                 // 手順1・2で空になる行（空行）
  export function extractOutlineLabel(rest: string): OutlineLabelResult;
  ```
  - 手順は設計書の「記号と番号の除去」の1〜5。手順1・2は `normalizeOutlineRest`。手順3は上から順に最初に当てはまった1つだけ: `・`（U+30FB）・`•`（U+2022）は後ろによらず、`-`・`*`・`+` は後ろが `\s` か行末のとき、番号は `/^[0-9]{1,9}[.)](?=\s|$)/`。手順4で再び `trim`。

- [ ] `outlineLabel.test.ts` を書く（`it.each` で入力と期待値をリテラルで並べる。L-167）。「設計書の例の表（1〜25）の写し方」の Task 2 の行（例 1、4、5、6、7、16、19、20）を、各行の `rest` に対する分類とラベルの列だけ写す。
  - 取り除く: `"- 果物"` → `"果物"`、`"* a"` → `"a"`、`"+ a"` → `"a"`、`"・朝"` → `"朝"`、`"•昼"` → `"昼"`、`"・ 朝"` → `"朝"`、`"1. 準備"` → `"準備"`、`"2) 実行"` → `"実行"`、`"123456789. a"` → `"a"`（9桁）、`"-　a"` → `"a"`（全角スペースも `\s`）、`"- 1. 手順"` → `"1. 手順"`（1つだけ）、`"・- a"` → `"- a"`。
  - 取り除かない: `"-5度"`、`"+1"`、`"*注意*"`、`"-項目"`、`"3.14"`、`"1.5倍"`、`"2026.10"`、`"1234567890. a"`（10桁）、`"１．全角"`、`"①丸"`、`"(1) 括弧"`、`"◦ a"`、`"■ a"`、`"○ a"`、`"‣ a"`、`"# 見出し"`、`"- [ ] タスク"` → `"[ ] タスク"`、`"> 引用"`。それぞれ `{ kind: "label", label: 入力のまま }`（最後の2つは記号を1つ除いた値・そのまま）。
  - 記号だけ: `"-"`、`"*"`、`"+"`、`"・"`、`"•"`、`"1."`、`"12)"`、`"-   "` → `marker-only`。
  - 空行: `""`、`"   "`、`"\u0007"` → `blank`。
  - 制御文字と前後の空白: `"A\tB"` → `"A B"`、`"  - a  "` → `"a"`、`"-\ta"` → `"a"`（タブが空白に置き換わってから記号の判定）、`"​"` → `{ kind: "label", label: "​" }`（L-602）。
  - `normalizeOutlineRest` を使っていること: `jest.mock` で `outlineLines` の `normalizeOutlineRest` を `requireActual` を呼ぶ spy にし、`extractOutlineLabel("a")` で1回呼ばれることを確かめる（L-136）。
- [ ] RED: `npm test -- --runInBand outlineLabel.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-136、L-167、L-325、L-602。
- 完了条件: 上の全ケースが通る。手順の順序（制御文字 → trim → 記号1つ → trim）がコードの上でも1か所にまとまっている。

### Task 3: 階層の決定と補正

**Files**
- Create: `client/src/domain/outline/outlineHierarchy.ts`、`client/src/domain/outline/__tests__/outlineHierarchy.test.ts`

**Interfaces**
- Produces:
  ```ts
  export type OutlineIndentedLine = { lineNumber: number; tabs: number; spaces: number }; // 取り込む行だけ（入力の順）
  export function determineOutlineUnitWidth(lines: readonly OutlineIndentedLine[]): number;
  export type OutlineDepthAssignment = {
    depths: number[];                 // lines と同じ長さ
    parentIndexes: (number | null)[]; // lines の添字。depth 0 は null
    adjustedLineNumbers: number[];    // 補正の警告の対象の行番号（全件、入力の順）
    levelOperationCount: number;      // levels の操作（末尾の参照・取り除く・積む・values への追加・親の参照）の回数。計算量のテスト用
  };
  export function assignOutlineDepths(lines: readonly OutlineIndentedLine[], unitWidth: number): OutlineDepthAssignment;
  ```
  - `determineOutlineUnitWidth`: 隣り合う2行の `spaces` の正の増分を数え、最も多い値（同数なら先に現れた値）。増分が無ければ1。`Map` で1回の走査（L-431）。
  - `assignOutlineDepths`: `v = tabs × W + spaces`。設計書の「階層の補正」の手順と表（一致・深い・揃える）どおり。`levels[d]` は `{ values: Set<number>; min; max; lastV; lastIndex }`。警告は「深い」で `v − top.lastV !== W` のとき、「揃える」で常に1件。最初の行は深さ0で警告しない。`lines` が空なら空の結果。
  - `OutlineDepthAssignment` と `OutlineIndentedLine` は `domain/outline` の中の受け渡しだけに使い、`domain/outline` の外から import しない。

- [ ] `outlineHierarchy.test.ts` を書く。行は補助関数 `lines([[tabs, spaces], ...])`（行番号は1から連番）で作る。「設計書の例の表（1〜25）の写し方」の Task 3 の行（例 1、2、3、4、8、9、10、11、14、18、21、22）を、各例の取り込む行の `tabs`・`spaces` を直接渡して、`W`・深さ・親・`depth-adjusted` の行番号の列だけ写す。
  - `W`: `S = 0, 2, 4` → 2。下駄のある入力 `S = 2, 6, 10, 6` → 4（最小値の2ではない）。増分が無い `S = 0, 0` → 1。タブだけ → 1。最も多い増分 `S = 0,2,4,5,7,9`（増分 2,2,1,2,2）→ 2。同数 `S = 0,2,6`（増分2と4）→ 2、`S = 0,4,6`（4と2）→ 4（先に現れた値）。混在 `[[0,0],[1,0],[0,4]]` → 4（タブの行の `S` は0なので増分は 0→4 の1回だけ）。
  - 3つの場合を各1テスト: 一致（同じ `v` の兄弟）、深い（`v > top.max` で1段だけ深く、`v − lastV === W` なら警告なし、`assignOutlineDepths` に `unitWidth: 2` を直接渡した `S = 0,6`（2段以上深い）や `S = 0,3`（半端）なら2行目に警告）、揃える（段の間: `S = 0,2,6,4` の 4 → 深さ1に揃う（警告は、2段深い3行目と、揃えた4行目の2件）、最初の段より浅い: `S = 4,4,2,0` の 2 と 0 → 深さ0で警告2件（3、4行目）、同じ段の値の間: `S = 0,4,2,0,1` の 1 → 深さ0の段の `values` {0,2} の間に揃い、警告は3行目と5行目）。
  - 揃えた後の兄弟（例22）: `S = 0,4,2,2,0`（W=4）→ 深さ `0,1,0,0,0`、警告は3行目だけ。揃えた段の `values` に `v` を加えない変異では4行目にも警告が出て落ちる（L-167）。
  - 警告の位置（例8・21）: `S = 0,2,6,2` → 警告は3行目だけ、`S = 0,2,3` → 3行目だけ。最小の増分で `W` を決める変異（例21 の `W` が1になり、2行目に警告が出る）で落ちる。
  - 親: `S = 0,2,2,0,2` → `parentIndexes = [null,0,0,null,3]`。深い段を取り除いた後の親が、取り除いた段ではなく残った段の `lastIndex` になる。
  - 不変条件: 上のすべての入力と、乱数を使わない固定の100行の入力（`S = (i * 7) % 11` など）で、`depths[0] === 0`、`depths[i] <= depths[i-1] + 1`、親の深さ = 自分の深さ − 1、`parentIndexes[i] < i` を確かめる。
  - 計算量（L-431）: 10,000段の鎖（`S = 2i`）と10,000件の兄弟（すべて `S = 0`）と、深い鎖の後に一気に0へ戻る入力（`S = 2i` を5,000行の後に `S = 0` を5,000行）で、`levelOperationCount <= 10 × 行数`。10,000段の鎖で例外が出ない（再帰を使わない）。
- [ ] RED: `npm test -- --runInBand outlineHierarchy.test.ts`。
- [ ] 実装する。`levels` は配列の末尾から `pop` し、取り除いた段は戻さない。`min`・`max` は値を加えるときに更新し、`Math.min(...values)` を使わない（L-529）。
- [ ] GREEN と verify。
- 知見: L-167、L-325、L-431、L-529。
- 完了条件: 上の全ケースと、Task 3 に割り当てた12例が通り、例22・8・21 の変異の確認の結果を報告に書く。

### Task 4: 解析の合成と例の表

**Files**
- Create: `client/src/domain/outline/outlineParser.ts`、`client/src/domain/outline/__tests__/outlineParser.test.ts`

**Interfaces**
- Consumes: Task 1 の `isOutlineTextTooLong`、`isOutlineLineCountTooLarge`、`OUTLINE_LONG_LABEL_THRESHOLD`、`splitOutlineLines`。Task 2 の `extractOutlineLabel`。Task 3 の `determineOutlineUnitWidth`、`assignOutlineDepths`。
- Produces（設計書の「解析の結果の型」のとおり）:
  ```ts
  export type OutlineItem = { label: string; depth: number; parentIndex: number | null; lineNumber: number };
  export type OutlineWarningKind = "depth-adjusted" | "empty-label" | "long-label";
  export type OutlineWarning = { kind: OutlineWarningKind; count: number; lineNumbers: number[] };
  export type ParsedOutline = { items: OutlineItem[]; rootCount: number; maxDepth: number; warnings: OutlineWarning[] };
  export type OutlineParseError =
    | { kind: "too-long"; length: number }
    | { kind: "too-many-lines"; lines: number }
    | { kind: "no-items" };
  export type OutlineParseResult =
    | { ok: true; outline: ParsedOutline }
    | { ok: false; error: OutlineParseError };
  export const OUTLINE_WARNING_LINE_NUMBER_LIMIT = 5;
  export function parseOutlineText(text: string): OutlineParseResult;
  ```
  - 順序: (1) `isOutlineTextTooLong(text)`（BOM を除く前の文字列）→ `too-long`。(2) `splitOutlineLines` → `isOutlineLineCountTooLarge(lines.length)` → `too-many-lines`。(3) 各行に `extractOutlineLabel`。`marker-only` は `empty-label` の行番号に、`label` は取り込む行に。(4) 取り込む行が0件なら `no-items`。`determineOutlineUnitWidth` と `assignOutlineDepths`。(5) 警告の集計: 種類の順は `depth-adjusted`、`empty-label`、`long-label` で固定、`count` は全件、`lineNumbers` は昇順の先頭5件、`count` が0の種類は出さない。`long-label` は `Array.from(label).length > OUTLINE_LONG_LABEL_THRESHOLD`。
  - `splitOutlineLines` が `blank` にしない行（空行でない行）に対して `extractOutlineLabel` が `blank` を返すことは無いが、`switch` では `blank` の分岐も書き、その行を無視する（L-233）。
  - 入力を変えず、副作用を持たない（L-467。呼び出しは Task 9 の「プレビュー」のイベントの中だけ）。

- [ ] `outlineParser.test.ts` を書く。結果の木は補助関数 `toTree(outline)` で「親 > 子」の入れ子の文字列（例: `"果物>(りんご,みかん),野菜"`）にして比べる。補助関数は `items` の `parentIndex` だけから組み立てる（実装の関数を使わない）。
  - **設計書の例の表の1〜25をすべて、1例1テストで写す**（段階ごとのテストに写した例も含めて全行。`describe("設計書の例")` の中に `it("例1: ...")` 〜 `it("例25: ...")`）。木・ルート数・ノード数・警告（種類・件数・行番号）・エラーを表のとおりに確かめる。
    - 例1〜16・18・20〜22 は表の入力をそのまま文字列にする（`␣`・`□`・`→` は実際の文字）。例12 は `"A\r\n  B\r  C\nD"`、例13 は `"﻿  A\n    B"`、例16 は `"A\tB\nC\u0007D"`、例20 は `"​"`。
    - 例17: 200コードポイントの行（`"😀" + "あ".repeat(199)`）と201コードポイントの行（`"😀" + "あ".repeat(200)`）→ ルート2件、`long-label` 1行（2行目）。199コードポイントの行も加えた別のテストで、200ちょうどは警告しないことを確かめる（L-182）。
    - 例19: `""` と `"-\n*"` の2つで `{ ok: false, error: { kind: "no-items" } }`。
    - 例23: `"A"` を10,000行、その間に空行・`"   "`・`"\u0007"`・`"　"` を各25行はさむ → `ok: true`、ルート10,000件、警告なし。
    - 例24: 例23 に `"-"` を1行足す → `{ kind: "too-many-lines", lines: 10001 }`。
    - 例25: `"A\n".repeat(10_001)` → `{ kind: "too-many-lines", lines: 10001 }`。
  - 文字数: `"a".repeat(1_000_000)` → `ok: true`（1行）、`"a".repeat(1_000_001)` → `{ kind: "too-long", length: 1000001 }`。`"﻿" + "a".repeat(999_999)` → `ok: true`、`"﻿" + "a".repeat(1_000_000)` → `too-long`（BOM を除く前で数える）。
  - 改行の混在で結果が変わらない: 例1 を LF・CRLF・CR・混在の4通りにして、同じ `items`。
  - 判定の順序（L-443）: `jest.mock("@/domain/outline/outlineLabel", ...)` で `extractOutlineLabel` を `requireActual` を呼ぶ spy にし、例25 の入力で1回も呼ばれないこと、文字数の超過では `splitOutlineLines` の spy も呼ばれないことを確かめる。
  - 警告の行番号: `empty-label` を7行（行番号 2,4,6,8,10,12,14）作る入力で、`count: 7`、`lineNumbers: [2,4,6,8,10]`。
  - `rootCount`・`maxDepth`: 例1 → `2`・`1`、例2 → `1`・`2`。
  - 入力を変えない（`Object.freeze` はできないので、呼び出しの前後で文字列が同じ値であることと、2回呼んだ結果が `toEqual` で一致することを確かめる）。
  - 計算量: 10,000段の鎖（`"A"` の前に `2i` 個の空白）で例外が出ずに `maxDepth === 9999`。10,000件の兄弟で `rootCount === 10000`（L-431。操作の回数は Task 3 で確かめ済み）。
- [ ] RED: `npm test -- --runInBand outlineParser.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-044、L-136、L-167、L-182、L-233、L-431、L-443、L-467。
- 完了条件: **設計書の例の表の1〜25がすべて、`parseOutlineText` のこのテストファイルに1例ずつ写されて通る**（段階ごとのテストに写したかどうかによらない。レビューでは表の行とテストの `it` を1対1で突き合わせる）。上の他のケースも通る。

### Task 5: プレビューの木と解析の文言

**Files**
- Create: `client/src/domain/outline/outlinePreview.ts`、`client/src/domain/outline/__tests__/outlinePreview.test.ts`
- Create: `client/src/domain/outline/outlineMessages.ts`、`client/src/domain/outline/__tests__/outlineMessages.test.ts`

**Interfaces**
- Consumes: Task 1 の定数。Task 4 の `ParsedOutline`、`OutlineWarning`、`OutlineParseError`。
- Produces（`outlinePreview.ts`）:
  ```ts
  export const OUTLINE_PREVIEW_MAX_ITEMS = 200;
  export const OUTLINE_PREVIEW_LABEL_LENGTH = 80;   // コードポイント
  export type OutlinePreviewNode = { key: number; label: string; children: OutlinePreviewNode[] }; // key は items の添字
  export type OutlinePreview = {
    roots: OutlinePreviewNode[];
    shownCount: number;   // min(items.length, maxItems)
    totalCount: number;   // items.length
    truncated: boolean;   // totalCount > shownCount
  };
  export function truncateOutlinePreviewLabel(label: string): string; // 81コードポイント以上なら先頭80 + "…"
  export function buildOutlinePreview(outline: ParsedOutline, maxItems = OUTLINE_PREVIEW_MAX_ITEMS): OutlinePreview;
  ```
  - `items` の先頭 `maxItems` 件を1回の走査で木にする（親は常に自分より前にあるので、添字から作った配列で親のノードを引く。再帰を使わない）。
- Produces（`outlineMessages.ts`）:
  ```ts
  export const OUTLINE_TOO_LONG_MESSAGE: string;                       // "テキストが長すぎます（1,000,000文字以内）。"
  export function formatOutlineCurrentLength(length: number): string;  // "現在 1,000,123 文字"
  export function formatOutlineParseError(error: OutlineParseError): string;
  //   too-long → OUTLINE_TOO_LONG_MESSAGE
  //   too-many-lines → "行が多すぎます（空行を除いて10,000行以内）。現在 10,001 行です。"
  //   no-items → "取り込める行がありません。空行と記号だけの行は取り込みません。"
  export function formatOutlineWarning(warning: OutlineWarning): string; // 先頭の「注意:」は付けない（部品が付ける）
  //   depth-adjusted → "階層が合わない行を N 行補正しました（3、7、12行目）。プレビューで親子関係を確かめてください。"
  //   empty-label   → "記号だけの行を N 行取り込みません（5行目）。"
  //   long-label    → "200文字を超える行が N 行あります（9行目）。そのまま取り込みます。"
  //   行番号が count より少ない（6件以上）ときは「（3、7、12、15、20行目ほか）」
  export function formatOutlinePreviewSummary(outline: ParsedOutline): string;
  //   "追加するノード: 1,234件（一番上の階層: 3件、最も深い階層: 5段目）"（段目は maxDepth + 1）
  export function formatOutlinePreviewTruncation(preview: OutlinePreview): string | null;
  //   truncated のときだけ "先頭の200件を表示しています（全1,234件）。"、それ以外は null
  ```
  - 数値はすべて `toLocaleString("en-US")`。上限の数値は定数から組み立てる。`switch` で種類を網羅する（L-233）。

- [ ] `outlinePreview.test.ts` を書く。
  - 打ち切り（L-160、L-182）: 兄弟だけの199・200・201件で、`shownCount` が 199・200・200、`truncated` が `false`・`false`・`true`、`roots.length` が 199・200・200。
  - 一部でも木として閉じる: 201件の鎖で、`roots.length === 1`、深さ200の入れ子（最も深い `children` が空）。先頭の木の途中で切れる森（1本目が150件、2本目が100件）で、2本目の根が `roots[1]` にあり、子が50件。
  - `maxItems` を渡す: `buildOutlinePreview(outline, 3)` で3件だけ。
  - ラベル: 80コードポイント（`"😀".repeat(80)`）はそのまま、81コードポイントは `"😀".repeat(80) + "…"`。追加する `items` の `label` は変わらない（`outline` を変更しない）。
  - `key` が `items` の添字。
- [ ] `outlineMessages.test.ts` を書く（期待値はリテラル）。
  - 3種類の警告の文言（1件、3件、7件で「ほか」付き）。件数 `1234` → 「1,234 行」。
  - 3種類のエラーの文言。`too-many-lines` の `lines: 10001` → 「現在 10,001 行です。」。
  - 要約: `items` 1,234件・`rootCount` 3・`maxDepth` 4 → 「追加するノード: 1,234件（一番上の階層: 3件、最も深い階層: 5段目）」。
  - 打ち切りの文言と、打ち切らないときの `null`。`formatOutlineCurrentLength(1000123)` → 「現在 1,000,123 文字」。
- [ ] RED: `npm test -- --runInBand outlinePreview.test.ts outlineMessages.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-160、L-167、L-182、L-233、L-400。
- 完了条件: 2ファイルの全ケースが通る。文言の数値が定数から組み立てられている。

### Task 6: 手動配置の共通の規則の切り出し

**Files**
- Create: `client/src/domain/nodes/nodeManualPlacement.ts`、`client/src/domain/nodes/__tests__/nodeManualPlacement.test.ts`
- Modify: `client/src/domain/nodes/nodeSubtreeInsertion.ts`（非公開の `calculateManualOffsetY` を削除し、新しいモジュールから import）
- Modify: `client/src/domain/nodes/nodePlacement.ts`（`createChildNode` が `calculateChildPlacement` を使う）

**Interfaces**
- Produces:
  ```ts
  // 手動配置では、マップ全体の下端から SIBLING_VERTICAL_GAP だけ空けた位置へ、sources を真下へ平行移動する量。
  // 空のマップでは 0。非有限値や、丸めで間隔を確保できない場合は null（今の実装をそのまま移す）
  export function calculateManualOffsetY(current: readonly Node[], sources: readonly Node[]): number | null;
  // 子を追加するときの左上の位置。x は parent.x + parent.width + CHILD_HORIZONTAL_GAP、
  // y は既存の子が無ければ parent.y、あれば既存の子の下端の最大値 + SIBLING_VERTICAL_GAP。親が無ければ null
  export function calculateChildPlacement(nodes: readonly Node[], parentId: number): { x: number; y: number } | null;
  ```
  - `calculateChildPlacement` の下端の最大値はループで求める（`Math.max(...)` を使わない。L-529）。演算の結果は今の `createChildNode` と同じ（有限性の検査は呼び出し側。`createChildNode` の挙動を変えない）。
  - `createSiblingNode` は変えない（設計書の範囲外）。

- [ ] `nodeManualPlacement.test.ts` を書く。
  - `calculateManualOffsetY`: 空のマップ → 0。既存の下端 200（y 140・高さ 60）、sources の上端 40 → 200（= 200 + 40 − 40）。下端が `Number.MAX_VALUE` 付近で間隔を確保できない → `null`（L-524）。
  - `calculateChildPlacement`: 子が無い親（x 100, y 50, 幅 100）→ `{ x: 320, y: 50 }`。子が2つ（下端 170 と 230、配列の順は 230 の子が先）→ `y: 270`。親が無い → `null`。別の親の子を数えない（2つの親で、それぞれの子だけを見る）。
  - スプレッドを使わない（L-529）: 子が500,000件の親で `calculateChildPlacement` が例外を出さずに値を返す（`Math.max(...)` の変異で RangeError になって落ちる）。
- [ ] RED: `npm test -- --runInBand nodeManualPlacement.test.ts`。
- [ ] 実装し、`nodeSubtreeInsertion.ts` と `nodePlacement.ts` を新しい関数に置き換える。
- [ ] GREEN: `npm test -- --runInBand nodeManualPlacement.test.ts nodeSubtreeInsertion.test.ts nodeSubtreeDuplication.test.ts nodePlacement.test.ts useNodes.test.ts useNodesAutoLayout.test.ts useNodesDuplication.test.ts useNodesClipboard.test.ts`。既存のテストは**変更せずに**通ること。続けて verify。
- 知見: L-048、L-524、L-529。
- 完了条件: 手動配置の2つの規則が `nodeManualPlacement.ts` の1か所にあり、既存の複製・貼り付け・子の追加の挙動とテストが変わらない。

### Task 7: 森の挿入

**Files**
- Create: `client/src/domain/nodes/nodeForestInsertion.ts`、`client/src/domain/nodes/__tests__/nodeForestInsertion.test.ts`

**Interfaces**
- Consumes: Task 6 の `calculateManualOffsetY`、`calculateChildPlacement`。既存の `layoutNodeForest`（`nodeAutoLayout.ts`）、`AllocateNodeIds`（`nodeSubtreeInsertion.ts`）、`checkedAdd`・`checkedSubtract`（`nodeLayoutArithmetic.ts`）、`DEFAULT_NODE_IMPORTANCE`、`RECT_WIDTH`・`RECT_HEIGHT`。
- Produces（設計書のとおり）:
  ```ts
  export type ForestItem = { label: string; parentIndex: number | null }; // parentIndex は自分より前の添字
  export type ForestInsertionTarget =
    | { kind: "root" }
    | { kind: "child"; parentId: number };
  export type ForestInsertionFailureReason = "parent-missing" | "invalid-items" | "placement-failed";
  export type ForestInsertionResult =
    | { ok: true; nodes: Node[]; rootIds: number[] }   // rootIds は深さ0の項目の新しい ID（入力の順）
    | { ok: false; reason: ForestInsertionFailureReason };
  export function insertNodeForest(
    current: readonly Node[],
    items: readonly ForestItem[],
    target: ForestInsertionTarget,
    mode: NodeLayoutMode,
    allocateIds: AllocateNodeIds,
  ): ForestInsertionResult;
  ```
  - 検査の順: (1) `invalid-items`（`items` が空、`items[0].parentIndex !== null`、`parentIndex` が整数でない・負・自分以上）。(2) `child` なら親の存在 → `parent-missing`。(3) 座標の計算 → 失敗は `placement-failed`。(4) `allocateIds(current, items.length)` を1回。(5) `ids[index]` を割り当て、親は `ids[parentIndex]`、深さ0は `null`（root）か `parentId`（child）。
  - 座標（設計書の「配置（手動）」「配置（自動）」）:
    - auto: すべて (40, 40)。全体の再配置は `applyTreeChange` が行う（ここでは `layoutNodeForest` を呼ばない）。
    - manual・root: 仮のノード（仮の ID は添字、親は `parentIndex`、寸法 100×60、すべて `(x0, 40)`。`x0` は既存のノードの x の最小値をループで求めた値、空のマップでは 40）を `layoutNodeForest` で並べ、`calculateManualOffsetY(current, 並べた仮のノード)` だけ真下へ移す。
    - manual・child: `calculateChildPlacement(current, parentId)` を基準の位置にする。仮の親（仮の ID は `items.length`、親と同じ x・y・幅・高さ、配列の先頭）の子として深さ0の項目をつないだ仮のノードを `layoutNodeForest` で並べ、仮の親を除き、先頭の項目の左上が基準の位置に来るように全体を平行移動する。
    - 平行移動は `checkedAdd`・`checkedSubtract` で行い、`null`・有限でない x・y・`x + width`・`y + height` があれば `placement-failed`（L-524）。`layoutNodeForest` が `null` のときも `placement-failed`。
  - 新しいノードは `{ id, parentId, x, y, width: 100, height: 60, label, importance: "medium" }`（`illustration` を持たない）。`current` の後ろへ `items` の順で足す。`current` と `items` を変更しない。

- [ ] `nodeForestInsertion.test.ts` を書く（`allocateIds` は呼び出しを記録する `jest.fn<number[], [readonly Node[], number]>()`）。
  - 組み合わせ（root・child × manual・auto × 空のマップ・既存のマップ）。root・manual・空のマップでは先頭のルートが (40, 40)。root・manual・既存のマップ（ノードが x 200 と x 80、下端 300）に `[A, A1, A2, B]`（A の子が2つ、B はルート）を追加すると、取り込んだノードの y の最小値が 340（A1。`layoutNodeForest` は親を子の範囲の中央に置くので、木の上端は A ではなく A1）、A1 の y が 340、A の y が 390（A1 と A2 の範囲の中央）、A の x が 80、B の y が1本目の木の下端（A2 の下端）から80px下。木の上端ではなく先頭のルートの y を基準に移す変異で落ちる。root・auto ではすべて (40, 40)。
  - 森の順と親の対応（L-170）: 3本の木（`[A, A1, B, C, C1]`）で `rootIds` が A・B・C の新しい ID の順、`A1.parentId === rootIds[0]`、`C1.parentId === rootIds[2]`（2本目・3本目の根の取り違えを検出する）。
  - child・manual: 子が無い親（x 100, y 50）→ 先頭の項目が (320, 50)、2つ目の深さ0の項目が先頭の項目の部分木の下端から40px下（兄弟の間隔）。既存の子がある親 → 先頭の項目の y が既存の子の下端の最大値 + 40（`createChildNode` と同じ基準。`createChildNode(current, parentId, 999)` の x・y と一致することを確かめる）。深さ0の項目の `parentId` がすべて親の ID。
  - 採番（L-432）: 成功時に `allocateIds` を1回だけ、`(current, items.length)` で呼ぶ。`invalid-items`（空、`[{ parentIndex: 0 }]`、`parentIndex: 1.5`、`-1`、自分自身）・`parent-missing`・`placement-failed` では呼ばない。同じ値を繰り返し返す生成器を使った本物の allocator（`createNodeIdAllocator(() => { const values = [1, 1, 2, 2, 3, 3, 4, 4, 5]; let i = 0; return () => values[i++]; })` の `nextAvailableIds`）を `allocateIds` に渡し、既存の ID 1 のノードがあるマップへ3件を追加すると、新しい ID が `[2, 3, 4]` で、既存の ID とも互いにも重ならない。
  - 座標の失敗（L-524）: 既存のノードの y が `Number.MAX_VALUE` 付近で、root・manual が `placement-failed`。親の x が `Number.MAX_VALUE` の child・manual が `placement-failed`。
  - 変更しない: `Object.freeze` した `current`（各要素も freeze）と `items` で例外が出ない。
  - 計算量（L-431）: 10,000段の鎖と10,000件の兄弟の `items` を、`current`（1,000件）と `items` の両方を Proxy に包んで渡し、配列要素の読み取り回数がそれぞれの件数の20倍以内（manual・root、manual・child、auto の3通り）。10,000段の鎖の manual で例外（RangeError）が出ない。
- [ ] RED: `npm test -- --runInBand nodeForestInsertion.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-170、L-233、L-431、L-432、L-524、L-529。
- 完了条件: 全ケースが通る。`nodeForestInsertion.ts` が `domain/outline` を import していない。

### Task 8: useNodes.insertForest（1回の commit）

**Files**
- Modify: `client/src/hooks/useNodes.ts`
- Create: `client/src/hooks/__tests__/useNodesForestInsertion.test.ts`

**Interfaces**
- Consumes: Task 7 の `insertNodeForest`、`ForestItem`、`ForestInsertionTarget`、`ForestInsertionFailureReason`。
- Produces:
  ```ts
  export type InsertForestResult =
    | { ok: true; rootId: number; count: number }
    | { ok: false; reason: ForestInsertionFailureReason };
  // UseNodesReturn に追加
  insertForest: (items: readonly ForestItem[], target: ForestInsertionTarget) => InsertForestResult;
  ```
  - `applyTreeChange` を1回だけ呼ぶ。コールバックの中で `insertNodeForest(currentNodes, items, target, mode, (occupied, count) => allocator.nextAvailableIds(occupied, count))` を呼び、失敗なら理由を控えて `null` を返す。`applyTreeChange` が `false` で、控えた理由が無ければ `placement-failed`（自動配置の失敗）。
  - 成功したら `rootIds[0]` を選択し、`{ ok: true, rootId: rootIds[0], count: items.length }`。`documentRevision` は変えない。展開は扱わない（Task 9 の `submit` が行う）。

- [ ] `useNodesForestInsertion.test.ts` を書く（既存の `useNodesClipboard.test.ts` と同じく `renderHook(() => useNodes())`）。
  - 1回の commit（L-063）: 既存のノードが2つある自動配置のマップに3本の木を追加 → 1回の `undo()` で取り込んだノードがすべて消え、自動配置で動いた既存のノードの座標も追加前に戻る。`redo()` で ID・ラベル・座標が追加直後と同じ。履歴が1つだけ増える: 空のマップで `addNode` を1回してから取り込むと、`undo()` の1回目でノード1つの状態、2回目で空、3回目は `false`。
  - 選択（L-170）: 3本の木で `selectedNodeId === 結果の rootId === 1本目の根`（2本目・3本目ではない）。child では最初の子。
  - 失敗で何も変わらない（L-001）: 存在しない親 → `{ ok: false, reason: "parent-missing" }`、ノード・選択・`canUndo`・`canRedo` が変わらない。Undo の後に失敗させても `canRedo` が `true` のまま。
  - 自動配置の失敗: `jest.mock` で `layoutNodeForest` を、取り込みの候補のときだけ `null` を返すようにし（`requireActual` を包む）、`{ ok: false, reason: "placement-failed" }`。
  - `documentRevision` が変わらない。`count` が `items.length`。
  - 10,000段の鎖を自動配置のマップへ追加して例外が出ない。
- [ ] RED: `npm test -- --runInBand useNodesForestInsertion.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-063、L-170、L-432。
- 完了条件: 全ケースが通り、既存の `useNodes*.test.ts` が変更なしで通る。

### Task 9: useOutlineImport（ダイアログの状態と操作）

**Files**
- Create: `client/src/hooks/useOutlineImport.ts`、`client/src/hooks/__tests__/useOutlineImport.test.tsx`
- Modify: `client/src/domain/outline/outlineMessages.ts`、`__tests__/outlineMessages.test.ts`（追加の結果の文言を足す）

**Interfaces**
- Consumes: Task 1 の `isOutlineTextTooLong`。Task 4 の `parseOutlineText`、`ParsedOutline`。Task 5 の `buildOutlinePreview`、`OutlinePreview`、`OUTLINE_TOO_LONG_MESSAGE`、`formatOutlineParseError`。Task 7 の `ForestItem`、`ForestInsertionTarget`、`ForestInsertionFailureReason`。Task 8 の `InsertForestResult`。既存の `useRevisionScopedNotice`、`OperationNotice`。
- Produces（`outlineMessages.ts` に追加）:
  ```ts
  export function formatOutlineImportSuccess(count: number): string;
  //   "1,234件のノードを追加しました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。"
  export function formatOutlineInsertFailure(reason: ForestInsertionFailureReason): string;
  //   parent-missing → "選択していたノードが見つからないため、追加できませんでした。「新しいルートとして追加」を選び直してください。"
  //   invalid-items・placement-failed → "ノードを追加できませんでした。マップは変わっていません。"
  ```
- Produces（`useOutlineImport.ts`。設計書の「ダイアログの画面と状態」の型をそのまま使う）:
  ```ts
  export type OutlineImportScreen = "closed" | "input" | "preview";
  export type OutlineImportTarget = "root" | "child";
  export type OutlineInputError = { sequence: number; message: string | null };
  export type OutlineDialogNotices = { sequence: number; status: string | null; alert: string | null };
  export type OutlineImportFocusRequest = "input" | "preview" | "header";
  export type UseOutlineImportOptions = {
    selectedNodeId: number | null;
    documentRevision: number;
    insertForest: (items: readonly ForestItem[], target: ForestInsertionTarget) => InsertForestResult;
    expandNodes: (nodeIds: readonly number[]) => void;
  };
  export type UseOutlineImportReturn = {
    screen: OutlineImportScreen;
    text: string;
    textLength: number;
    inputError: OutlineInputError;
    outline: ParsedOutline | null;
    preview: OutlinePreview | null;
    parentCandidateId: number | null;
    parentCandidateStale: boolean;    // open の時点の documentRevision から変わったか（変わっていれば親は無くなったものとして扱う）
    target: OutlineImportTarget;
    dialogNotices: OutlineDialogNotices;
    focusRequest: OutlineImportFocusRequest | null;
    notice: OperationNotice | null;   // 操作通知バーの7系統目
    open: () => void;
    close: () => void;
    setText: (text: string) => void;
    requestPreview: () => void;
    back: () => void;
    setTarget: (target: OutlineImportTarget) => void;
    submit: () => void;
    consumeFocusRequest: () => void;
  };
  export function useOutlineImport(options: UseOutlineImportOptions): UseOutlineImportReturn;
  ```
  - `selectedNodeId`・`documentRevision`・`openedRevision`・`insertForest`・`expandNodes` は `useLayoutEffect` で同期する ref から読み、`open`・`submit` の参照を変えない（L-521）。
  - `open`: `screen: "input"`、`parentCandidateId` に今の `selectedNodeId`、内部の state `openedRevision` に今の `documentRevision`、`target: "root"`、`dialogNotices` を空にして `sequence` を進める、`focusRequest: "input"`。`text` は前回の値のまま。
  - `close`: `screen: "closed"`、`dialogNotices` を空に、`focusRequest: "header"`。`text` は残す。
  - `setText`: `text` を変える。入力のエラーの規則は設計書の「テキスト入力の画面」のとおり: 新しい文言は「上限を超えていれば `OUTLINE_TOO_LONG_MESSAGE`、それ以外は `null`」とし、前の文言と違うときだけ `sequence` を進める（超えていない状態から超えた状態、超えた状態から戻った状態、解析のエラーの後の変更）。文字数の判定は `isOutlineTextTooLong` だけで、解析しない（L-467）。
  - `requestPreview`: `parseOutlineText(text)` を1回だけ呼ぶ。失敗なら `inputError` に `formatOutlineParseError` の文言を入れて、同じ文言でも `sequence` を進める。画面とフォーカスは変えない。成功なら `outline` と `buildOutlinePreview(outline)` を入れ、`inputError` を空にし（文言が変わるときだけ `sequence` を進める）、`screen: "preview"`、`focusRequest: "preview"`。
  - `back`: `screen: "input"`、`outline`・`preview` を `null`、`dialogNotices` を空に、`focusRequest: "input"`。
  - `parentCandidateStale` は `screen !== "closed" && documentRevision !== openedRevision`。
  - `submit`: `target === "child"` で、`parentCandidateId === null` か `parentCandidateStale`（ref から読む最新の `documentRevision` で判定）なら、`insertForest` を呼ばずに `parent-missing` の失敗として扱う。マップの置き換えの後は、同じ ID のノードがあっても別のノードなので、ID の存在だけで判定しない（L-037、L-002）。`root` は revision が変わっていても、確定の時点の現在のマップへ追加する。それ以外で `target === "child"` なら `{ kind: "child", parentId }`、それ以外は `{ kind: "root" }` で `insertForest(outline.items, target)` を1回。成功なら、child のときだけ `expandNodes([parentId])`、`publishNotice({ kind: "status", message: formatOutlineImportSuccess(count) })`、`text: ""`、`screen: "closed"`、`outline`・`preview` を `null`、`focusRequest: "header"`。失敗なら `dialogNotices` の `alert` に `formatOutlineInsertFailure(reason)` を入れて `sequence` を進め、画面・フォーカス・テキストを変えない（L-001、L-249）。`screen !== "preview"` のときは何もしない。
  - `notice` は `useRevisionScopedNotice(documentRevision)` の `notice`（Undo / Redo とマップの置き換えで消える）。
  - 結果の共用体は `switch` で網羅する（L-233）。

- [ ] `outlineMessages.test.ts` に、成功の文言（`1234` → 「1,234件の」）と3つの失敗の理由の文言を足す。
- [ ] `useOutlineImport.test.tsx` を書く（`insertForest` と `expandNodes` は型付きの `jest.fn`。`insertForest` は本物と同じ結果型を返す。L-171）。
  - 画面の遷移の表の各行（設計書の表の7行）を1テストずつ。
  - テキストが閉じても残り（`close` → `open` で同じ `text`）、追加の成功で `""` になる。
  - 開くたびに `target` が `"root"` に戻る（`setTarget("child")` → `close` → `open`）。
  - `parentCandidateId` を開いた時点で控える: `selectedNodeId: 5` で `open` → 再描画で `selectedNodeId: 7` にしても `parentCandidateId === 5`、`submit` の `target` が `{ kind: "child", parentId: 5 }`（L-002: 黙って新しいルートへ変えない）。`insertForest` が `parent-missing` を返したときも alert に文言、画面は `"preview"` のまま。
  - 開いている間の置き換え（L-037）: `selectedNodeId: 5`・`documentRevision: 0` で `open` → プレビュー → `setTarget("child")` → `documentRevision: 1` で再描画（`selectedNodeId` は 5 のまま。置き換えた後のマップにも ID 5 のノードがある場合にあたる）→ `parentCandidateStale === true`、`submit` で `insertForest` が呼ばれず、alert に「選択していたノードが見つからないため、…」、`expandNodes` も呼ばれず、画面は `"preview"` のまま。同じ状態で `setTarget("root")` にして `submit` すると、`insertForest` が `{ kind: "root" }` で1回呼ばれて成功する。revision が変わらなければ `parentCandidateStale === false`、閉じて開き直すと `false` に戻る。
  - この経路を固定するテストの置き場所: ダイアログを開いている間は、Undo・Redo・JSON 読み込みの開始・マップの切り替えが止まる（切り替えはエディタを作り直すので、フックの状態も消える）。この経路を通るのは、開く前に始めた JSON 読み込みが、開いている間に終わる場合だけである。同じ ID が残る場合は上のフックの単体テストで固定し、結合テスト（Task 15）は ID を含まない JSON で配線を確かめる。
  - `child` の成功で `expandNodes` が `[5]` で1回、`root` の成功・`child` の失敗では呼ばれない。
  - 入力のエラーの `sequence`: (1) 同じ `no-items` で2回 `requestPreview` → `sequence` が2回進み、文言は同じ。(2) 上限以下の入力を続けても進まない。(3) 1,000,001文字にすると1回進み、1,000,002文字にしても進まない。(4) 1,000,000文字に戻すと1回進み、文言が `null`。(5) `too-many-lines` の後に1文字足すと1回進み、文言が `null`。
  - `requestPreview` の成功で `outline.items.length` と `preview.totalCount` が一致し、`focusRequest === "preview"`。`consumeFocusRequest` で `null`。
  - 成功の通知: `notice.message` が「3件のノードを追加しました。…」。`documentRevision` を進めて再描画すると `null`。
  - `open`・`submit` の参照が、`selectedNodeId`・`insertForest` を変えて再描画しても変わらない（L-521）。
- [ ] RED: `npm test -- --runInBand useOutlineImport.test.tsx outlineMessages.test.ts`。
- [ ] 実装し、GREEN と verify。
- 知見: L-001、L-002、L-037、L-161、L-166、L-171、L-233、L-249、L-467、L-521。
- 完了条件: 全ケースが通る。フックはノード配列を持たず、`parseOutlineText` をレンダー中に呼ばない。

### Task 10: ヘッダーの「箇条書きから追加」ボタン

**Files**
- Create: `client/src/components/layout/OutlineImportControl.tsx`、`client/src/components/layout/__tests__/OutlineImportControl.test.tsx`

**Interfaces**
- Produces:
  ```ts
  type OutlineImportControlProps = {
    expanded: boolean;                     // ダイアログを開いているか
    onOpen: () => void;
    buttonRef: Ref<HTMLButtonElement>;     // 閉じたときのフォーカスの戻し先
  };
  export function OutlineImportControl(props: OutlineImportControlProps);
  ```
  - 見える文字「箇条書きから追加」、`type="button"`、`aria-haspopup="dialog"`、`aria-expanded={expanded}`。無効にしない。クラスは既存のヘッダーのボタン（`MapPersistenceControls` の「JSON書き出し」）と同じフォーカスリング付きのクラス（L-412）。
  - `keydown` の `event.repeat` の Enter・Space を `preventDefault` する（L-408）。

- [ ] テストを書く。
  - 名前が「箇条書きから追加」（`getByRole("button", { name: "箇条書きから追加" })`）、`aria-haspopup="dialog"`、`aria-expanded` が `expanded` に従う。
  - クリックで `onOpen` が1回。
  - `fireEvent.keyDown(button, { key: "Enter", repeat: true })` と `{ key: " ", repeat: true }` が `defaultPrevented`（`fireEvent` の戻り値が `false`）。`repeat: false` では `preventDefault` されない。
  - `buttonRef` がボタンの要素を指す。
  - クラスに `focus-visible:` のフォーカスリングのクラスがある（「JSON書き出し」と同じクラスの文字列を、テストでリテラルで比べる）。
- [ ] RED: `npm test -- --runInBand OutlineImportControl.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-060、L-408、L-412。
- 完了条件: 部品は状態を持たない。まだどこからも描画されない（Task 14 で配線する）。

### Task 11: プレビューの木とプレビューの画面

**Files**
- Create: `client/src/components/layout/OutlinePreviewTree.tsx`、`__tests__/OutlinePreviewTree.test.tsx`
- Create: `client/src/components/layout/OutlineImportPreviewScreen.tsx`、`__tests__/OutlineImportPreviewScreen.test.tsx`

**Interfaces**
- Consumes: Task 4 の `ParsedOutline`。Task 5 の `OutlinePreview`、`truncateOutlinePreviewLabel`、`formatOutlineWarning`、`formatOutlinePreviewSummary`、`formatOutlinePreviewTruncation`。Task 9 の `OutlineImportTarget`。
- Produces:
  ```ts
  export function OutlinePreviewTree({ roots }: { roots: readonly OutlinePreviewNode[] });
  // 入れ子の <ul>。各 <li> は truncateOutlinePreviewLabel(label) の文字を持ち、子があれば中に <ul>。階層ごとに左の余白 1rem（pl-4）。
  // title を付けない。role="tree" を使わない。key は node.key

  export type OutlineParentCandidate =
    | { kind: "none" }                          // 開いた時点で未選択
    | { kind: "found"; label: string }          // getNodeDisplayLabel の値の先頭40コードポイント（MapEditor が作る）
    | { kind: "missing" };                      // 控えた親が今のマップに無い
  type OutlineImportPreviewScreenProps = {
    headingId: string;                          // 見出し「変換結果の確認」の id
    summaryId: string;                          // 要約の要素の id
    warningsId: string;                         // 警告の <ul> の id（警告が無くても空の要素を置く）
    outline: ParsedOutline;
    preview: OutlinePreview;
    parentCandidate: OutlineParentCandidate;
    target: OutlineImportTarget;
    onTargetChange: (target: OutlineImportTarget) => void;
    onSubmit: () => void;
    onBack: () => void;
    regionRef: Ref<HTMLDivElement>;             // プレビューの領域（最初のフォーカス先）
  };
  export function OutlineImportPreviewScreen(props: OutlineImportPreviewScreenProps);
  ```
  - 見出し `<h2 id={headingId}>変換結果の確認</h2>`、要約 `<p id={summaryId}>`、警告 `<ul id={warningsId}>` の各 `<li>` は「注意: 」+ `formatOutlineWarning`（色だけに頼らない。L-400）。
  - プレビューの領域: `role="region"`、`aria-label="変換結果のプレビュー"`、`tabIndex={0}`、`max-h-[40vh] overflow-auto`、フォーカスリング付き。中に `OutlinePreviewTree`。打ち切ったときは領域の下に `formatOutlinePreviewTruncation` の文言（L-160）。
  - 追加する位置: `none` → 「新しいルートとして追加します。」の文（ラジオボタンなし）。`found`・`missing` → `<fieldset>`（`<legend>`「追加する位置」）に同じ `name` のネイティブのラジオボタン「新しいルートとして追加」と「選択中のノード「<label>」の子として追加」（`missing` は「選択していたノードの子として追加」）。`checked` は `target` に従い、`onChange` で `onTargetChange`。
  - ボタン「マップに追加」: `keydown` の `repeat` の Enter・Space を `preventDefault`、`click` の `event.detail > 1` を無視して `onSubmit` を呼ばない（`detail` 0・1 は呼ぶ。L-408、L-150）。ボタン「戻る」: `onBack`（押し続けを止めない）。

- [ ] `OutlinePreviewTree.test.tsx`: 「果物 > (りんご, みかん)、野菜」で、`getAllByRole("list")` が2つ（外と果物の中）、果物の `<li>` の中の `<ul>` に2つの `<li>`、野菜の `<li>` に `<ul>` が無い。81コードポイントのラベルが「…」付きで、`title` 属性が無い。`role="tree"` が無い。
- [ ] `OutlineImportPreviewScreen.test.tsx`:
  - 要約・警告（「注意: 」で始まる）・打ち切りの文言（201件で表示、200件で無い）。
  - 領域の `role="region"`・名前・`tabIndex=0`、`regionRef` が領域を指す。
  - `none` でラジオボタンが無く文がある。`found` で2つのラジオボタン、`target: "root"` で1つ目が選択、2つ目を選ぶと `onTargetChange("child")`。ラベルの文字「選択中のノード「旅行」の子として追加」。`missing` で「選択していたノードの子として追加」。
  - 押し続けとダブルクリック（L-408、L-150）: 「マップに追加」の `repeat: true` の Enter・Space が `defaultPrevented`、`repeat: false` は止めない。`fireEvent.click(button, { detail: 2 })` で `onSubmit` が呼ばれず、`{ detail: 1 }` と `{ detail: 0 }` で呼ばれる（`detail > 0` への変異で `detail: 0` のテストが落ちる）。
  - 「戻る」で `onBack`。
  - `summaryId`・`warningsId` の要素が、警告が0件でも存在する（`aria-describedby` の参照先が消えない）。
- [ ] RED: `npm test -- --runInBand OutlinePreviewTree.test.tsx OutlineImportPreviewScreen.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-150、L-160、L-400、L-408、L-412。
- 完了条件: 部品は状態を持たない。

### Task 12: テキスト入力の画面

**Files**
- Create: `client/src/components/layout/OutlineImportInputScreen.tsx`、`__tests__/OutlineImportInputScreen.test.tsx`

**Interfaces**
- Consumes: Task 1 の `OUTLINE_MAX_TEXT_LENGTH`。Task 5 の `formatOutlineCurrentLength`。Task 9 の `OutlineInputError`。既存の `useReannouncedNotice`。
- Produces:
  ```ts
  type OutlineImportInputScreenProps = {
    headingId: string;                        // 見出し「箇条書きのテキスト」の id
    text: string;
    textLength: number;
    inputError: OutlineInputError;
    onTextChange: (text: string) => void;
    onPreview: () => void;
    onCancel: () => void;
    textareaRef: Ref<HTMLTextAreaElement>;
  };
  export function OutlineImportInputScreen(props: OutlineImportInputScreenProps);
  ```
  - 説明文（設計書の文言そのまま、`id` 付き）、`<label>`「テキスト」と関連付けた `<textarea rows={12} spellCheck={false}>`（幅いっぱい）。`maxLength` を付けない（L-057）。`placeholder` だけに頼らない（L-554）。
  - 入力のエラーの欄: 最初から常設の `<p role="alert" aria-live="assertive" id=...>`。中身は `useReannouncedNotice(inputError.sequence, inputError.message)`（L-153、L-166）。`inputError.message !== null` の間だけ、入力欄に `aria-invalid="true"` を付け、`aria-describedby` を「説明文の id + エラーの欄の id」にする。それ以外は説明文の id だけ（L-057）。
  - 現在の文字数: `textLength > OUTLINE_MAX_TEXT_LENGTH` の間だけ、ライブリージョンの外の `<p>` に `formatOutlineCurrentLength(textLength)`。
  - 入力欄の `keydown`: `isComposing` または `keyCode === 229` なら何もしない（L-474）。それ以外で `repeat` の Enter は `preventDefault`。普通の Enter は改行（何もしない）。`blur` では何も確定しない（L-473）。
  - ボタン「プレビュー」（`repeat` の Enter・Space を `preventDefault`）と「キャンセル」。どちらも無効にしない（L-157）。

- [ ] テストを書く。
  - ラベル「テキスト」で入力欄が取れる（`getByLabelText("テキスト")`）。`maxLength` 属性が無い。説明文が `aria-describedby` に入る。
  - エラーの欄が最初から存在し空。`inputError: { sequence: 1, message: "取り込める行がありません。…" }` で rAF の後に文言、`aria-invalid="true"`、`aria-describedby` にエラーの欄の id。同じ文言で `sequence: 2` にすると、欄が一度空になり、次の rAF で同じ文言が入る（同じ DOM ノード）。`message: null` で `aria-invalid` が無い。
  - 文字数の上限を超えたまま `textLength` だけ変えても（`sequence` は同じ）、欄の文言が入れ直されない（`useReannouncedNotice` の rAF が新しく予約されない。`requestAnimationFrame` の spy の呼び出し回数で確かめる）。現在の文字数の表示は「現在 1,000,001 文字」→「現在 1,000,002 文字」と変わり、`role="alert"` の外にある。
  - `onTextChange` に入力の値が渡る（`fireEvent.change`）。
  - IME: `fireEvent.keyDown(textarea, { key: "Enter", isComposing: true, repeat: true })` と `keyCode: 229` で `preventDefault` されない。`repeat: true` の Enter は `defaultPrevented`、`repeat: false` は止めない。
  - 「プレビュー」の `repeat: true` の Enter・Space が `defaultPrevented`、`repeat: false` は止めない。クリックで `onPreview`。「キャンセル」で `onCancel`。
  - 入力欄からの `blur` で `onPreview` が呼ばれない。
- [ ] RED: `npm test -- --runInBand OutlineImportInputScreen.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-057、L-153、L-157、L-166、L-408、L-473、L-474、L-554。
- 完了条件: 部品はテキストを持たない（props の値を表示するだけ）。

### Task 13: ダイアログの枠

**Files**
- Create: `client/src/components/layout/OutlineImportDialog.tsx`、`__tests__/OutlineImportDialog.test.tsx`

**Interfaces**
- Consumes: Task 9 の型、Task 11・12 の部品。既存の `useDialogFocusTrap`、`useReannouncedNotice`。
- Produces:
  ```ts
  type OutlineImportDialogProps = {
    screen: "input" | "preview";
    text: string;
    textLength: number;
    inputError: OutlineInputError;
    outline: ParsedOutline | null;              // preview のときだけ値を持つ
    preview: OutlinePreview | null;
    parentCandidate: OutlineParentCandidate;
    target: OutlineImportTarget;
    dialogNotices: OutlineDialogNotices;
    focusRequest: OutlineImportFocusRequest | null;
    onFocusRequestApplied: () => void;
    onTextChange: (text: string) => void;
    onPreview: () => void;
    onCancel: () => void;                        // 入力の画面の「キャンセル」と Escape
    onBack: () => void;                          // プレビューの画面の「戻る」と Escape
    onTargetChange: (target: OutlineImportTarget) => void;
    onSubmit: () => void;
    onMouseClick: () => void;                    // event.detail > 0 のクリックの時刻を控える（dialogMouseClickedAtRef）
  };
  export function OutlineImportDialog(props: OutlineImportDialogProps);
  ```
  - 骨組みは `MapLibraryDialog` と同じ: オーバーレイ（`fixed inset-0 z-50`、半透明の黒、`onClickCapture` で `event.detail > 0` なら `onMouseClick()`）の中に `role="dialog"`、`aria-modal="true"`、`tabIndex={-1}`、`aria-label="箇条書きから追加"`、最大幅 `36rem`、`max-h-full overflow-y-auto`。
  - 画面の中身を `key={screen}` の `role="group"` で包み、`aria-labelledby` は画面の見出しの id、プレビューでは `aria-describedby` に要約と警告の id（L-601）。`screen === "preview"` で `outline` か `preview` が `null` のときは何も描画しない（呼び出し側の誤りで落ちない）。
  - `useDialogFocusTrap({ dialogRef, overlayRef, onEscape })`。`onEscape` は `screen === "preview" ? onBack : onCancel`（L-159）。背景のクリックでは閉じない（L-158）。
  - `focusRequest` が `"input"` なら入力欄へ（カーソルは末尾。`setSelectionRange(length, length)`。全選択しない）、`"preview"` ならプレビューの領域へ、`useLayoutEffect` でフォーカスしてから `onFocusRequestApplied()`。`"header"` は扱わない（`MapEditor` が扱う）。`autoFocus` を使わない（L-584）。
  - ダイアログの下側に、常設の `role="status"`（`aria-live="polite"`）と `role="alert"`（`aria-live="assertive"`）。中身は `useReannouncedNotice(dialogNotices.sequence, dialogNotices)` の `status`・`alert`（L-153、L-166）。

- [ ] テストを書く（`userEvent` と `waitFor` でフォーカスを確かめる。L-177、L-183）。
  - `role="dialog"`・`aria-modal`・名前「箇条書きから追加」。入力の画面の group の名前が「箇条書きのテキスト」、プレビューの画面の group の名前が「変換結果の確認」で説明に要約と警告の文言が入る（`toHaveAccessibleDescription`）。画面を変えると group の DOM ノードが別のものになる（L-601）。
  - `focusRequest: "input"` で入力欄にフォーカス、`selectionStart === text.length`、`onFocusRequestApplied` が1回。`"preview"` でプレビューの領域にフォーカス。
  - Escape: 入力の画面で `onCancel`、プレビューの画面で `onBack`。`isComposing: true` と `keyCode: 229` の Escape と `repeat: true` の Escape では呼ばれない。
  - Tab の循環: 入力の画面で、最後の要素（「キャンセル」）から Tab で入力欄へ、入力欄から Shift+Tab で「キャンセル」へ（入力欄の Tab がインデントを入れない）。
  - オーバーレイの `pointerdown` が `defaultPrevented`、閉じるコールバックが呼ばれない。`fireEvent.click(overlay, { detail: 1 })` で `onMouseClick`、`detail: 0` では呼ばれない。
  - ダイアログ内の通知: `dialogNotices` の `alert` に文言を入れると rAF の後に `role="alert"` に出る。同じ文言で `sequence` を進めると一度空になって入り直す。要素は同じ DOM ノード。
- [ ] RED: `npm test -- --runInBand OutlineImportDialog.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-153、L-158、L-159、L-166、L-177、L-183、L-584、L-601。
- 完了条件: ダイアログは画面の状態とテキストを持たない（`MapEditor` から受け取る）。まだどこからも描画されない。

### Task 14: MapEditor との結合

**Files**
- Modify: `client/src/components/map/MapEditor.tsx`
- Modify: `client/src/components/map/__tests__/MapEditor.test.tsx`

**Interfaces**
- Consumes: Task 8 の `insertForest`、Task 9 の `useOutlineImport`、Task 10・13 の部品、Task 11 の `OutlineParentCandidate`。既存の `getNodeDisplayLabel`、`branchCollapse.expandNodes`。
- Produces（`MapEditor` の props は変えない）:
  - `const outlineImport = useOutlineImport({ selectedNodeId, documentRevision, insertForest, expandNodes: branchCollapse.expandNodes });`（`addChildNodeExpanding` のような包む関数を作らない）。
  - `const editorShortcutsEnabled = shortcutsEnabled && outlineImport.screen === "closed";` を作り、今 `shortcutsEnabled` を渡している3か所（根の `inert={!editorShortcutsEnabled}`、`useMapHistoryShortcuts` の `enabled`、`MapStage` の `shortcutsEnabled`）をすべて置き換える（L-061）。
  - `operationControls` の中で、クリップボードの案内の `<span>` の後、`MapPersistenceControls` の前に `<OutlineImportControl expanded={outlineImport.screen !== "closed"} onOpen={outlineImport.open} buttonRef={outlineImportButtonRef} />`。
  - 操作通知バー: `operationNotices` の「すべて `null` なら `null`」の条件に `outlineImport.notice === null` を足し、ノード検索の通知の後に `{outlineImport.notice !== null && <MapOperationNotice notice={outlineImport.notice} />}`（7系統目）。
  - 戻り値をフラグメントにし、根の `<div data-map-id ...>` の兄弟として、`outlineImport.screen !== "closed"` のときだけ `OutlineImportDialog` を描く（`inert` の外）。`onMouseClick` は `dialogMouseClickedAtRef.current = Date.now()`。ダイアログに `data-map-id` を付けない。
  - 親の候補: `parentCandidateId === null` → `{ kind: "none" }`、`parentCandidateStale` が `true` なら `{ kind: "missing" }`、`nodes` にあれば `{ kind: "found", label: Array.from(getNodeDisplayLabel(node.label)).slice(0, 40).join("") }`、無ければ `{ kind: "missing" }`。
  - 戻し先: `useLayoutEffect`（依存は `outlineImport.focusRequest`）で `"header"` のときに `outlineImportButtonRef.current?.focus()` してから `consumeFocusRequest()`。閉じる描画で根の `inert` が外れた後に当たる（L-155）。`"input"`・`"preview"` はダイアログに渡して、ダイアログの `onFocusRequestApplied` で `consumeFocusRequest()`。

- [ ] `MapEditor.test.tsx` にテストを足す。
  - ボタンの並び: 「箇条書きから追加」が、クリップボードの案内（「枝をコピー: Ctrl/Cmd+C」で始まる文字）の後、「JSON書き出し」の前（`compareDocumentPosition`）。
  - ボタンで開くとダイアログが出て、根に `inert` が付き、ダイアログは根の外（`editorRoot().contains(dialog) === false`）。`shortcutsEnabled={true}` のままでも、開いている間は body から Ctrl+Z を送ってもノードが戻らない。閉じると `inert` が無い。
  - `shortcutsEnabled={false}` の既存のテストがそのまま通る（変更しない）。
  - 7系統目: テキスト「- A\n- B」でプレビュー → 「マップに追加」で、`operation-notices` に「2件のノードを追加しました。」が出て、フォーカスが「箇条書きから追加」に戻る（`waitFor`）。ノードを選択していない状態から追加すると、追加後に「枝を複製」ボタンと重要度の選択が有効になる（先頭のルートが選択された）。
- [ ] 影響の確認（「既存のテストへの影響と対処するタスク」）: `grep -rn 'name: /' client/src/app/__tests__ client/src/components/map/__tests__` を実行し、「追加」「箇条」「から」を含む正規表現の名前があれば完全一致に直す。`npm test -- --runInBand page MapEditor` が通ることを確かめる。
- [ ] RED: `npm test -- --runInBand MapEditor.test.tsx`。
- [ ] 実装し、GREEN と verify。
- 知見: L-060、L-061、L-155、L-161、L-249、L-584。
- 完了条件: 実際の `MapEditor` からボタン・ダイアログ・通知・フォーカスの戻し先がつながり、既存の `MapEditor.test.tsx` とページのテストが変更なしで通る（正規表現の名前の修正が要った場合は、その差分だけ）。

### Task 15: 結合テスト

**Files**
- Create: `client/src/app/__tests__/pageOutlineImport.test.tsx`
- Create: `client/src/app/__tests__/pageOutlineImportKeyboard.test.tsx`
- Modify（テストで見つかった不具合がある場合だけ）: `client/src/components/map/MapEditor.tsx`、`client/src/hooks/useOutlineImport.ts`、`client/src/components/layout/OutlineImportDialog.tsx`

**Interfaces**
- Consumes: Task 14 までの `Home`。既存の `seedMapLibrary`、`readActiveMapJson`（`client/src/testing/mapLibraryTestStorage.ts`）と、`pageMapLibraryDialog.test.tsx` と同じ Pixi・イラスト生成・ダウンロード・画像化のモック。新しい公開 API は作らない。

- [ ] `pageOutlineImport.test.tsx`（実際の `Home`。`userEvent` と `waitFor`。L-060、L-177、L-183）:
  - 基本の流れ（手動配置）: 既存のノード1つ（x 250, y 170）のマップで「箇条書きから追加」→ 入力欄に `"- 果物\n  - りんご\n  - みかん\n- 野菜"` → 「プレビュー」→ 要約「追加するノード: 4件（一番上の階層: 2件、最も深い階層: 2段目）」と木 → 「マップに追加」。保存された JSON（`readActiveMapJson`。300ms の自動保存を待つ）に4つのノードがあり、重要度が `"medium"`、取り込んだノードの y の最小値がマップの下端（230）+ 40 = 270（りんご。`layoutNodeForest` は親を子の範囲の中央に置くので、木の上端は果物ではなくりんご）、りんごの y が 270、果物の y が 320、果物の x が 250。ダイアログが閉じ、操作通知バーに「4件のノードを追加しました。Fキーで…」、フォーカスが「箇条書きから追加」。
  - 先頭のルートが選択される（L-170）: 上の追加の直後、「枝を複製」が有効で、押すと「果物」の枝（3ノード）が複製される（「野菜」ではない）。
  - 自動配置: 自動配置のマップ（既存の木2本）に3本の木を追加すると、取り込んだ森が既存の木の下に入力の順で並ぶ（y が既存のすべてのノードより大きく、入力の順に増える）。
  - 子として追加: ノード「旅行」を選択して開くと、プレビューにラジオボタンがあり、「選択中のノード「旅行」の子として追加」を選んで追加すると、深さ0の項目がすべて「旅行」の子。選択していないときはラジオボタンが無く「新しいルートとして追加します。」。
  - 閉じた親の展開: 「旅行」の枝を折りたたんでから子として追加すると、追加後に「旅行」が展開されている（「旅行」を選択した状態の折りたたみのボタンの `aria-expanded` が `"true"`。折りたたんだ直後に `"false"` であることを先に確かめる）。
  - Undo / Redo（L-063）: 自動配置のマップで追加 → 「元に戻す」1回で取り込んだノードがすべて消え、既存のノードの座標が追加前と同じ。成功の通知が消える。「やり直す」で同じ ID・座標で戻る。
  - テキストの保持: キャンセルで閉じて開き直すとテキストが残る。追加に成功した後に開くと空。
  - 親が無くなる失敗（L-002、L-037）: 読み込む JSON は、選択するノードの ID を**含まない** JSON にする（例: 選択するノードの ID が 1 なら、ID 10・11 だけのマップ。同じ ID が残る場合は Task 9 のフックの単体テストで固定済み）。JSON 読み込みの `file.text()` を保留したまま、ノードを選択して開き、子として追加を選んでから保留を解決（マップが置き換わる）→ プレビューの選択肢が「選択していたノードの子として追加」に変わる →「マップに追加」でダイアログ内の alert に「選択していたノードが見つからないため、…」、ダイアログはプレビューの画面のまま、マップは置き換わった内容のまま変わらない、`canUndo` の表示（「元に戻す」ボタンの無効）が変わらない。
  - 入力のエラー: 空のまま「プレビュー」で「取り込める行がありません。…」、入力欄に `aria-invalid="true"`。
  - 行数の上限: `"A\n".repeat(10_001)` を `fireEvent.change` で入れて「プレビュー」→「行が多すぎます（空行を除いて10,000行以内）。現在 10,001 行です。」、プレビューへ進まない。`"A\n".repeat(10_000)` はプレビューへ進み、木の項目が200件で「先頭の200件を表示しています（全10,000件）。」。
- [ ] `pageOutlineImportKeyboard.test.tsx`:
  - ショートカットの停止（L-173）: ノードを選択した状態でダイアログを開き、`document.body` にフォーカスを置いた（`document.activeElement === document.body` をアサートしてから）うえで、Ctrl/Cmd+Z、Delete、Tab、Enter、`F`、`copy` イベント、`paste` イベント（専用形式の枝のデータ）を1つずつ送り、それぞれの後にノード（保存された JSON）と選択が変わらないことを確かめる。エディタの根に `inert`。閉じると Ctrl+Z が効く。
  - Escape と戻し先: 入力の画面の Escape で閉じ、フォーカスが「箇条書きから追加」。プレビューの画面の Escape で入力の画面へ戻り、フォーカスが入力欄でテキストが残る。
  - 最初のフォーカス: 開いたとき入力欄（カーソルが末尾）、プレビューへ進むとプレビューの領域。
  - Tab の循環: 入力欄で Tab を押すと次の要素（「プレビュー」）へ移り、入力欄の値にタブが入らない。最後の要素から Tab で最初へ戻る。
  - 押し続け（L-408）: 「箇条書きから追加」の `repeat: true` の Enter で、閉じた直後に再び開かない。プレビューの画面に移った直後の「プレビュー」の位置の Enter の `repeat` が「マップに追加」へ届かない（フォーカスが領域にあり、`repeat` の Enter でノードが増えない）。
  - ダブルクリック（L-150）: 「マップに追加」を `userEvent.dblClick` すると1回だけ追加される。閉じた後に、キャンバスへ届いた `dblclick`（`mockStageHandlers` の dblclick を500ms 以内に呼ぶ）でノードが増えない。
  - ラベルの編集中に開く（L-473）: ノードのラベルを編集中に「箇条書きから追加」を押すと、入力中のラベルが確定してからダイアログが開く。
- [ ] RED の確認: 新しいテストは Task 14 の実装で通る場合がある。その場合は、主要な配線を1つずつ一時的に壊して、対応するテストが失敗することを確かめてから元に戻す。壊す箇所: `useMapHistoryShortcuts` に `shortcutsEnabled` を渡す（`editorShortcutsEnabled` にしない）、`MapStage` に `shortcutsEnabled` を渡す、`operationNotices` の条件から取り込みの通知を外す、`submit` の `expandNodes` を外す、「マップに追加」の `detail > 1` の判定を外す、`insertForest` で `applyTreeChange` を項目ごとに呼ぶ（1回の commit でなくなる）。結果を報告に書く。
- [ ] 失敗したテストがあれば最小の修正を入れ、`npm test -- --runInBand pageOutlineImport.test.tsx pageOutlineImportKeyboard.test.tsx` を GREEN にし、verify。
- 知見: L-002、L-037、L-060、L-063、L-150、L-170、L-173、L-177、L-183、L-408、L-473。
- 完了条件: 設計書の受け入れ基準 1・3（行数）・4・5・6・7・8・9・10・11 が結合テストで固定され、変異の確認の結果を報告に書く。

### Task 16: 文書の更新

**Files**
- Modify: `docs/specifications/features.md`、`docs/specifications/data-model.md`、`docs/architecture/overview.md`
- Modify: `README.md`、`client/README.md`、`docs/README.md`
- Modify: `docs/testing/browser-test-cases.md`

- [ ] 各文書を「貼り付け」「新しいルート」「通知バー」「ダイアログ」「系統」「Phase 13」で grep し、例外の注記が要る箇所をすべて洗い出してから直す（L-591、L-203）。
- [ ] `features.md`（設計書の「既存の文書の更新」のとおり）:
  - 目次と新しい「13. 箇条書きからの追加」の章: 記法（インデントの数え方、`W`、記号と番号の除去の規則と取り除かない例）、上限、警告（3種類の文言と行番号の打ち切り）、プレビュー（200件・80文字の打ち切り）、追加する位置、配置（手動・自動）、履歴（1操作）、通知、キーボードとフォーカス（12.7 と共通の部分は参照にする）、対象外。
  - 1.1 のフェーズ別機能マトリクスに Phase 13 の行。1.2 の画面レイアウトのヘッダーの説明に「箇条書きから追加」。
  - **3.9 の「対象外」**の「普通の文章からのノード生成」を「普通の文章の貼り付け（Ctrl/Cmd+V）からのノード生成（箇条書きのテキストからの追加は 13 章のダイアログで行う）」に直す。
  - 4.2 に、取り込んだルートと子は配列の末尾に足されるため、既存の木と兄弟の後ろに並ぶことを注記する。
  - **8.1** の履歴の単位の表に「箇条書きからの追加 | 追加した全ノードと、自動配置モードでの再配置をまとめて1操作」。8.2 の「元に戻した直後の状態」で消える通知の列挙に、取り込みの通知を足す。
  - 11.1 の NOTE に、取り込みのダイアログを開いている間もショートカットを止めることを足す。
  - **11.4** の表に「箇条書きから追加」のボタンの行。操作通知バーの「6系統」を「7系統」に直し、行 853 の系統の列挙、見出し「6系統独立表示」（行 906）、本文の「6 系統」、`kind` の表の主な用途（status に取り込みの成功）を更新する。
  - 12.7 に、取り込みのダイアログも同じフォーカスの閉じ込め・Escape・ダブルクリックの続きの扱いをすることを1行で参照する。
- [ ] `data-model.md`: 保存形式（V3）を変えないことを明記し、2章の型定義リファレンスに `OutlineItem`・`OutlineWarning`・`ParsedOutline`・`OutlineParseError`・`OutlineParseResult`・`ForestItem`・`ForestInsertionTarget`・`ForestInsertionResult` を足す。
- [ ] `overview.md`: レイヤーの説明に `domain/outline/` と `nodeForestInsertion.ts`・`nodeManualPlacement.ts`・`useOutlineImport.ts` を足し、「枝の複製の流れ」「枝のコピー＆ペーストの流れ」の後に「箇条書きからの追加の流れ」（ボタン → ダイアログ → `parseOutlineText` → プレビュー → `insertForest` → `applyTreeChange` 1回 → 通知とフォーカス）を足す。
- [ ] `README.md`・`client/README.md`・`docs/README.md`: 機能の一覧と Phase の範囲の記述に Phase 13（箇条書きからの追加）を足し、ディレクトリ構成に `domain/outline/` を足す。「Phase 0からPhase 12」のような範囲の記述があれば Phase 13 まで広げる。
- [ ] `browser-test-cases.md`: 冒頭の対象に Phase 13 を足す。新しい節「Phase 13: 箇条書きからマップを作成」（記号 `P`）を足し、設計書の「手動テスト」の表の P-01〜P-14 を、前提・手順・期待の形で書く。共通の決まりとして、`npm run build` の後に `npm run start -- -p 3113` の本番ビルド（普段と別のオリジン）で行い、保存データを消すときはキーを名前で1つずつ消し「Clear All」を使わない（L-072）、各ケースは「新しいマップ」で作ったテスト用のマップで行う、大きな入力は開発者ツールの `copy("A\n".repeat(10000))` で作る、結果は実ブラウザで確かめたものだけを記録する（L-176）。結果の集計の表に P 節の行を足す。
- [ ] 文書に書いた型名・関数名・文言・定数が実装と一致することを `grep` で確かめる（`parseOutlineText`、`insertNodeForest`、`OUTLINE_MAX_ITEMS`、成功の通知の文言、「7系統」）。`git diff --check` と verify。
- 知見: L-072、L-176、L-203、L-591。
- 完了条件: 設計書の受け入れ基準 13 に挙がった文書が実装と一致する。「6系統」の記述が残っていない（`grep -n "6系統\|6 系統" docs/specifications/features.md` が0件）。実ブラウザで確認していない項目を確認済みと書いていない。

### Task 17: ROADMAP の更新と最終検証

**Files**
- Modify: `ROADMAP.md`

- [ ] Phase 13 の見出しを「## Phase 13: 箇条書きからマップを作成（✅ 完了）」にし、4項目（インデント付きの箇条書きテキストを親子構造として解析する／取り込み前に変換結果をプレビューする／確認したノードをマップへ一括追加し、自動配置する／取り込み全体を1操作としてUndo／Redoに対応する）を `[x]` にする。
- [ ] 「現在地」:
  - Phase 13 の完了の要約を1項目足す（ヘッダーの「箇条書きから追加」のダイアログ、インデントによる階層の判定と補正、記号と番号の除去、プレビューと警告、新しいルート（森）または選択中のノードの子としての追加、手動・自動の配置、1操作の Undo / Redo。Jest（jsdom）の自動テストと `npm run verify` で確認済みで、実ブラウザでの確認（docs/testing/browser-test-cases.md の P 節）は未確認であること。L-176）。
  - 「次に取り組む項目は、Phase 13「インデント付きの箇条書きテキストを親子構造として解析する」。Phase 13は未着手。」の行を、追加候補の1番にあたる「次に取り組む項目は、Phase 14「兄弟ノードの順序変更」（候補001）。」に直す。
  - 「Phase 14〜39は未着手。…Phase 13の次はPhase 14「ツリー構造の編集」に取り組む。」の行は、「Phase 13の次は」の部分を今の状態に合う書き方（例: 「Phase 14〜39は未着手。追加候補100案を、優先順位と依存関係を踏まえた26フェーズへ整理済み。」）に直す。
  - 文書体系の行の「Phase 0からPhase 12」を「Phase 0からPhase 13」に変える。
- [ ] 末尾の追加候補100案の節（「## Phase 14以降の計画（全100案・26フェーズ）」と Phase 14〜39 の各節。コミット `ca52652` の「Phase 13以降の追加候補100案」）は**変更せずにそのまま残す**。`git diff ROADMAP.md` で、その範囲に差分が無いことを確かめる。
- [ ] 「最終更新」を実装を完了した日付にする。
- [ ] `cd client && npm run verify` と `git diff --check` を実行し、テストのスイート数・テスト数と、lint・typecheck・build の成功を報告に書く。
- [ ] 全体の仕様・品質レビューを別のサブエージェントで行い、指摘を解消する。
- [ ] ブランチと worktree を保持する。コミット・push・PR は明示の依頼が無ければ行わない。完了報告では、ブランチ名・worktree のパス・未決事項（実ブラウザの未確認のケースなど）を伝える。
- 知見: L-176。
- 完了条件: ROADMAP の Phase 13 の4項目だけが新たに完了になり、現在地・次の項目（Phase 14「兄弟ノードの順序変更」（候補001））・最終更新が実態と一致する。追加候補100案の節に差分が無い。verify が成功している。

---

## 設計書との対応

| 設計書の節 | タスク |
| :--- | :--- |
| 解析の仕様（改行コード、BOM、インデントの数え方） | 1, 3, 4 |
| 解析の仕様（記号と番号の除去、空行と空のラベル） | 1, 2, 4 |
| 解析の仕様（階層の補正、警告の種類と件数） | 3, 4, 5 |
| 解析の仕様（上限、例の表 1〜25、結果の型） | 1, 4 |
| プレビューの表示（木、件数、警告、性能） | 5, 11 |
| 追加の仕様（位置、森、ID の採番、配置（手動・自動）、insertNodeSubtree を拡張しない判断） | 6, 7 |
| 追加の仕様（useNodes の操作、1回の commit、追加後の選択） | 8 |
| 追加の仕様（通知の文言） | 5, 9, 14 |
| UI（ボタン、ダイアログの画面と状態） | 9, 10, 11, 12, 13, 14 |
| UI（キーボード、フォーカス、aria、Escape、IME、押し続け、ダブルクリック） | 10, 11, 12, 13, 15 |
| UI（inert とショートカットの停止） | 14, 15 |
| エラーと境界条件 | 4, 7, 8, 9, 15 |
| 既存の操作との関係 | 6, 14, 15 |
| 既存の文書の更新・手動テスト | 16, 17 |
| 受け入れ基準 | 2 → 4、3 → 4・15、12 → Global Constraints と 7・8、13 → 16・17、その他 → 15 |

## 知見の割り当て

| 知見 | タスク |
| :--- | :--- |
| データ消失・破壊: L-001、L-002、L-013、L-063 | L-001: 4, 7, 8, 9 ／ L-002: 9, 15 ／ L-013: 1 ／ L-063: 8, 15 |
| 非同期・状態: L-037（計画のレビューで追加）、L-467、L-521 | L-037: 9, 15 ／ L-467: 4, 9 ／ L-521: 9 |
| 正しさ: L-044、L-048、L-133、L-136、L-138、L-182、L-233、L-432、L-524 | L-044: 4 ／ L-048: 6 ／ L-133: 1 ／ L-136: 1, 2, 4 ／ L-138: 1 ／ L-182: 1, 4, 5 ／ L-233: 4, 5, 7, 9 ／ L-432: 7, 8 ／ L-524: 6, 7 |
| 性能: L-160、L-431、L-443、L-529 | L-160: 5, 11 ／ L-431: 1, 3, 4, 7 ／ L-443: 1, 4 ／ L-529: 3, 6, 7 |
| 設計・責務: L-061、L-325 | L-061: 14 ／ L-325: 1, 2, 3 |
| UI・アクセシビリティ: L-057、L-150、L-153、L-155、L-157、L-158、L-159、L-161、L-166、L-249、L-400、L-408、L-412、L-473、L-474、L-554、L-584、L-601、L-602 | L-057: 12 ／ L-150: 11, 15 ／ L-153: 12, 13 ／ L-155: 14 ／ L-157: 12 ／ L-158: 13 ／ L-159: 13 ／ L-161: 9, 14 ／ L-166: 9, 12, 13 ／ L-249: 9, 14 ／ L-400: 5, 11 ／ L-408: 10, 11, 12, 15 ／ L-412: 10, 11 ／ L-473: 12, 15 ／ L-474: 12 ／ L-554: 12 ／ L-584: 13, 14 ／ L-601: 13 ／ L-602: 1, 2 |
| テスト: L-060、L-167、L-170、L-173、L-177、L-183 | L-060: 10, 14, 15 ／ L-167: 1〜5（全タスクの変異の確認） ／ L-170: 7, 8, 15 ／ L-173: 15 ／ L-177: 13, 15 ／ L-183: 13, 15 |
| 文書: L-203、L-591 | 16 |
| 手動テスト: L-072、L-176 | L-072: 16 ／ L-176: 16, 17 |
