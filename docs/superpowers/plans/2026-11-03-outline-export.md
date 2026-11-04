# Markdown・箇条書き書き出し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. このリポジトリではインラインの `superpowers:executing-plans` は使用しない。

**Goal:** メモリ上の正本 `nodes` 全件を、Markdown とプレーンな箇条書きの UTF-8 ファイルとしてヘッダーから書き出す。

**Architecture:** 既存 `buildOutlineRows` の先行順モデルを、純粋な整形関数が長さを先に検査してから文字列化する。ダウンロードサービスが Blob・ファイル名・object URL を担当し、専用フックと通知枠を `MapEditor` の共通ヘッダーに接続する。既存の保存・JSON 経路は変更しない。

**Tech Stack:** Next.js 16、React 19、TypeScript、Jest 30、Testing Library、ブラウザ Blob / object URL。

**Spec:** `docs/superpowers/specs/2026-11-03-outline-export-design.md`

## Global Constraints

- 作業場所は `.worktrees/codex/phase15-outline-export`。各 Task は別の実装サブエージェントが順番に進め、実装者と別のサブエージェントが仕様適合・コード品質の二段階をレビューする。指摘を解消・再レビューしてから次へ進む。
- 各実装で対応する Jest テストを先に追加し RED を確認してから GREEN にする。Task ごとの commit は行わず、後続の `commit-ja` にまとめる。コミット時は Conventional Commits 形式。
- `.md` は各行 `"  ".repeat(depth) + "- " + label + "\n"`、`.txt` は `"  ".repeat(depth) + "・" + label + "\n"`。ここで `depth = row.depth - 1`。根・兄弟は正本配列に現れる順、親子は先行順。最後に LF を1つ、先頭のタイトル・BOM・メタデータ・空行はなし。
- 対象は `nodes` 全件であり、表示モード、選択、折りたたみ、重要度フィルタ、保存状態に左右されない。`displayState.displayNodes` / `visibleNodeIds` を書き出しに渡さない。正本・履歴・保存形式・選択・表示状態を変更しない。
- ラベルの CRLF、CR、LF、U+0000〜U+001F、U+007F を半角スペースへ置換し `trim()` する。空なら `（空のノード）`。内部の空白・Markdown 記号はそれ以上変更せず、HTML として扱わない。
- `MAX_OUTLINE_EXPORT_CODE_UNITS = 1_000_000`。正規化後の各行の UTF-16 長 `2 * (row.depth - 1) + prefix.length + label.length + 1` と累計を `Number.isSafeInteger` で検査する。1,000,000 は許可、1,000,001 は拒否。安全でない深さ・計算結果も上限超過扱い。全行の長さ検査が終わるまで `repeat`、`join`、巨大な文字列、Blob、ダウンロードを行わない。
- `buildOutlineRows` の `invalidStructure` / `duplicateIds` は全体拒否。部分ファイルは作らず、データを修復しない。空は警告「書き出すノードがありません。」。上限警告は「書き出すテキストが大きすぎます。JSONで書き出してください。」。
- MIME は `.md`: `text/markdown;charset=utf-8`、`.txt`: `text/plain;charset=utf-8`。既存 `createMapFileName` の無効文字・予約名・ローカル日時の規則を拡張して `<mapName>-YYYYMMDD-HHMMSS.md|txt`。`URL.createObjectURL` 後は `finally` で解放する。
- 成功通知は `Markdownファイルを書き出しました。` / `箇条書きファイルを書き出しました。`。構造不正・生成・ダウンロード失敗は対応形式の `…ファイルを書き出せませんでした。`。ダウンロード関数が正常に戻った場合だけ成功とし、通知に例外本文・ラベルを含めない。「成功」はブラウザへのダウンロード開始を指し、ディスク保存完了は観測できない。
- 共通ヘッダーに2ボタンを map / outline の両モードで置く。外側・取込み・枝移動のダイアログ表示中は editor 根の `inert` に従い操作不可。保護モードでも JSON と同様に操作可。クリップボード、選択枝のみ、プレビュー、JSON置換、取込み parser の変更、新依存は追加しない。
- 書き出したテキストを Phase 13 の取込み欄へ貼る往復保証は、正しい構造・非空ラベル・10,000行以下での件数、親子関係、根・兄弟順に限る。空ラベルのプレースホルダー、前後空白・制御文字の損失、ID・座標・サイズ・重要度・イラスト・履歴・マップ名の非保持を文書化する。
- 最終 Task に文書体系・`ROADMAP.md` を含める。候補005と Phase 15 を完了、次を Phase 16 候補006、最終更新を実装日へ。全 Task 後、`client` で `npm run verify` を実行して成功を確認する。ブラウザで観測可能な範囲だけ確認し、できなければ未確認と記す。既知の観測拒否を別経路で迂回しない。

