# Draw My Map クライアント (`client/`)

Draw My Map の Web クライアントアプリケーションおよびバックエンド Route Handler です。  
高速な 2D グラフィックス描画エンジン **Pixi.js 8** と、最新の **React 19**（React Compiler `reactCompiler: true` 有効）/ **Next.js 16 (App Router)** を組み合わせ、滑らかで直感的なマインドマップ作成体験を提供します。

---

## クライアント概要

Draw My Map のフロントエンドおよびエッジバックエンドの主要な責務は以下のとおりです。

1. **キャンバス描画 (Pixi.js 8)**:
   - WebGL / 2D Canvas によるノードおよび滑らかなベジェ曲線エッジの高速レンダリング。
   - パン、ズーム、フォーカス（中央配置）、ノード同士のドラッグ＆ドロップ接続、子孫ノード連動ドラッグ移動（折りたたみで隠れた子孫も連動）。
   - 解像度フィルタリングと枝の折りたたみ・展開に連動する、滑らかなフェードイン・フェードアウト可視性アニメーション。
2. **UI 操作・インタラクション (React 19 & Tailwind CSS 4)**:
   - ツールバー、プロパティパネル、インラインテキスト編集、コンテキストメニューなどの DOM オーバーレイ UI。
   - キーボードショートカット（`Tab` で子ノード作成、`Enter` で兄弟ノード作成、`Delete`/`Backspace` で削除など）。
   - 編集履歴（ヘッダーの「元に戻す」「やり直す」と、`Ctrl`/`Cmd`+`Z`、`Ctrl`/`Cmd`+`Shift`+`Z`、`Ctrl`+`Y`）。最大100操作をメモリ上に保持し、リロードや JSON 読み込みで消去されます。
   - 枝の複製（ヘッダーの「枝を複製」）。選択ノードと全子孫（表示フィルターや折りたたみで隠れた子孫を含む）をアプリ内で複製し、複製全体を 1 操作として Undo / Redo できます。
   - 枝のコピー＆ペースト（`Ctrl`/`Cmd`+`C`、`Ctrl`/`Cmd`+`V`）。選択ノードと全子孫を専用形式でクリップボードへコピーし、別タブや別マップを含めて新しいルートとして貼り付けます。コピーは隠れた子孫を含み、複製・貼り付けとも折りたたみ指定は引き継がず展開した状態で追加します。入力欄や文字選択中はブラウザの動作を優先し、貼り付け全体を 1 操作として Undo / Redo できます。
   - ヘッダーのノード検索。NFKC正規化と大文字・小文字を区別しない部分一致で現在の `nodes` を同期検索し、配列順に最大50件と総件数を表示します。`↑` / `↓`・`Enter`・`Escape` に対応し、隠れたノードの表示モード切り替え・閉じた祖先の展開と中央移動を行います。検索操作は編集履歴に追加しません。
   - 枝の折りたたみ・展開。選択した親は残して全子孫を隠し、重要度フィルターとの積集合を描画します。閉じた親へ `Tab` で子を追加すると、その親を展開します。閉じた親への接続では親を開かず、接続した子は隠れて選択が外れます。削除・コピー・複製と、手動配置での閉じた親のドラッグは隠れた子孫も対象にします（詳細は [features.md の 10.4 節](../docs/specifications/features.md#104-既存の編集操作との関係)）。検索結果の選択時は必要な祖先だけを展開します。折りたたみ状態は表示専用で、文書の読み込み・復元・成功した Undo / Redo 後に全展開へ戻ります。
   - 重要度フィルタリングの手動切り替えやレイアウトモード切り替え（手動配置 / ツリー自動配置）。
3. **データ永続化とエクスポート (Domain & Services)**:
   - `localStorage` へのリアルタイム自動保存と復元。
   - `MapDocument` JSON 形式でのインポート / エクスポート（旧バージョン互換性・自動マイグレーション対応）。
   - 高解像度 PNG および ベクター SVG 形式での画像エクスポート。
   - 自動配置の折りたたみ中は表示用投影座標を使用し、正本の全ノードと保存座標は維持します。JSON、`localStorage`、PNG / SVG は正本の全件を扱い、手動配置へ戻すと保存座標を表示します。
4. **AI イラスト生成 API (Next.js Route Handler)**:
   - `POST /api/illustrations` エンドポイントによる Cloudflare Workers AI 連携。
   - 日本語ノードテキストの自動英訳（`@cf/meta/m2m100-1.2b`）と画像生成（`@cf/black-forest-labs/flux-1-schnell`）。
   - クライアント側での 128px JPEG 縮小とノードへの紐付け・再生成・削除。

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
├── components/           # React UI コンポーネント (DOM オーバーレイ & Pixi キャンバス)
│   ├── layout/           # アプリケーション全体のレイアウト、ヘッダー、パネル、ダイアログ
│   └── map/              # キャンバスコンテナ、Pixi シーンレンダラー、操作コーディネーター
├── config/               # 定数設定 (ノード形状、初期値、スタイル、イラスト設定)
├── domain/               # フレームワーク非依存の純粋ビジネスロジック (コアロジック)
│   ├── clipboard/        # 枝のクリップボード専用形式の書き出し・検証
│   ├── history/          # 編集履歴（Undo / Redo）の純粋な遷移
│   ├── illustration/     # イラストのトリミング、プロンプト加工、データ URL 処理
│   ├── imageExport/      # PNG / SVG エクスポート用の境界計算、ベクター座標計算
│   ├── nodes/            # ノードツリー操作、重なり判定、自動レイアウト、重要度判定、枝の折りたたみと表示用の配置
│   ├── search/           # ノードラベルの正規化・索引化・部分一致検索、検索結果の祖先展開の判定
│   └── persistence/      # MapDocument スキーマ定義、エンコード/デコード、移行処理
├── hooks/                # React カスタムフック (状態管理、UIとドメインの仲介)
├── server/               # サーバーサイド処理 (Route Handler から呼び出されるサービス)
│   └── illustration/     # Cloudflare Workers AI クライアント、翻訳、プロンプト生成
├── services/             # 外部環境との入出力・副作用アダプター (ブラウザ / Web API)
│   ├── illustration/     # Route Handler クライアント、サムネイル縮小処理
│   ├── imageExport/      # DOM Canvas / SVG のラスタライズとファイルダウンロード
│   └── persistence/      # localStorage 読み書き、JSON ファイルリーダー/ダウンローダー
├── testing/              # テスト用ヘルパー、モック、フィクスチャ (createTestNode, jpegFixture)
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

- 現状のイラスト生成 API ルート（`POST /api/illustrations`）には、認証・Origin チェック・レート制限が実装されていません。認証情報を設定したままパブリックなインターネット環境へデプロイすると、第三者によって 1 日の無料枠を消費される恐れがあります。本機能はローカル開発環境での利用を想定しています。
- Cloudflare アカウントは **Workers Free プラン** を使用してください（Workers Paid プランでは無料枠を超過した分が Neuron 単位で従量課金されます）。
- ブラウザがリクエストを中断しても、サーバー側の上流 API 呼び出し（翻訳および生成）は即座には中断されず、無料枠を消費する可能性があります。
- 公開環境へのデプロイを検討する場合は、Origin チェック、ユーザー認証、リクエスト本文サイズ制限、レート制限の実装が必須となります。

### 4. 生成したイラストの扱い

- 生成されたイラストは右パネルの「ノードに設定」で選択中のノードに紐付けられます。
- 紐付けられたイラストは自動的に 128px の JPEG に縮小・最適化され、マップの保存データ（`localStorage` および JSON エクスポート `version: 3`）に埋め込まれます。
- PNG および SVG の画像エクスポートにもイラストが含まれます。
- すでにイラストがあるノードでは、右パネルのボタンが「イラストを再生成」に切り替わり、プレビュー確認後に置き換えが可能です。
- 右パネルの「設定済みのイラストを削除」でノードからイラストを削除でき、ノードの高さは元に戻ります。
- イラストデータ付加により `localStorage` の容量上限（通常約 5MB）に達した場合は、「ブラウザへ自動保存できませんでした。」と通知されます。その場合は「JSON書き出し」機能で手動バックアップを行ってください。

### 5. 認証情報の扱い

- API トークンおよびアカウント ID はサーバー側（Next.js Route Handler）でのみ環境変数から読み込まれ、クライアント（ブラウザ）へは一切送信されません。
- `client/.env.local` は `client/.gitignore` に指定されており、Git の追跡対象外となっています。認証情報を Git コミットに含めないようご注意ください。

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
  - `src/components/map/pixi/testing/pixiTestHarness.ts`: WebGL 非対応の JSDOM 上で Pixi.js シーン構築・ストローク・イベント発火を検証するフェイク Pixi ランタイム。
  - `src/components/map/testing/mapStageTestRuntime.tsx` / `AutoLayoutMapStageHarness.tsx`: `MapStage` コンポーネント結合テスト用のランタイム注入・自動レイアウト検証ハーネス。

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
- [ドキュメントポータル](../docs/README.md): ドキュメント全体の目次・ガイド
- [システムアーキテクチャ概要](../docs/architecture/overview.md): Pixi.js と React の協調モデル、設計原則
- [機能仕様・操作マニュアル](../docs/specifications/features.md): ショートカット、ノード操作、フィルタリング仕様
- [データモデル・永続化仕様](../docs/specifications/data-model.md): `MapDocument` JSON スキーマと保存仕様
- [イラスト生成 API 仕様](../docs/specifications/api.md): Route Handler エンドポイント仕様
- [イラスト生成環境構築ガイド](../docs/setup/illustration-generation-setup.md): Cloudflare 設定の詳細手順書
