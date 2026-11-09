# 一括バックアップの snapshot 資格判定の共通化

> 実装は superpowers:subagent-driven-development で順次実施し、別エージェントが仕様適合・品質をレビューする。コミットは後続 commit-ja まで行わない。

**Goal:** 書き出しと追加復元で同じ snapshot 資格の方針を使用し、判定の変更漏れを防ぐ。
**Architecture:** nullable snapshot を受ける純粋な型ガードを domain/persistence に置く。snapshot の取得時機、JSON 妥当性確認、session/一覧の照合、通知は呼出側に残す。
**Tech Stack:** TypeScript / React / Jest。
**Spec:** docs/superpowers/specs/2026-11-05-library-backup-design.md

## Global Constraints

- snapshot は非 null、hydrated、restoreOrigin 非 null が必要。初回 failed は同じ mount の実際の writeBody:saved 実績が出るまで拒否し、その後の保存待ち・失敗でも最新 snapshot を利用する。
- saveStatus、flush:unchanged、仮 baseline を保存成功の証拠にしない。現在の読取時機と書込直前の救出 snapshot 再取得は維持する。
- 通常復元は現在 session/editor と既存本体を保持する。保護移行は最新の nodes/layoutMode/illustration を維持する。
- ファイル形式、制限、journal、ユーザー向け通知、追加依存は変更しない。
- TDD の RED→GREEN、対象テスト・typecheck・lint・client/npm run verify を成功させる。コミット・push・子エージェント起動は実装者が行わない。

### Task 1: snapshot 資格ポリシーを共通化

**Files:** Create client/src/domain/persistence/mapBackupSnapshot.ts と同階層 __tests__/mapBackupSnapshot.test.ts。Modify client/src/services/persistence/libraryBackupExport.ts、client/src/hooks/useMapLibrary.ts と対応テスト。必要なら責務の追加を docs/architecture/overview.md に反映。
**Interfaces:** isEligibleMapBackupSnapshot(snapshot: MapBackupSnapshot | null): snapshot is MapBackupSnapshot。取得や parse はこの純粋関数の責務に含めない。

- [x] nullable/未hydrate/restoreOrigin未確定/初回failed実savedなしを拒否し、restored/emptyおよびfailed実savedありを許可するテストを先に追加しRED確認。
- [x] 型ガードを追加し、service内の重複判定とhook内の同じ判定を使用箇所ごと置換。JSON parseと通知、書込直前の再取得は維持。
- [x] 既存export/hookの回帰を拡充し、初回failed→実savedとその後の最新編集、復元書込直前に再取得した内容の救出が維持されることを確認。実装を写すだけのテストを避ける。
- [x] 対象テスト・型・lint・全verify・git diff --checkを確認。ROADMAP候補007完了・次008・015未完了・実施日と実装が一致することを最終手順で確認し、必要な場合だけ更新。