## File Structure

- `client/src/domain/outline/outlineExport.ts`: 先行順モデルの検証・出力長積算・2形式への純粋整形。
- `client/src/services/outlineExport/outlineTextDownload.ts`: Blob、MIME、ファイル名、object URL とクリック。
- `client/src/domain/mapLibrary/mapFileName.ts`: 拡張子型に `md` / `txt` を追加。既存の安全化・日時実装を再利用。
- `client/src/hooks/useOutlineExport.ts`: 結果と例外を専用通知へ変換。
- `client/src/components/layout/OutlineExportControls.tsx`: 共通ヘッダーの2ボタン。
- `client/src/components/map/MapEditor.tsx`: 正本と `outlineModel` をフックに渡し、専用通知枠と操作群を接続。
- `README.md`、`client/README.md`、`docs/README.md`、`docs/architecture/overview.md`、`docs/specifications/{features,data-model,api}.md`、`docs/testing/browser-test-cases.md`、`ROADMAP.md`: 利用方法・境界・API・手動確認・現在地。

## Review Focus

1. 配列が先行順でない森と非表示の子孫: 正本の根・兄弟順で全件を出す。Task 1 の `preservesCanonicalOrderAndAttributes`、Task 2 の `exportsFullModelInBothModes` で固定。
2. 10,000 段の鎖: `repeat` と巨大な文字列を作る前に上限を拒否する。Task 1 の `rejectsDeepChainBeforeMaterializing` で固定。
3. 両形式の境界・非安全整数: ちょうど 1,000,000 は許可、超過と不正な深さは拒否。Task 1 の `enforcesExactLimitForBothFormats`、`rejectsUnsafeDepth` で固定。
4. Blob / URL / click 例外: URL を解放し、成功通知を出さない。Task 1 の `releasesUrlAfterClickFailure`、Task 2 の `reportsFailureOnlyAfterDownloadException` で固定。
5. 保存失敗・保護モード・ダイアログ: 書き出しの成否は保存から独立し、`inert` の間は操作できない。Task 2 の `exportsDespiteSaveFailureOrProtectedStorage`、`respectsEditorInert` で固定。

---

### Task 1: 純粋整形、上限検査、ダウンロード

**Files:**
- Create: `client/src/domain/outline/outlineExport.ts`
- Create: `client/src/domain/outline/__tests__/outlineExport.test.ts`
- Create: `client/src/services/outlineExport/outlineTextDownload.ts`
- Create: `client/src/services/outlineExport/__tests__/outlineTextDownload.test.ts`
- Modify: `client/src/domain/mapLibrary/mapFileName.ts`

**Interfaces:**
- Consumes: `buildOutlineRows(nodes: readonly Node[]): OutlineRows`（`outlineRows.ts`）、`normalizeOutlineRest(rest: string): string`（`outlineLines.ts`）、`createMapFileName(mapName: string, extension: MapFileExtension, now: Date): string`。
- Produces: `type OutlineExportFormat = "md" | "txt"`; `type OutlineExportResult = { ok: true; text: string } | { ok: false; reason: "empty" | "too-large" | "invalid-structure" }`; `MAX_OUTLINE_EXPORT_CODE_UNITS = 1_000_000`; `formatOutlineRows(model: OutlineRows, format: OutlineExportFormat): OutlineExportResult`（`outlineExport.ts`）。
- Produces: `downloadOutlineText(text: string, mapName: string, format: OutlineExportFormat, now?: Date): void`（`outlineTextDownload.ts`）。`MapFileExtension` に `"md" | "txt"` を足す。

