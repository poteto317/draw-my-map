# Draw My Map クライアント (`client/`)

Draw My Map の Web クライアントアプリケーションおよびバックエンド Route Handler です。  
高速な 2D グラフィックス描画エンジン **Pixi.js 8** と、最新の **React 19**（React Compiler `reactCompiler: true` 有効）/ **Next.js 16 (App Router)** を組み合わせ、滑らかで直感的なマインドマップ作成体験を提供します。

---

## クライアント概要

Draw My Map のフロントエンドおよびエッジバックエンドの主要な責務は以下のとおりです。

1. **キャンバス描画 (Pixi.js 8)**:
   - WebGL / 2D Canvas によるノードおよび滑らかなベジェ曲線エッジの高速レンダリング。
   - パン、ズーム、フォーカス（中央配置）、ノード同士のドラッグ＆ドロップ接続、子孫ノード連動ドラッグ移動（折りたたみで隠れた子孫も連動）、自動配置でのドラッグによる兄弟の並べ替え（挿入位置の線）。
   - 解像度フィルタリングと枝の折りたたみ・展開に連動する、滑らかなフェードイン・フェードアウト可視性アニメーション。
2. **UI 操作・インタラクション (React 19 & Tailwind CSS 4)**:
   - ツールバー、プロパティパネル、インラインテキスト編集、コンテキストメニューなどの DOM オーバーレイ UI。
   - キーボードショートカット（`Tab` で子ノード作成、`Enter` で兄弟ノード作成、`Delete`/`Backspace` で削除、`Alt`（`Option`）+ `↑` / `↓` で兄弟の順序変更、`Alt`（`Option`）+ `←` / `→` で階層の上げ下げ、`Alt`（`Option`）+ `Enter` で親ノードの挿入など）。
   - 編集履歴（ヘッダーの「元に戻す」「やり直す」と、`Ctrl`/`Cmd`+`Z`、`Ctrl`/`Cmd`+`Shift`+`Z`、`Ctrl`+`Y`）。最大100操作をメモリ上に保持し、リロードや JSON 読み込みで消去されます。
   - 枝の複製（ヘッダーの「枝を複製」）。選択ノードと全子孫（表示フィルターや折りたたみで隠れた子孫を含む）をアプリ内で複製し、複製全体を 1 操作として Undo / Redo できます。
   - 枝のコピー＆ペースト（`Ctrl`/`Cmd`+`C`、`Ctrl`/`Cmd`+`V`）。選択ノードと全子孫を専用形式でクリップボードへコピーし、別タブや別マップを含めて新しいルートとして貼り付けます。コピーは隠れた子孫を含み、複製・貼り付けとも折りたたみ指定は引き継がず展開した状態で追加します。入力欄や文字選択中はブラウザの動作を優先し、貼り付け全体を 1 操作として Undo / Redo できます。
   - ヘッダーのノード検索。NFKC正規化と大文字・小文字を区別しない部分一致で現在の `nodes` を同期検索し、配列順に最大50件と総件数を表示します。`↑` / `↓`・`Enter`・`Escape` に対応し、隠れたノードの表示モード切り替え・閉じた祖先の展開と中央移動を行います。検索操作は編集履歴に追加しません。
   - 枝の折りたたみ・展開。選択した親は残して全子孫を隠し、解像度フィルターとの積集合を描画します。閉じた親へ `Tab` で子の追加に成功したときだけ、その親を展開します。閉じた親への接続では親を開かず、接続した子は隠れて選択が外れます。削除・コピー・複製と、手動配置での閉じた親のドラッグは隠れた子孫も対象にします（詳細は [features.md の 10.4 節](../docs/specifications/features.md#104-既存の編集操作との関係)）。検索結果の選択時は必要な祖先だけを展開します。折りたたみ状態は表示専用で、文書の読み込み・復元・成功した Undo / Redo 後に全展開へ戻ります。
   - 重要度フィルタリングの手動切り替えやレイアウトモード切り替え（手動配置 / ツリー自動配置）。
   - 複数マップ（Phase 12）。ヘッダーの「マップ一覧」「新しいマップ」から開くモーダルダイアログで、名前を付けたマップの作成・一覧からの切り替え・名前変更・削除（確認付き）を行います。最上位の `Home`（シェル）が `useMapLibrary` で一覧と切り替えを持ち、編集画面の `MapEditor` を `key={マップの id}:{storageMode}` で作り直すため、切り替えると編集履歴・表示状態・エディタ内の非同期処理の結果は前のマップから引き継ぎません。ダイアログの表示中は `MapEditor` を `inert` にし、マップのショートカットを止めます（詳細は [features.md の 12 章](../docs/specifications/features.md#12-複数マップ)）。
   - 箇条書きからの追加（Phase 13）。ヘッダーの「箇条書きから追加」で開くダイアログで、インデント付きの箇条書きテキストを解析し（`domain/outline/` の `parseOutlineText`。タブ・半角スペース・全角スペースの深さ、行頭の記号と番号の除去、階層の補正と警告、1,000,000文字・空行を除いて10,000行の上限）、先頭200件のプレビューを確かめてから、新しいルート（森）または開いた時点で選択していたノードの子として追加します。挿入は `domain/nodes/nodeForestInsertion.ts` の `insertNodeForest` で、`useNodes.insertForest` が `applyTreeChange` を1回だけ呼ぶため、取り込み全体を 1 操作として Undo / Redo できます。ダイアログの状態は `useOutlineImport` が持ち、表示中は `MapEditor` を `inert` にしてショートカットを止めます。成功は操作通知バーの8系統目、失敗はダイアログの中に出します（詳細は [features.md の 13 章](../docs/specifications/features.md#13-箇条書きからの追加)）。
   - 兄弟ノードの順序変更（Phase 14）。ヘッダーの「上へ」「下へ」と `Alt`（`Option`）+ `↑` / `↓` で、選択ノードの枝を同じ親の見えている兄弟（ルート同士を含む）の中で1つ上・1つ下へ移し、自動配置ではノードのドラッグで兄弟の間へ移します（挿入位置に青い線）。規則は `domain/nodes/nodeSiblingOrder.ts`（`reorderSiblingNodes`）と、手動配置の縦位置の入れ替えの `nodeSiblingSwapPlacement.ts`（`swapSiblingBranchPositions`）で、`useNodes.reorderSibling` が `applyTreeChange` を1回だけ呼ぶため、1回の並べ替えを 1 操作として Undo / Redo できます。ボタンの状態は `useSiblingReorderAction` が持ち、通知は `MapEditor` が持つ操作通知バーの9系統目の枠（枝の構造の変更の通知。並べ替え・階層の上げ下げ・親の挿入・同じマップ内の枝の移動で共有）へ `publishNotice` で出します（詳細は [features.md の 14 章](../docs/specifications/features.md#14-兄弟ノードの順序変更)）。
   - 階層の上げ下げ（Phase 14）。ヘッダーの「階層を上げる」「階層を下げる」と `Alt`（`Option`）+ `←` / `→` で、選択ノードの枝を、元の親の兄弟（元の親の直後）にするか、見えている直前の兄弟の子の末尾にします。規則は `domain/nodes/nodeIndent.ts`（`changeNodeIndent`。兄弟の走査は並べ替えと共通の `nodeSiblingNeighbors.ts`）と、手動配置の平行移動の `nodeIndentPlacement.ts` で、`useNodes.changeNodeIndent` が `applyTreeChange` を1回だけ呼ぶため、1回の上げ下げを 1 操作として Undo / Redo できます。ボタンの状態、下げたときの新しい親の展開、通知の発行は `useNodeIndentAction` が持ち、通知は並べ替えと共有する操作通知バーの9系統目（枝の構造の変更の通知）に出します（詳細は [features.md の 15 章](../docs/specifications/features.md#15-階層の上げ下げ)）。
   - 途中への親ノード挿入（Phase 14）。ヘッダーの「親を挿入」と `Alt`（`Option`）+ `Enter` で、選択ノードと親の間に新しいノードを1つ入れ、選択ノードの枝を新しいノードの唯一の子にします。新しいノードは選択ノードの元の位置と重要度を引き継ぎ、挿入の直後にラベルの入力欄が開きます。規則は `domain/nodes/nodeParentInsertion.ts`（`canInsertParentNode`・`insertParentNode`）と、新しいノードの値の `nodePlacement.ts`（`createParentNode`）で、手動配置の平行移動は上げ下げと共通の `nodeIndentPlacement.ts` を使います。`useNodes.insertParentNode` が `applyTreeChange` を1回だけ呼ぶため、1回の挿入を 1 操作として Undo / Redo できます。ボタンの状態と通知は `useNodeParentInsertionAction` が持ち、成功したときは通知を出さず枠を空にして、`MapStage` の `useNodeLabelEditRequest` がラベルの編集を始めます。失敗の通知（「親ノードを挿入できませんでした。」）は並べ替え・上げ下げと共有する9系統目に出します。`Enter` の押し続けでは、兄弟の追加も親の挿入も1回だけです（詳細は [features.md の 16 章](../docs/specifications/features.md#16-途中への親ノード挿入)）。
   - ノードだけ削除（Phase 14）。「親を挿入」の直後の「ノードだけ削除」で選択1個を削除し、隠れた子孫も残します。純粋候補は `domain/nodes/nodeOnlyDeletion.ts`、1回の構造確定・履歴・選択は `useNodes.deleteNodeOnly`、有効状態と既存9系統目への通知は `useNodeOnlyDeletionAction`、表示と連続起動の抑止は `NodeOnlyDeleteControl` が担当します。手動配置では座標維持、自動配置では再配置し、保存形式はV3のままです。`Delete` / `Backspace` の枝削除は従来どおりです（[機能18章](../docs/specifications/features.md#18-ノードだけ削除)、[API9章](../docs/specifications/api.md#9-ノードだけ削除のクライアントapi)）。実ブラウザは [U節](../docs/testing/browser-test-cases.md#phase-14-ノードだけ削除) の中間・葉・根、隠れた子、保存再読み込み、キー操作・フォーカス・従来削除の手順で確認します（未実施）。
   - 枝の切り取り・移動（Phase 14）。ヘッダーの「枝を移動」のダイアログで、選択ノードと全子孫を同じマップの別の親・新しいルート、または別のマップの新しいルートへ移す。同一マップは 1 回で Undo / Redo でき、別のマップはジャーナルで保護して書き、成功の後に移動先を開く。
   - アウトライン表示・編集（Phase 15）。ヘッダーの「マップ」「アウトライン」切り替えで、同じマップを階層的な文章として表示・編集します。折りたたみや重要度に関係なく全ノードを表示し、ラベル編集、ルート・子・兄弟の末尾追加、兄弟順序変更、階層変更、子孫を残すノードだけ削除に対応します。選択は右のイラストパネルと共通です（詳細は [features.md の 19 章](../docs/specifications/features.md#19-アウトライン表示編集)）。
3. **データ永続化とエクスポート (Domain & Services)**:
   - `localStorage` へのマップごとの変更後300msの自動保存と復元。マップの一覧（インデックス）を `draw-my-map.maps.v1`、各マップの本体（Version 3 の JSON）を `draw-my-map.maps.v1.doc.<id>` に保存し、`localStorage` を直接読み書きするのは `services/persistence/mapLibraryStorage.ts` だけです（枝の移動のジャーナルの書き込みと復旧の `branchMoveTransaction.ts` と、移動の前のインデックスの読み取り `mapBranchTransfer.ts` の `readBranchMoveIndex` は、注入された storage を直接呼びます）。Phase 11 までの単一のキー `draw-my-map.map.v1` は、起動時に1件のマップとして移行し、次の起動で消します。保存はセッション番号で照合し、切り替えの後に前のマップの保存待ちが届いても書き込みません。
   - `useMapStorageAutoSave` は現在のマップ本体の復元由来・確認済み snapshot・書き込み結果、および複数タブ競合状態から9種類の保存状態を導き、`MapSaveStatus` がヘッダーに常設表示します（通常状態のほか、別タブでの更新・削除時には警告バッジ「競合が発生しました」「削除されました」を表示）。競合検知時は自動保存タイマーを即座にブロックします（[機能仕様 6.1 節](../docs/specifications/features.md#61-localstorage-自動保存)）。
   - 複数タブの編集競合検出（Phase 16 候補008）。`services/persistence/storageEventHub.ts` による `storage` イベント監視と、`writeBody` 直前の楽観ロック照合により、別タブでの更新・削除を早期検知します。未保存データをメモリ上で保護したまま、操作通知バー（10系統目）から「別名で保存（flush バイパス）」、「最新の内容を読み込む（破棄確認付き）」、「JSON書き出し」を選択できます（詳細は下記の「複数タブの編集競合検出」および [features.md の 21 章](../docs/specifications/features.md#21-複数タブの編集競合検出)）。
   - `MapDocument` JSON 形式でのインポート / エクスポート（旧バージョン互換性・自動マイグレーション対応）。
   - 高解像度 PNG および ベクター SVG 形式での画像エクスポート。
   - map / outline 共通ヘッダーの「Markdown書き出し」「箇条書き書き出し」で正本の全ノードを `.md` / `.txt` の UTF-8 テキストとしてダウンロード開始。折りたたみ・表示フィルター・保存失敗・保護モードによらず全件を対象にします。空・100万 UTF-16 文字超過・不正構造では通知します。出力は「箇条書きから追加」へ貼り付けられます。正しい構造・非空ラベル・10,000行以下では件数・親子・順序を復元できますが、ID・座標・サイズ・重要度・イラスト・履歴・マップ名は保持しません。開いている1マップの完全な保存には個別 JSON、全マップの保存には一括 JSON を使います（[仕様](../docs/specifications/features.md#20-markdown箇条書きへの書き出し)）。
   - 自動配置の折りたたみ中は表示用投影座標を使用し、正本の全ノードと保存座標は維持します。JSON、`localStorage`、PNG / SVG は正本の全件を扱い、手動配置へ戻すと保存座標を表示します。
4. **AI イラスト生成 API (Next.js Route Handler)**:
   - `POST /api/illustrations` エンドポイントによる Cloudflare Workers AI 連携。
   - 日本語ノードテキストの自動英訳（`@cf/meta/m2m100-1.2b`）と画像生成（`@cf/black-forest-labs/flux-1-schnell`）。
   - クライアント側での 128px JPEG 縮小とノードへの紐付け・再生成・削除。

---

## 全マップのバックアップと追加復元

ヘッダーの「JSON書き出し」「JSON読み込み」は現在の1マップ用です。「マップ一覧」の「全マップをバックアップ」は、保存中の一覧と現在 editor の最新内容から、全マップを平文 JSON 1ファイルにまとめます。別マップの本体欠損は確認画面で名前・件数を示し空マップとして含め、孤立本体は件数を示して除外します。「バックアップから復元」は内容を確認して各マップを新しい ID で追加し、既存データと現在 editor を保ちます。上限は32 MiB・1000マップです。実ブラウザの確認手順は [ブラウザテスト Y 節](../docs/testing/browser-test-cases.md#y-全マップの一括バックアップ追加復元phase-16候補007) を参照してください。

責務は `domain/mapLibrary/libraryBackupCodec.ts`（形式・上限）、`services/persistence/libraryBackupExport.ts`（一覧・本体・最新 snapshot）、`libraryBackupFile.ts`（読込とダウンロード）、`libraryRestoreJournal.ts`・`libraryRestoreTransaction.ts`（追加復元と起動復旧）、`hooks/useMapLibrary.ts`（session 照合と操作順）、`useMapLibraryDialogState.ts`（確認画面・通知・フォーカス）に分けています。初回の本体復元が失敗した場合は、同じ editor mount で本体が実際に保存されるまで一括操作を受け付けません。復旧できない保存失敗では保護モードになり、現在マップの個別 JSON 書き出しを案内します。

---

## 複数タブの編集競合検出

同一ブラウザの複数タブで Draw My Map を開いているとき、別タブでのマップ更新・削除によって未保存データが黙って上書きされたり、古い状態の自動保存で別タブの最新内容を消去してしまう事故を防ぎます。実ブラウザの確認手順は [ブラウザテスト Z 節](../docs/testing/browser-test-cases.md#z-複数タブの編集競合検出phase-16候補008) を参照してください。

- **二重防御メカニズム**:
  1. `services/persistence/storageEventHub.ts` が window の `storage` イベントを購読し、`hooks/useStorageConflictMonitor.ts` が `sessionNumber`（セッション世代）の照合を行った上で `domain/mapLibrary/mapConflict.ts`（`classifyStorageChange`）により本体の更新・削除を早期検知します。
  2. `mapLibrarySession.ts` 内で `lastPersistedSnapshotRef` を保持し、`writeBody` 実行直前にもストレージ上の最新値と照合する楽観ロック検証を行います。不一致時は `{ status: "conflict" }` を返して書き込みを中止し、自動保存タイマーを停止します。
- **UI と解決手段**:
  - `MapSaveStatus` に `"conflict"`（「競合が発生しました」）または `"externallyDeleted"`（「削除されました」）の赤色警告バッジを常設表示。
  - 操作通知バー（`MapOperationNotice` 10系統目）に `MapConflictNotice` を表示し、以下の手段を提供します:
    - **別名で保存**: 旧マップへの flush を完全にバイパス（知見 L-061）し、新マップ名（例: `<マップ名>（退避）`）で新規マップとして安全に退避保存して切り替えます。
    - **最新の内容を読み込む**: 未保存編集がある場合は `MapConflictConfirmDialog` で破棄確認（初期フォーカスは安全側のキャンセル、キーリピート抑止）を行った上で最新データを読み込みます。未保存編集がない場合は確認ダイアログなしで即座に読み込みます。
    - **JSON書き出し**: 現在のメモリ上のドキュメントを即座にローカルへダウンロードします。
- **既存全操作のガード**: 競合中におけるマップ切り替え（`switchMap`）、枝の別マップ移動（`moveBranchToMap`）、一括追加復元（`confirmRestore`）は安全に中断・拒否し、新規作成（`createMap`）は旧マップ flush を安全にバイパスして遷移します。

---

## 利用可能な npm スクリプト一覧

`package.json` に定義されている開発・ビルド・検証スクリプトの一覧です。

| コマンド | 内容・目的 |
|---|---|
| `npm run dev` | Turbopack を使用して開発サーバーを起動します（デフォルト: `http://localhost:3000`）。ソースコード変更時の高速ホットリロードに対応しています。 |
| `npm run build` | Next.js の本番向けプロダクションビルドを実行します。ページの静的最適化やサーバーサイドバンドルの生成を行います。 |
| `npm start` | `npm run build` で作成された本番ビルドのサーバーを起動します。 |
| `npm run lint` | ESLint によるコード静的解析を実行します。コードスタイルや潜在的なバグ、React ルールの違反を検出します。 |
| `npm run typecheck` | TypeScript コンパイラ (`tsc --noEmit`) を実行し、コードをビルドせずにプロジェクト全体の型検査を行います。 |
| `npm run tailwind:scan` | Tailwind CSS 4 CLI (`@tailwindcss/cli`) を使用して、`./src/app/globals.css` とテンプレートからユーティリティクラスをスキャン・抽出します。 |
| `npm test` | Jest によるユニットテストおよびコンポーネントテストを実行します (`jest --passWithNoTests`)。テスト未定義時もエラーになりません。 |
| `npm run verify` | CI / コミット前の一括検証スクリプトです。Tailwind スキャン → ESLint → 型検査 → Jest テスト (`--runInBand`) → 本番ビルド を順番に実行し、すべて成功するか検証します。 |

---

## ディレクトリ構成とレイヤードアーキテクチャ

本クライアントは、**単一責任原則（SRP: Single Responsibility Principle）**に基づき、責務と依存関係を明確に分離したレイヤードアーキテクチャを採用しています。

```text
client/src/
├── app/                  # Next.js App Router (ページ、レイアウト、Route Handler)
│   └── testing/          # ページ (Home) の結合テストの共通ヘルパーと jest.mock 用のモックの中身 (pageTestHelpers, pageModuleMocks)
├── components/           # React UI コンポーネント (DOM オーバーレイ & Pixi キャンバス)
│   ├── layout/           # アプリケーション全体のレイアウト、ヘッダー、パネル、ダイアログ
│   ├── map/              # キャンバスコンテナ、Pixi シーンレンダラー、操作コーディネーター
│   └── outline/          # 階層アウトライン編集ビュー、ツールバー
├── config/               # 定数設定 (ノード形状、初期値、スタイル、イラスト設定)
├── domain/               # フレームワーク非依存の純粋ビジネスロジック (コアロジック)
│   ├── clipboard/        # 枝のクリップボード専用形式の書き出し・検証
│   ├── history/          # 編集履歴（Undo / Redo）の純粋な遷移
│   ├── illustration/     # イラストのトリミング、プロンプト加工、データ URL 処理
│   ├── imageExport/      # PNG / SVG エクスポート用の境界計算、ベクター座標計算
│   ├── mapLibrary/       # 複数マップのインデックスの型・解析・更新、起動の計画、マップ名とファイル名の規則、一括バックアップ、複数タブ競合判定・通知文言
│   ├── nodes/            # ノードツリー操作、重なり判定、自動レイアウト、重要度判定、枝の折りたたみと表示用の配置、手動配置の共通規則、箇条書きの森の挿入、兄弟ノードの順序変更（並べ替え・手動配置の縦位置の入れ替え・通知の文言）、階層の上げ下げ（規則・手動配置の平行移動・通知の文言。兄弟の走査は並べ替えと共有）、途中への親ノード挿入（規則・失敗の通知の文言。手動配置の平行移動は上げ下げと共有）
│   ├── outline/          # 箇条書きのテキストの解析（上限・行の分割・ラベル・階層）、プレビュー用の木、文言
│   ├── search/           # ノードラベルの正規化・索引化・部分一致検索、検索結果の祖先展開の判定
│   ├── shared/           # 外部入力（unknown）を as のキャストなしで読む型ガード（isRecord・readProperty）
│   └── persistence/      # MapDocument スキーマ定義、エンコード/デコード、移行処理
├── hooks/                # React カスタムフック (状態管理、UIとドメインの仲介)
├── server/               # サーバーサイド処理 (Route Handler から呼び出されるサービス)
│   └── illustration/     # Cloudflare Workers AI クライアント、翻訳、プロンプト生成
├── services/             # 外部環境との入出力・副作用アダプター (ブラウザ / Web API)
│   ├── illustration/     # Route Handler クライアント、サムネイル縮小処理
│   ├── imageExport/      # DOM Canvas / SVG のラスタライズとファイルダウンロード
│   ├── outlineExport/    # Markdown / 箇条書きテキストファイルダウンロード
│   └── persistence/      # localStorage 読み書き（mapLibraryStorage.ts が中心）、storage イベント監視、バックアップ・復元、枝の移動、起動の実行、マップ id の生成、JSON ファイルリーダー/ダウンローダー
├── testing/              # テスト用ヘルパー、モック、フィクスチャ (createTestNode, jpegFixture, createTestStorageSession, mapLibraryTestStorage)。ページの結合テスト専用のものは app/testing/
└── types/                # アプリケーション共通の TypeScript 型定義
```

### 各レイヤーの責務と依存ルール

- **Domain (`src/domain/`)**:
  - React や DOM、Next.js などの外部フレームワークに一切依存しない純粋な TypeScript ロジックです。
  - 状態変更関数や計算アルゴリズムはイミュータブルで副作用を持たず、高いテスト容易性を確保しています。
- **Services (`src/services/`)**:
  - ブラウザ API（`localStorage`, Canvas DOM, `Blob`, `URL.createObjectURL`, `File.text()` 等）やネットワーク通信などの副作用を抽象化するアダプター層です。
- **Hooks (`src/hooks/`)**:
  - React の状態（State）を管理し、Domain ロジックの呼び出しと Services の副作用をオーケストレーションします。
  - 各フックは単一の関心事（ノード管理、永続化、エクスポート、フィルタリングなど）に分割されています。
- **Components (`src/components/`)**:
  - 表示とユーザー入力の受付を担当します。ビジネスロジックは Hooks や Domain に委譲し、コンポーネント自身はプレゼンテーションに専念します。
- **Server (`src/server/`)**:
  - Next.js Route Handler (`src/app/api/`) から呼び出されるサーバー専用の処理です。API キーなどの機密情報を安全に扱い、外部 AI サービスと通信します。

---

## 環境変数の設定（AI イラスト生成）

ノードのイラスト自動生成機能は、Cloudflare Workers AI（FLUX.1 schnell）を利用します。  
機能を利用するには、Cloudflare の認証情報の設定が必要です。

### 1. 設定手順

1. [Cloudflare](https://dash.cloudflare.com/sign-up) でアカウントを作成します（無料プランで利用可能です）。
2. ダッシュボードで API トークンを作成します（権限: `Workers AI - Read` および `Workers AI - Edit` を含める）。
3. Workers AI ページ等で「Account ID」を確認します。
4. `client/.env.example` を `client/.env.local` にコピーし、値を入力します。
   ```bash
   cd client
   cp -n .env.example .env.local
   ```
5. `.env.local` をエディタで開き、2つの変数を設定します:
   ```env
   CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id
   CLOUDFLARE_API_TOKEN=your_cloudflare_api_token
   ```
6. 開発サーバー（`npm run dev`）を再起動します（環境変数は起動時に読み込まれます）。

※より詳細な画面キャプチャ付きの手順については、[イラスト生成環境構築ガイド](../docs/setup/illustration-generation-setup.md) を参照してください。

### 2. 無料枠について

- Cloudflare Workers AI の無料プランには、**1日あたり 10,000 Neurons** の上限があります（毎日 0:00 UTC / 日本時間 午前 9:00 にリセット）。上限超過時はエラーとなり、無料プランのままなら自動課金は発生しません。
- FLUX.1 schnell（4 ステップ）の生成 1 枚あたりの消費量は約 172.8 Neurons（実測値）であり、**1 日あたり約 57 枚** の生成が可能です。
- 日本語ノードテキストは Cloudflare の多言語翻訳モデル（`@cf/meta/m2m100-1.2b`）で自動英訳されてから画像生成されます。翻訳の消費量は 1 回あたり 0.3〜0.5 Neurons 程度と極めてわずかです。
- NSFW フィルターの誤判定対策として最大 3 回（再試行 2 回）の自動リトライを行います。再試行が発生した場合はその分無料枠を消費します。最悪の場合、1 回の生成クリックで最大 3 回分の生成枠を消費する可能性があります。
- 最新の料金や無料枠の詳細は、Cloudflare 公式の [料金ページ](https://developers.cloudflare.com/workers-ai/platform/pricing/) で確認してください。

### 3. 公開時の注意

- 本機能は **ローカル開発環境専用** です。認証情報を入れたまま、インターネット上の公開 URL へデプロイしないでください。
- 現状のイラスト生成 API ルート（`POST /api/illustrations`）には、認証・Origin チェック・レート制限がありません。公開デプロイすると無料枠の消費につながるため、インターネット公開の前にこれらの対策が必須です（詳細はリポジトリ直下の `SECURITY.md` と `docs/specifications/api.md` の第 7 章）。
- Cloudflare アカウントは **Workers Free プラン** を使用してください（Workers Paid プランでは無料枠を超過した分が Neuron 単位で従量課金されます）。
- ブラウザがリクエストを中断しても、サーバー側の上流 API 呼び出し（翻訳および生成）は即座には中断されず、無料枠を消費する可能性があります。

### 4. 生成したイラストの扱い

- 生成されたイラストは右パネルの「ノードに設定」で選択中のノードに紐付けられます。
- 紐付けられたイラストは自動的に 128px の JPEG に縮小・最適化され、マップの保存データ（`localStorage` および JSON エクスポート `version: 3`）に埋め込まれます。
- PNG および SVG の画像エクスポートにもイラストが含まれます。
- すでにイラストがあるノードでは、右パネルのボタンが「イラストを再生成」に切り替わり、プレビュー確認後に置き換えが可能です。
- 右パネルの「設定済みのイラストを削除」でノードからイラストを削除でき、ノードの高さは元に戻ります。
- `localStorage` の容量上限（通常約 5MB）はすべてのマップで共有します。イラストデータ付加などで上限に達した場合は、「ブラウザへ自動保存できませんでした。不要なマップを削除するか、JSONで書き出してください。」と通知され、マップの切り替えと新規作成も中止されます。その場合は不要なマップを削除するか、「JSON書き出し」機能で手動バックアップを行ってください。開いていない別のマップを削除すると、空いた容量へ保存待ちの変更を書き込み直します。

### 5. 認証情報の扱い

- API トークンおよびアカウント ID はサーバー側（Next.js Route Handler）でのみ環境変数から読み込まれ、クライアント（ブラウザ）へは一切送信されません。
- `client/.env.local` は `client/.gitignore` に指定されており、Git の追跡対象外となっています。認証情報を Git コミットに含めないようご注意ください。
- API トークンは **Workers AI に必要な権限だけ** を付与してください。リポジトリを公開したあとにトークンがチャットやスクリーンショットへ漏れた可能性がある場合は、トークンを再発行して古いものを失効させてください。

---

## テストと検証方針

Draw My Map では、コードの信頼性と保守性を維持するため、以下の開発方針を徹底しています。

### 1. 単一責任原則 (SRP) とモジュール分割
- 1つの関数・フック・コンポーネント・ファイルに複数の責務を持たせず、関心事ごとに細かく分割します。
- 状態管理、幾何計算、DOM イベントハンドリング、レンダリング、外部通信を別モジュールに分離することで、単体テストを容易にしています。

### 2. テスト駆動開発 (TDD) とテストハーネス構成
- 機能追加やバグ修正時は、実装コードを書く前に対応するテストケース（Jest + React Testing Library）を記述します。
- 失敗するテスト（RED）を確認した後に実装を行い、テストがパスすること（GREEN）を確認してからリファクタリングを行います。
- **Jest テスト環境 (`jest.config.ts` / `jest.setup.ts`)**:
  - `next/jest` + `jest-environment-jsdom` 環境（パスエイリアス `@/*` 対応、`@testing-library/jest-dom` 読み込み）。
- **共通テストフィクスチャ & Pixi テストハーネス**:
  - `src/testing/createTestNode.ts` / `src/testing/jpegFixture.ts`: テスト用 `Node` ファクトリおよび有効な JPEG SOF0 バイナリ・Data URL フィクスチャ。
  - `src/testing/createTestStorageSession.ts` / `src/testing/mapLibraryTestStorage.ts`: フックのテスト用の偽の `MapStorageSession`、ページのテスト用にインデックスと本体を書き込む `seedMapLibrary`・現在のマップの本体を読む `readActiveMapJson`・書き込みの順序を記録する偽の `Storage`。
  - `src/components/map/pixi/testing/pixiTestHarness.ts`: WebGL 非対応の JSDOM 上で Pixi.js シーン構築・ストローク・イベント発火を検証するフェイク Pixi ランタイム。
  - `src/components/map/testing/mapStageTestRuntime.tsx` / `AutoLayoutMapStageHarness.tsx`: `MapStage` コンポーネント結合テスト用のランタイム注入・自動レイアウト検証ハーネス。
  - `src/components/map/testing/treeEditShortcutTargets.ts`: 兄弟の順序・階層のショートカットの共通ガードの target の条件を確かめるテストで共有する、キー入力の送り先の要素の補助（`insideOf`・`buttonInsideMarkedElement`）。
  - `src/app/testing/pageTestHelpers.tsx`: `Home` を本物の `MapEditor`・`MapStage` まで通すページの結合テストで共有する補助。描画してキャンバスの枠を固定する `renderPage`、`stageContainer`・`undoButton`・`redoButton`・`dialog`・`headerButton`、ノードを選択する `selectNode`、JSON 書き出しと保存の本体を読む `exportedMap`（`downloadMapJson` のモックを引数で受け取る）・`storedMap`、V3 の JSON を作る `v3Json`・`v3JsonFromLabels` と型 `ExportedNode`・`ExportedMap`。
  - `src/app/__tests__/page*.test.tsx`: `Home` を本物の `useMapLibrary`・`MapEditor`・`MapStage`・`localStorage` まで通すページの結合テスト。保存と再読み込みの往復（自動保存した内容が戻ること、折りたたみ・表示の絞り込みを保存しないこと、削除・切り替えが再読み込み後も保たれること）は `pageSaveReload.test.tsx` にまとめる。
  - `src/app/testing/pageModuleMocks.ts`: ページの結合テストの `jest.mock` のファクトリから `jest.requireActual` で読むモックの中身（Pixi の標準形 `createPagePixiModuleMock`、文字幅の測定 `createMapTextMeasurementModuleMock`）。`jest.mock` は巻き上げられるため、ファクトリは `jest.requireActual` 経由でだけ外部の関数を使える。`@/app/page`・`pixi.js` を import しない。

### 3. 検証コマンドの一括実行 (`npm run verify`)
- コードを変更した後は、必ず `client` ディレクトリで以下の検証コマンドを実行してください:
  ```bash
  npm run verify
  ```
- このコマンドにより以下の全工程が一括検証されます:
  1. **Tailwind スキャン**: CSS クラスの構文と整合性を確認
  2. **ESLint**: コーディング規約違反や潜在的バグを検出
  3. **TypeScript 型チェック**: 型の整合性を厳格に検査
  4. **Jest テスト**: ユニットテスト・結合テストを順次実行（全テストケース通過を確認）
  5. **本番ビルド**: Next.js アプリケーションが正常にビルドできることを保証

---

## 関連ドキュメント

- [リポジトリ ルート README](../README.md): プロジェクト全体のビジョン・全体クイックスタート
- [開発者向けガイド](../docs/development/developer-guide.md): 新しく参加する開発者向けのセットアップ・主要な流れ・テストの書き方・よくある落とし穴
- [ドキュメントポータル](../docs/README.md): ドキュメント全体の目次・ガイド
- [システムアーキテクチャ概要](../docs/architecture/overview.md): Pixi.js と React の協調モデル、設計原則
- [機能仕様・操作マニュアル](../docs/specifications/features.md): ショートカット、ノード操作、フィルタリング仕様
- [データモデル・永続化仕様](../docs/specifications/data-model.md): `MapDocument` JSON スキーマと、複数マップの `localStorage` 保存仕様
- [イラスト生成 API 仕様](../docs/specifications/api.md): Route Handler エンドポイント仕様
- [イラスト生成環境構築ガイド](../docs/setup/illustration-generation-setup.md): Cloudflare 設定の詳細手順書
