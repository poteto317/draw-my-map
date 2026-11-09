# Draw My Map ドキュメントポータル

Draw My Map の設計・仕様・環境構築・テスト・開発運用に関するドキュメントの総合案内です。  
システムの全容を理解し、安全に拡張・保守できるように各領域のドキュメントを整理しています。

---

## ドキュメント一覧

### 0. はじめての方へ

- **[開発者向けガイド](development/developer-guide.md)** (`docs/development/developer-guide.md`)
  - 新しく参加する開発者向けの入口。セットアップ、よく使うコマンド、作業の進め方。
  - 主要な流れ（レイヤーと依存の向き、`Home` と `MapEditor` の分担、`applyTreeChange` による1操作の編集、保存と読み込み、イラスト生成）。
  - テストの書き方（置き場所と名前、レイヤーごとの書き方、共通の補助、失敗経路のテスト、特性テスト）。
  - よくある落とし穴（外部入力を `as` で型付けしない、コールバック内の代入と型の絞り込み、Pixi.js と jsdom、`localStorage` の窓口、表示専用の状態、非同期の結果の照合、IME、React Compiler、`never` による網羅性）。

### 1. アーキテクチャ・設計

- **[システムアーキテクチャ概要](architecture/overview.md)** (`docs/architecture/overview.md`)
  - React 19（DOM / 状態管理）と Pixi.js 8（2D WebGL / Canvas）の協調レンダリングモデル。
  - レイヤードアーキテクチャ（Domain, Services, Hooks, Components, Server, Config, Types）の責務と依存関係。
  - 単一責任原則（SRP）に基づくモジュール分割とデータフロー図（Mermaid）。
  - 複数マップのシェル（`Home`）と編集画面（`MapEditor`）の分担、`useMapLibrary`・`mapLibraryStorage`・`domain/mapLibrary/` の責務、セッション番号による保存先の照合。
  - 箇条書きからの追加の流れ（`domain/outline/` の解析、`nodeForestInsertion.ts`・`nodeManualPlacement.ts`、`useOutlineImport`、`useNodes.insertForest` の1回の commit）。
  - アウトライン書き出しの流れ（正本から先行順モデル、長さ検査、Blob、URL 解放、専用通知）。
  - 兄弟の順序変更の流れ（`nodeSiblingOrder.ts`・`nodeSiblingSwapPlacement.ts`、`useSiblingReorderAction`、`useNodes.reorderSibling` の1回の commit、自動配置の並べ替えのジェスチャー）。
  - 階層の上げ下げの流れ（`nodeIndent.ts`・`nodeIndentPlacement.ts`・`nodeSiblingNeighbors.ts`、`useNodeIndentAction`、`useNodes.changeNodeIndent` の1回の commit、下げたときの新しい親の展開、並べ替えと共有する枝の構造の変更の通知）。
  - 親の挿入の流れ（`nodeParentInsertion.ts`・`nodeParentInsertionMessages.ts`・`nodePlacement.ts` の `createParentNode`、`useNodeParentInsertionAction`、`useNodes.insertParentNode` の1回の commit と新しいノードの選択、成功したときの `clearNotice` とラベルの編集の要求（`useNodeLabelEditRequest`）、失敗の通知、並べ替え・上げ下げと共有する枝の構造の変更の通知）。
  - 一括バックアップ・追加復元の流れ（ファイル形式、editor snapshot、専用ジャーナル、起動復旧と保護モード、ダイアログの画面遷移）。
  - 枝の移動の流れ（`nodeBranchMove.ts`、`useBranchMoveDialog`、`useNodes.moveBranch` の1回の commit、`useMapLibrary.moveBranchToMap` のセッションの調整、`branchMoveTransaction.ts` のジャーナル、再マウントの後の通知とフォーカス）。

### 2. 仕様書・マニュアル