- [x] **Step 1: 整形の失敗テストを先に追加する。** `outlineExport.test.ts` に次の Jest ケースを作る。`createTestNode` と `buildOutlineRows` を使い、入力ノードと全属性を操作前後で比較する。`preservesCanonicalOrderAndAttributes` は `[子B, 根A, 子A, 根B]` と重要度・座標・イラスト付き入力から `.md`=`- 根A\n  - 子B\n  - 子A\n- 根B\n`、`.txt`=`・根A\n  ・子B\n  ・子A\n・根B\n` を検証する。`normalizesPhysicalLinesWithoutDroppingNodes` は CRLF / CR / LF / タブ / U+0000 / U+007F / 前後空白 / `#` / `*` / `[ ]` / 空ラベルを両形式で検証し、先頭 BOM なし、末尾 LF 1つも確認する。`roundTripsSupportedStructure` は `parseOutlineText` に両形式の出力を渡し、ラベルがさらに `- ` / `・` で始まる場合も件数・親子関係・根と兄弟の順序・ラベルを確認する。ID・座標・重要度の保持は期待しない。`rejectsEmptyAndInvalidStructure` は空、重複ID、親不在、自己参照、循環をそれぞれ `{ok:false,reason:...}` とする。
- [x] **Step 2: `client` で `npm test -- --runInBand src/domain/outline/__tests__/outlineExport.test.ts` を実行し RED（module/function 不在）を確認する。**
- [x] **Step 3: `outlineExport.ts` を実装する。** `model.invalidStructure || model.duplicateIds` を空より先に判定。各行をループで正規化して `{depth,label}` の軽量データに保持し、`2 * (depth - 1) + prefix.length + label.length + 1` を整数安全性と上限で積算する。`model.nodesById.get(row.nodeId)` が無ければ構造不正。全行合格後だけ2スペースの `repeat` と行文字列配列の `join("")` を使う。再帰や全配列の再検索をしない。
- [x] **Step 4: 上限と大規模入力の失敗テストを追加する。** `enforcesExactLimitForBothFormats` は根1件のラベル長を `.md` では 999,997 / 999,998、`.txt` では 999,998 / 999,999 とし、前者は `text.length === 1_000_000`、後者は `too-large` を検証する。`rejectsDeepChainBeforeMaterializing` は 10,000 件の短いラベルを持つ鎖を逆順配列で作り、`String.prototype.repeat` の spy が未呼出しのまま `too-large` となることを確認する。`rejectsUnsafeDepth` は最小限の `OutlineRows` の行 `depth: Number.MAX_SAFE_INTEGER + 1` と `depth: 0` を渡し `too-large` とする。`handlesWideForest` は多数の根をループで出し、件数・先頭・末尾・長さを確認する。超過ケースで文字列生成の `join` が呼ばれないことも spy で確認する。
- [x] **Step 5: 同じコマンドで RED を確認し、安全整数・上限の実装を完成させ GREEN を確認する。** `Number.isSafeInteger` を深さ、インデント長、行長、累計に使い、`depth < 1` も `too-large` にする。`repeat` / `join` は検査後のみ。テスト用 spy は必ず復元する。
- [x] **Step 6: ダウンロードの失敗テストを追加する。** `outlineTextDownload.test.ts` で両 MIME、UTF-8 Blob 内の文字列、`.md` / `.txt` のローカル日時、禁止文字と `CON` 等の予約名、URL 作成→クリック→解放の順を検証する。`releasesUrlAfterClickFailure` ではクリック例外時に同じ object URL を `finally` で解放して例外を再送出する。Blob 生成例外と `URL.createObjectURL` 例外はクリックなし・成功なし。未生成 URL の解放は呼ばない。
- [x] **Step 7: `client` で `npm test -- --runInBand src/services/outlineExport/__tests__/outlineTextDownload.test.ts` の RED を確認し、`MapFileExtension` 拡張と `outlineTextDownload.ts` を実装して GREEN を確認する。** Blob は `new Blob([text], { type: format === "md" ? "text/markdown;charset=utf-8" : "text/plain;charset=utf-8" })`。object URL 作成後の `try/finally` 内で `<a download>` に `createMapFileName(mapName, format, now)` を設定して `click()` する。
- [x] **Step 8: Task 1 の2テストファイルをまとめて実行し PASS を確認する。**


実施記録: 初回API不在のRED→GREENを確認。後追加の上限・大規模境界は独立RED未観測で、初回からPASSした事実をTask1 reportに記録。

