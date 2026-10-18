# ノード検索の単一責任リファクタリング Implementation Plan

> **For agentic workers:** `superpowers:subagent-driven-development`でタスク順に実行する。ユーザー指定によりコミットは禁止。

**Goal:** 最新origin/mainとの差分を全件確認し、検索の責務を整理してユニットテストを拡充する。
**Architecture:** 検索結果の共有契約を生成hookから独立させる。既存公開インターフェースと利用者の動作を維持する。
**Tech Stack:** TypeScript / React / Jest / Testing Library。
**Spec:** `docs/superpowers/specs/2026-10-14-phase10-node-search-design.md`（外部動作）、今回のユーザー依頼（内部構造、テスト、コミット禁止）。

## Global Constraints

- 作業場所は `.worktrees/codex/phase10-node-search`、ブランチは `codex/phase10-node-search`。
- コミット・ステージ・push・PR作成・merge・ブランチ削除は禁止。
- origin/mainから変更された部分と、その責務分離に必要な新規ファイルだけを対象にする。既存機能・文言・DOM構造・検索順序・上限50件・正規化規則を維持する。
- 新規依存なし。V3保存形式、履歴、documentRevisionの更新条件を変えない。
- ノードIDによる候補選択、IME/229・修飾キー・Enter repeatの扱い、Tab移動、候補クリック時のfocus、scrollIntoViewを維持。
- 移動要求のsequenceは世代を越えて単調増加。古い世代/消失ノードは消費し、screen待ちは保留。gesture取消はfocusより先。
- テストを先に追加してREDを記録してから実装。既存回帰テストも通す。各タスクで `cd client && npm run verify`。
- 実装者とは別のレビュアーが仕様適合と品質を順に確認。実装は1タスクずつ。

## Review Focus

- 候補の並べ替え/削除時にIDを維持し、消失時は先頭へfallbackする。
- 空一覧の上下操作で例外を出さず、不正なIDを通知しない。
- callbacks/可視ID/重要度が更新された後に最新値を使う。
- screen待ち中の世代変更/ノード消失が再出現時に復活しない。
- UIのfocus/aria連携とページからの配線を既存結合テストで保護する。

### Task 1: 検索結果の共有契約の独立とユニットテスト拡充

**Files:** 新規`client/src/types/nodeSearch.ts`、`client/src/hooks/useNodeLabelSearch.ts`、`client/src/components/layout/NodeSearchBox.tsx`、関連テスト、`docs/architecture/overview.md`。
**Interfaces:** `NodeSearchListItem = NodeSearchMatch & { hidden: boolean }`を `types/nodeSearch.ts` からexportし、生成hookとUIがこの共有契約へ依存する。既存propsとruntimeの仕様は維持。hookからの再exportは行わず、型の全参照を更新する。

- [x] 既存テストとコードを読み、型利用テストを新しいimportへ更新する。型専用変更なので `npm run typecheck` で新規型モジュール不在のREDを記録する。runtimeの意図的破壊によるREDは不要。
- [x] `nodeSearchKeyAction.test.ts`でCtrl/Meta/Alt × ArrowUp/ArrowDown/Escapeは操作しないことを拡充する。
- [x] `useNodeLabelSearch.test.ts`で検索語を保持してnodes/visible集合が同時に差し替わった際に最新結果とhidden状態になることを追加する。
- [x] `NodeSearchBox.test.tsx`で選択中IDを保持したまま候補/選択callbackが更新され、Enterが最新callbackへ現在IDを通知することを追加する。候補消失後はfallback先を通知することも確認。
- [x] 共有型を移動しimportを更新。型定義の重複を作らずNodeSearchMatchを再利用。型以外のproduction変更は行わない。
- [x] 関連テストとtypecheckのGREENを確認し、architecture文書の共有契約の説明を必要に応じて更新。
- [x] `npm run verify`成功を記録。ROADMAPのPhase10完了状態と実装が一致し、新機能の完了変更が不要なことを確認。コミットしない。

## 最終確認

- 全変更ファイルの監査表: `docs/superpowers/plans/2026-10-16-node-search-srp-inventory.md`。候補の機械的な分割はしない。
- 責務混在、依存方向、副作用と純粋計算の異なる観点で指摘ゼロを3周連続確認する。
- 最終 `npm run verify` と `git diff --check`、HEAD不変、index未変更を確認。
- 変更は未コミットのまま保持し、対象一覧・修正・テスト結果を報告。