- **[機能仕様・操作マニュアル](specifications/features.md)** (`docs/specifications/features.md`)
  - Phase 0〜15と Phase 16 候補006・007で実装された機能の詳細仕様。Phase 14 の構造編集は14〜18章（兄弟順序・階層・親挿入・枝移動・ノードだけ削除）。
  - キャンバス操作（パン、ズーム、フォーカス）、ノード操作（作成、編集、削除、子孫連動移動、ドラッグ接続）。
  - 自動レイアウトアルゴリズム、解像度フィルタリング（重要度とヒステリシス制御）。
  - AIイラスト生成（プロンプト生成、ノード紐付け、縮小、再生成、削除）。
  - 編集履歴（Undo / Redo、ドラッグの1操作化、最大100操作）。
  - 枝の複製（選択ノードと子孫の複製、配置、1操作での Undo / Redo）。
  - 枝のコピー＆ペースト（専用形式、Ctrl/Cmd+C・V、入力優先、上限、貼り付け後の配置と Undo / Redo）。
  - ノード検索（NFKC正規化、最大50件と総件数、キー操作、隠れたノードの表示切り替えと中央移動）。
  - 枝の折りたたみ（全子孫数、解像度フィルターとの統合、自動配置の表示用座標、検索による祖先展開、保存・復元・Undo / Redo・画像出力との境界、削除・ドラッグ・接続・複製・貼り付けなど既存の編集操作との関係）。
  - アウトライン表示・編集（19章）と Markdown・箇条書き書き出し（20章）。全件表示・編集、全正本から2形式のテキスト出力、再取込みの保証範囲。
  - キーボードショートカット・マウス操作一覧表。
  - 複数マップ（作成・一覧・切り替え・名前変更・削除の3通り、名前の規則、ダイアログのキーボード操作とフォーカス、保護モード、起動時の通知、他タブとの同時編集は対象外）。
  - 現在のマップ本体の保存状態（7状態、300ms待機、復元失敗、保存失敗と JSON 救出、保護モード）。
  - 全マップの一括バックアップ・追加復元（12.11節。確認、欠損、上限、復旧、フォーカス、対象外）。
  - 箇条書きからの追加（記法とインデントの数え方、階層の補正と警告、上限、プレビュー、追加する位置と配置、1操作での Undo / Redo、通知、キーボードとフォーカス）。
  - 兄弟ノードの順序変更（ボタン・ショートカット・自動配置のドラッグ、隠れた兄弟の扱い、手動配置の縦位置の入れ替え、先頭のルートの座標の引き継ぎ、1操作での Undo / Redo、通知、既存の操作との関係）。
  - 階層の上げ下げ（ボタン・ショートカット、上げ下げの規則と隠れた兄弟、手動配置の座標、自動配置と先頭のルート、折りたたみの展開、1操作での Undo / Redo、通知、キーボードとフォーカス、「戻る」「進む」の抑止、既存の操作との関係）。
  - 途中への親ノード挿入（ボタン・ショートカット、挿入の規則と隠れた兄弟、手動配置の座標、自動配置と先頭のルート、折りたたみ、1操作での Undo / Redo、ラベルの編集の開始、通知、キーボードとフォーカス、`Enter` の押し続け、既存の操作との関係）。
  - 枝の切り取り・移動（ダイアログ、同一マップと別マップの移動、失敗と保護モード、キーボードとフォーカス）。

- **[データモデル・永続化仕様](specifications/data-model.md)** (`docs/specifications/data-model.md`)
  - `MapDocument` JSON スキーマ（Version 1, 2, 3 の詳細定義と差分）。
  - 後方互換性と正規化マイグレーション仕様（旧バージョンからの安全な復元）。
  - `localStorage` 保存仕様（インデックス `draw-my-map.maps.v1` とマップ本体 `draw-my-map.maps.v1.doc.<id>` のキー、`MapIndexV1` と `MapStorageSession` の型、起動の分岐と旧キー `draw-my-map.map.v1` からの移行、書き込み順序、自動保存と flush、クォータ超過時のフォールバック、マップの操作の通知の一覧）。
  - 枝のクリップボード形式（5.10）。
  - 箇条書きからの追加で受け渡す型（2.6。保存形式は変えない）。
  - 兄弟ノードの順序変更の型（2.7。順序は `nodes` 配列の相対順で、保存形式は変えない）。
  - 階層の上げ下げの型（2.8。親子は `parentId`、兄弟の順は `nodes` 配列の相対順で表し、保存形式は変えない）。
  - 途中への親ノード挿入の型（2.9。`NodeParentInsertionResult`・`InsertParentNodeResult`・`NodeLabelEditRequest`。親子は `parentId` で表し、保存形式は変えない）。
  - 枝の移動の型（2.10）とジャーナル（5.11。キー `draw-my-map.branch-move.v1`）。
  - 一括バックアップ形式と専用ジャーナル（5.12。キー `draw-my-map.library-restore.v1`）、保存成功証拠を持つ `MapStorageSession`（5.5）。
  - 枝の折りたたみなど表示専用の状態を保存形式・編集履歴に含めない方針（1.2）。