### Task 2: 専用通知と共通ヘッダーへの接続

**Files:**
- Create: `client/src/hooks/useOutlineExport.ts`
- Create: `client/src/hooks/__tests__/useOutlineExport.test.tsx`
- Create: `client/src/components/layout/OutlineExportControls.tsx`
- Create: `client/src/components/layout/__tests__/OutlineExportControls.test.tsx`
- Modify: `client/src/components/map/MapEditor.tsx`
- Modify: `client/src/components/map/__tests__/MapEditorOutline.test.tsx`
- Modify: `client/src/app/__tests__/pageOutlineEditor.test.tsx`（Home の実配線に必要な検証を追加。`page.tsx` の prop 変更は不要）

**Interfaces:**
- Consumes: Task 1 の `formatOutlineRows(model: OutlineRows, format: OutlineExportFormat): OutlineExportResult` と `downloadOutlineText(text: string, mapName: string, format: OutlineExportFormat, now?: Date): void`。`MapEditor` の既存 `outlineModel = useMemo(() => buildOutlineRows(nodes), [nodes])` を使う。
- Produces: `useOutlineExport({ model, mapName, downloadText? }: { model: OutlineRows; mapName: string; downloadText?: (text: string, mapName: string, format: OutlineExportFormat) => void }): { exportMarkdown: () => void; exportPlainText: () => void; notice: OperationNotice | null }`。`OutlineExportControls({ onExportMarkdown, onExportPlainText }: { onExportMarkdown: () => void; onExportPlainText: () => void })`。

- [x] **Step 1: フックの失敗テストを追加する。** `useOutlineExport.test.tsx` は `renderHook` / `act` と注入した `downloadText` spy を使用。`reportsStartOnlyAfterDownloadReturns` は両形式の文字列・mapName・format を確認し、成功文言を確認する。`reportsEmptyAndLimitWithoutDownload` は空と上限で downloader 未呼出し、警告文言を確認する。`reportsInvalidStructureAndGenerationFailure` は不正モデルと整形関数が投げる場合を用意し、形式別のエラーのみ確認する。`reportsFailureOnlyAfterDownloadException` は downloader がラベルを含む例外を投げた際に成功通知も例外本文も出さない。フックの `notice` は保存系統と独立して保持する。
- [x] **Step 2: `client` で `npm test -- --runInBand src/hooks/__tests__/useOutlineExport.test.tsx` の RED を確認し、フックを実装して GREEN を確認する。** `formatOutlineRows` の結果を `switch` で通知に変換し、`ok:true` の場合だけ downloader を呼ぶ。`try/catch` は整形・ダウンロード両方を覆い、正常復帰後だけ成功通知。通知は `useState<OperationNotice | null>` に保持し、保存通知へ流用しない。
- [x] **Step 3: ボタンの失敗テストを追加する。** `OutlineExportControls.test.tsx` で2ボタンの role 名とクリック先が一対一であることを確認する。ダイアログやモードごとの表示条件をこのコンポーネントへ持ち込まない。
- [x] **Step 4: `client` で `npm test -- --runInBand src/components/layout/__tests__/OutlineExportControls.test.tsx` の RED を確認し、`OutlineExportControls.tsx` を既存 `MapImageExportControls` と同じ操作群の見た目・`type="button"` で実装して GREEN を確認する。**
- [x] **Step 5: `MapEditorOutline.test.tsx` と Home テストへ実配線の失敗テストを追加する。** 既存の Pixi / ダウンロード mock パターンで `downloadOutlineText` を spy 化する。`exportsFullModelInBothModes` は map / outline で同じ正本由来テキストを渡し、折りたたみ・重要度フィルタで非表示の子も含むこと、既存 JSON と Undo/Redo の状態が変わらないことを確認する。`exportsDespiteSaveFailureOrProtectedStorage` は保存失敗通知がある時と保護モードの Home 実画面でクリックでき、各通知が別々に残ることを確認する。`respectsEditorInert` は外側ダイアログと取込み・枝移動ダイアログで根に `inert` が付き、閉じると外れることを確認する。jsdom の合成クリックでブラウザの `inert` 抑止を証明した扱いにせず、実ブラウザ項目としても確認する。通知成功はダウンロード spy 正常復帰後、例外時は失敗だけ。Home テストは `page.tsx` の `MapEditor` に props を追加するだけの架空の配線を避け、実際の `Home` → `MapEditor` → 共通ヘッダーを描画して確認する。
- [x] **Step 6: 上記2ファイルを対象に Jest の RED を確認し、`MapEditor.tsx` にフック、`OutlineExportControls`、`operationNotices` の専用枠を接続して GREEN を確認する。** `outlineModel` を作った後にフックへ渡す。ボタンは `viewMode` 条件の外、既存 JSON・画像ボタンの近くへ置く。`inert={!editorShortcutsEnabled}` の既存根に収め、保護モードで `disabled` にしない。外側ダイアログの挙動は `Home` の `shortcutsEnabled` を維持する。
- [x] **Step 7: 4テストファイルをまとめて実行して PASS を確認する。**

