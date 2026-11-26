# PDF印刷設定 SRP追補計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. タスクを逐次実行し、別エージェントが仕様と品質をレビューする。

**Goal:** refactor-srp第1周の2指摘を、利用者向けの動作を変えずに整理する。

**Architecture:** 印刷設定の純粋な検証と制約定義を共有し、Canvas計測とページ計算の調停をプレビューHookへ移す。ダイアログは入力・表示・フォーカスを担当する。

**Tech Stack:** TypeScript / React / Jest。新規依存なし。

**Spec:** docs/superpowers/specs/2026-11-26-pdf-print-settings-design.md

## Global Constraints

- 元計画の用紙・余白・ページ計算・安全性・ライフサイクルの仕様を維持する。新機能は追加しない。
- 余白0〜50mm、小数第1位まで。指数・負値・小数第2位以降は数値化前に拒否する。既存の`.1`入力の受理も維持する。
- 最大100ページ、SVG最大10MiB。上限ちょうどを許可する。
- Canvas計測はノード集合が変わった時だけ行い、設定変更ごとにSVG文字列を生成しない。
- TDD、実装者と独立レビュアーの分離。コミットは後続commit-jaで責務ごとに行う。
- client変更後は最終npm run verifyを実行する。成果物は通常日本語で記載する。

## Review Focus

- 文字列検証と数値検証の精度がずれない。
- 通知と入力属性の上限が検証の上限と一致する。
- ノードの計測失敗と空対象を区別する。
- 無効な余白で印刷実行可能なlayoutを返さない。
- 用紙・余白変更ではCanvas計測をやり直さず、ページ数だけ更新する。

### Task 1: 制約の共有とプレビュー責務の分離

**Files:**
- Create: client/src/domain/printExport/mapPrintSettings.ts
- Create: client/src/hooks/useMapPrintPreview.ts
- Test: client/src/domain/printExport/__tests__/mapPrintSettings.test.ts
- Test: client/src/hooks/__tests__/useMapPrintPreview.test.tsx
- Modify: mapPrintLayout.ts、mapPrintMessages.ts、printMapSvg.ts、MapPrintDialog.tsx、および必要な型・既存テスト。

**Interfaces:**
- Consumes: calculateMapPrintLayout、MapPrintLayoutError、getMapExportBounds、createMapTextMeasurer、MapPrintSettings。
- Produces: mapPrintSettings.tsに余白の最小・最大・小数桁・step、最大ページ数、最大SVG容量の定義を置く。parseMapPrintMargin(value:string):numberとisValidMapPrintMargin(value:number):booleanを置く。名前の詳細は実装者が揃え、既存呼び出し元を更新する。
- Produces: useMapPrintPreview({nodes,settings,unavailableReason}) は {layout:MapPrintLayout|undefined,error:string|undefined} を返す。settingsは既存文字列パーサーを適用した数値設定、無効な余白はNaN。ノード集合をキーに既存と同じ境界計測をメモ化する。
- MapPrintDialogは下書きを数値設定へ変換し、Hookから得たlayout/errorを表示する。Canvas・境界計測・ページ計算の直接呼び出しを持たない。

- [x] Step 1: 文字列パーサーのテストを追加。0、50、10.1、.1を許可し、空・-1・-1e-400・50.000000000000001・10.01を拒否する。未実装REDを確認する。
- [x] Step 2: 共有制約とパーサーを実装し、layout・サービス・通知・入力属性が参照する。既存の境界テストと新規テストのGREENを確認する。
- [x] Step 3: プレビューHookのテストを先に追加。空、計測失敗、無効余白、unavailableReason、用紙変更によるページ数更新、設定変更では計測を再実行せずnodes変更時に再計測することを検証する。未実装REDを確認する。
- [x] Step 4: Hookを実装し、ダイアログへ接続。Hook/UI/ページ計算/印刷サービス/MapEditorの関連テスト、lint、型検査を実行する。
- [x] Step 5: 独立エージェントの仕様・品質レビューを受け、指摘解消後に次へ進む。

### Task 2: ロードマップの最終照合

**Files:** ROADMAP.md（差分不要なら変更しない）

**Interfaces:** Consumes: Task1の動作維持と検証結果。Produces: 候補067完了・Phase30進行中・次070が実装に一致すること。

- [x] Step 1: 別エージェントでROADMAPと実装を照合し、動作を変えない整理で記載変更が不要か確認する。
- [x] Step 2: 記載変更があれば別エージェントの仕様・品質レビューで確認する。変更なしでも照合結果を記録する。
- [x] Step 3: 全タスク完了後、clientでnpm run verifyを実行する。