- **[API 仕様](specifications/api.md)** (`docs/specifications/api.md`)
  - アウトライン書き出しのクライアントAPI（11章。整形、ダウンロード、通知の契約）。
  - 一括バックアップ・追加復元のクライアントAPI（13章。snapshot 登録、4操作、結果と通知先）。
  - ノードだけ削除のクライアントAPI（`api.md` 9章。純粋変換・hook・action・Controlの公開契約）。
  - Route Handler: `POST /api/illustrations` のリクエスト / レスポンス JSON スキーマ。
  - 処理パイプライン（入力検証 → 日本語自動翻訳 `@cf/meta/m2m100-1.2b` → 画像生成 `@cf/black-forest-labs/flux-1-schnell` → NSFW 誤判定リトライ機構）。
  - エラー仕様（400, 422, 429, 502, 503）と本番運用に向けた推奨事項。

### 3. 環境構築・セットアップ

- **[イラスト生成環境構築ガイド](setup/illustration-generation-setup.md)** (`docs/setup/illustration-generation-setup.md`)
  - Cloudflare Workers AI のアカウント作成手順（無料プラン）。
  - アカウント ID および API トークンの取得方法。
  - `client/.env.local` への環境変数設定と無料枠（1 日 10,000 Neurons / 約 57 枚）の管理。

### 4. テスト・品質保証

- **[実ブラウザテストケース](testing/browser-test-cases.md)** (`docs/testing/browser-test-cases.md`)
  - 自動テスト（Jest + jsdom）では検証が難しいキャンバス描画・インタラクション・実ブラウザ固有挙動の確認テスト項目（Phase 0〜15と Phase 16 候補006・007。Phase 14 は Q〜U 節、Phase 15 候補004は V 節、候補005は W 節、保存状態は X 節、一括バックアップ・追加復元は Y 節）。
  - 優先度別テストケース（起動、操作、フィルタリング、イラスト生成、エクスポート、編集履歴、枝の複製、枝のコピー＆ペースト、ノード検索、枝の折りたたみ、複数マップの保存・切り替え、箇条書きからの追加、兄弟ノードの順序変更、階層の上げ下げ、途中への親ノード挿入等）。

### 5. プロジェクト管理・開発履歴

- **[開発ロードマップ](../ROADMAP.md)** (`ROADMAP.md`)
  - プロジェクトのビジョン、差別化ポイント、各フェーズ（Phase 0〜15 は完了、Phase 16 は進行中、Phase 17〜39 は未着手）の実装完了状況。
- **[エージェント・開発ルール](../AGENTS.md)** (`AGENTS.md`)
  - サブエージェント駆動開発（Subagent-Driven Development）、二段階レビュー運用、PR運用ルール。
- **[レビュー指摘の記録](review-findings/)** (`docs/review-findings/`)
  - 実装フェーズごとのコードレビュー・設計レビューでの指摘事項と改善ログ。
- **[設計仕様書アーカイブ](superpowers/specs/)** (`docs/superpowers/specs/`)
  - 各機能フェーズごとの詳細設計ドキュメント。
- **[実装計画書アーカイブ](superpowers/plans/)** (`docs/superpowers/plans/`)
  - 各機能フェーズごとの TDD 実装計画ドキュメント。

---

## ディレクトリ構成

```text
docs/
├── README.md                           # 本ドキュメントポータル
├── development/                        # 開発者向け
│   └── developer-guide.md              # 新しく参加する開発者向けガイド
├── architecture/                       # システムアーキテクチャ
│   └── overview.md                     # アーキテクチャ概要・協調設計
├── specifications/                     # 機能・データ・API 仕様書
│   ├── features.md                     # 全機能仕様・操作マニュアル
│   ├── data-model.md                   # データモデル・永続化仕様
│   └── api.md                          # イラスト生成 API 仕様
├── setup/                              # 環境構築ガイド
│   └── illustration-generation-setup.md # イラスト生成設定
├── testing/                            # テスト関連
│   └── browser-test-cases.md           # 実ブラウザテストケース
├── review-findings/                    # 過去のレビュー指摘記録
├── superpowers/
│   ├── specs/                          # 機能別設計仕様書
│   └── plans/                          # 機能別実装計画書
└── backlog/                            # バックログ
```

## アウトライン表示・編集の関連文書

- [機能仕様19章](specifications/features.md#19-アウトライン表示編集): 行・キー・履歴・保存の契約。
- [クライアントAPI10章](specifications/api.md#10-アウトライン編集と共有フォーカスのクライアントapi): 表示モデル、draft/actions、canvas復帰と検索の共通issuer。
- [アーキテクチャ](architecture/overview.md#アウトライン編集phase-15候補004): 単一正本と排他マウント。
- [ブラウザ確認V節](testing/browser-test-cases.md#v-アウトライン表示編集phase-15候補004): 手順と実施範囲。実IME・狭幅・10,000行の実画面は未確認。