### Task 3: 文書、手動確認記録、ロードマップ、全検証

**Files:**
- Modify: `README.md`
- Modify: `client/README.md`
- Modify: `docs/README.md`
- Modify: `docs/architecture/overview.md`
- Modify: `docs/specifications/features.md`
- Modify: `docs/specifications/data-model.md`
- Modify: `docs/specifications/api.md`
- Modify: `docs/testing/browser-test-cases.md`
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes: Task 1 の `formatOutlineRows` / `downloadOutlineText` と Task 2 の `useOutlineExport` / `OutlineExportControls`、実際の Jest 結果。
- Produces: 利用者向け操作説明、技術契約、ブラウザ確認項目・実施状況、実装事実と一致する `ROADMAP.md`。

- [x] **Step 1: 文書の整合テストを先に作る。** 既存のドキュメントの章立て・相互リンク・候補004の記載を確認し、`rg` で Phase 15 を「進行中」とする箇所、候補005を未着手とする箇所、Phase 0〜14 など古い範囲表現を列挙する。この時点の検査結果を RED として記録する。必要な文書更新以外の自動スクリプトを追加しない。
- [x] **Step 2: 利用者向けと設計文書を更新する。** README 2件と `docs/specifications/features.md` に2ボタンの位置、形式、全件対象、空・上限・不正時の通知、取込み欄へ貼る手順と保証範囲、完全バックアップは JSON を使うことを記載。`docs/architecture/overview.md` と `docs/specifications/api.md` に正本→既存先行順モデル→長さ検査→整形→Blob→URL 解放→専用通知の境界を記載。`docs/specifications/data-model.md` に保存 V3 は不変でテキストには ID・属性がないことを記載。`docs/README.md` の索引・範囲説明を実装に合わせる。
- [x] **Step 3: `docs/testing/browser-test-cases.md` に Phase 15 書き出しの節を追加する。** map / outline、折りたたみ・フィルタ、保存失敗・保護モード、両形式のファイル名・内容、空・上限・ダイアログ `inert` を対象にする。使えるブラウザで観測できた項目だけ結果と環境を記す。ブラウザが使えない、またはダウンロード内容・保存完了を観測できない項目は「未確認」と明記し、既知の観測拒否を別経路で迂回しない。
- [x] **Step 4: `ROADMAP.md` を実装事実に合わせる。** 候補005を `[x]`、Phase 15 を「完了」にし、「現在地」に候補004・005完了、次は Phase 16 候補006「保存状態の表示」と記す。Phase 16 以降の未実装項目は `[ ]` のまま。最終更新は作業実施日 `2026-11-03`（日付が変わった場合はその日）にする。
- [x] **Step 5: `rg` で古い状態記述・壊れた相互リンク・テキスト形式の過大な可逆性主張が残らないことを確認する。** 文書内で「成功」をディスク保存完了と書かず、ブラウザのダウンロード開始に合わせる。
- [x] **Step 6: `client` ディレクトリで `npm run verify` を実行し、tailwind:scan・lint・typecheck・Jest・build のすべてが exit 0 で終わることを確認する。** 失敗したら当該 Task の実装サブエージェントへ修正を戻し、独立レビューを再実施してから再検証する。全 Task のレビュー後、最終の差分・文書・ブラウザ未確認項目を報告する。commit / push / PR は後続の dev-flow-kit 段階で行う。
