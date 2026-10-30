# 品質改善の続き Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` でタスクを1つずつ実装し、別担当の仕様適合・コード品質のレビュー後に次へ進む。各タスクのサブエージェントには、そのタスク本文、Global Constraints、依存する前タスクの Interfaces だけを渡す。

**Goal:** 利用者から見える振る舞いを変えずに、重複の整理・長い関数の分割・テストの追加・ドキュメントの整備を行う。

**Architecture:** 設計書 `docs/superpowers/specs/2026-10-30-quality-continuation-design.md` の D1〜D5 に従う。分割の前に特性テストを追加し、分割の後も同じテストがそのまま通ることを確かめる。

**Tech Stack:** TypeScript、React 19、Next.js 16、Pixi.js 8、Jest 30（jsdom）、Testing Library。追加依存なし。

## Global Constraints

- 着手前に設計書 `docs/superpowers/specs/2026-10-30-quality-continuation-design.md` の該当の節を読む（各タスクの本文に節を書く）。
- 利用者から見える振る舞いを変えない。既存のテストの期待値を変えない（テストの追加のみ可）。
- 作業場所は `.worktrees/api-improve`。ブランチを切り替えない。worktree を作らない。
- **コミットしない。** push もしない。変更は作業ツリーに残す（後の手順でまとめてコミットする）。`git stash` を使わない。
- 到達できない防御（`never` の `default`、前段の検証で届かない分岐）は、コードを変えたりキャストで通したりしない。テストを書かず、報告に行番号と理由を書く。
- カバレッジの数値を目標にしない。行を実行するだけのテストを書かない。失敗経路のテストでは、結果を固定し、手前の別の判定で止まっていないことを入力の選び方で保証する（L-167・L-168・L-174・L-179・L-187）。
- **変異の確認（L-179・L-187）。** カバレッジは確認の代わりにならない。Task 1・3・4・7 で追加した特性テストは、次の手順で対象の分岐を壊すと落ちることを確かめる。
  1. 対象の本体のファイルを `cp` で一時ディレクトリ（`mktemp -d`）へ控える。
  2. 対象の分岐を1か所だけ壊す（`null` の戻りを外す、条件を外す・反転する）。
  3. 追加したテストを実行し、そのテストが落ちることを確かめる。全件通ったら、そのテストは検証になっていないので直す（タスクの本文で等価変異として除いたものは除く）。
  4. 控えから `cp` で戻し、`diff` で一致を確かめる。`git checkout` や `git stash` で戻さない（未コミットの変更を消すため）。
- テストの名前は既存に合わせて日本語で、確かめている挙動を書く。テストは対象の隣の `__tests__/` の既存ファイルへ追記する（無ければ新しく作る）。
- コメントは既存の密度と語調に合わせて日本語で書く。
- 各タスクの終わりに、`client` で `npm run typecheck`、変更したファイルへの `npx eslint <files>`（エラー・警告とも0件）、関連する `npx jest <path>` を通す。
- 最後のタスクで `cd client && npm run verify` を通す。
- 報告には、変更したファイル、追加したテストの数、確かめたコマンドの結果、到達不能と判断した行を書く。

---

## Task 1: 配置の数値の失敗経路の特性テスト

**Files:** `client/src/domain/nodes/__tests__/` の `nodeLayoutPlacement.test.ts`、`nodeForestInsertion.test.ts`、および `nodeLayoutMetrics`・`nodeIndentPlacement`・`nodeSiblingSwapPlacement` のテスト（既存が無ければ新規）。本体は変えない。

未カバーの行（`a595f67` 時点）:

- `nodeLayoutPlacement.ts`: 15, 31, 42, 60, 62, 67, 69（`checkedSubtract` などが `null` を返す経路）
- `nodeLayoutMetrics.ts`: 51, 53, 59
- `nodeForestInsertion.ts`: 59, 60, 82, 96, 120, 128
- `nodeIndentPlacement.ts`: 87, 95, 131, 136, 143, 151, 156
- `nodeSiblingSwapPlacement.ts`: 48, 57, 77, 116, 135, 143, 145, 148, 162

- [ ] 各行の算術の補助（`client/src/domain/nodes/nodeLayoutArithmetic.ts`）を読み、`null` になる入力（`Number.MAX_VALUE` 近くの座標や `Infinity` の高さなど）を決める。
- [ ] 公開関数の入力からその分岐へ届くテストを書く。戻り値（`null` や `PLACEMENT_FAILED`）を固定する。
- [ ] 分岐に届いていることを、Global Constraints の変異の確認で確かめる。失敗はどれも同じ `null` なので、戻り値だけでは別の分岐で止まったテストと区別できない。
- [ ] 届かない行は報告する。

結果: 到達不能は `nodeLayoutMetrics.ts` 51・53・59、`nodeForestInsertion.ts` 59の`x`・60・96・120の`offsetX`、`nodeSiblingSwapPlacement.ts` 116。除去しても結果が変わらない等価変異は `nodeLayoutPlacement.ts` 31（41行が同じ判定をする）、`nodeSiblingSwapPlacement.ts` 48（57行の判定と Set で吸収される）と 77（`failed` が戻らず `toBounds` で失敗する）。

## Task 2: `placeNodeForest` の分割

**依存:** Task 1 のテスト。設計書 D3。

**Files:** `client/src/domain/nodes/nodeLayoutPlacement.ts`

- [ ] `calculateChildFrames(children, frameTop, span, childrenHeight, spanById)` を切り出す。戻り値は `{ node, top }` の配列か `null`。現在の `childTopOffset` の計算から `childFrames` の構築までをそのまま移す。`children.length === 0` の早期 `continue` は呼び出し側に残す。
- [ ] 計算の順序を変えない（`calculateCenteringOffset` → `checkedAdd` → 子ごとの `checkedAdd` 2回）。最後の子の後の加算を行わない点も変えない。スタックへの積み方（逆順）も変えない。
- [ ] テストを変更せずに `npx jest src/domain/nodes` が通ることを確かめる。

## Task 3: `wrapMapExportText` の分割

**依存:** 設計書 D3。

**Files:** `client/src/domain/imageExport/mapExportText.ts`、同じディレクトリの `__tests__/`

- [ ] 分割の前に、次の挙動のテストが無ければ追加する: `maxWidth <= 0` で1コードポイントずつ、1文字が上限より広いときの前進、空白での折り返し、連続する空白の消費、末尾の空白、`\r\n` と空行、絵文字などのサロゲートペア。
- [ ] `wrapExplicitLine(explicitLine, maxWidth, measureText): string[]` を切り出す。`findLastBreakableIndex(codePoints, start, fittingLength, lastNonWhitespaceIndex, consumedWhitespaceRunEnd)` を切り出す（見つからなければ `-1`）。
- [ ] `consumedWhitespaceRunEnd` の更新と `start` の進め方を変えない。
- [ ] 分割の前に追加したテストを変更せずに通す。

## Task 4: `handleNodePointerDown` の分割とガードの特性テスト

**依存:** 設計書 D3、D4。

**Files:** `client/src/components/map/pixi/stageInteractions.ts`、同じ `__tests__/`

未カバーの行（`a595f67` 時点）: 75, 107, 156, 159, 179, 195, 223, 229, 235。

- [ ] 分割の前に、到達できる行に特性テストを追加する（古い binding からのイベント、`pointerGestures.start` の失敗、`handleStagePointerDown` のガード、解放後のイベントなど）。
- [ ] 分割の前に、実行はされているが変異に耐えていないガードを固定する。次の4条件は、外しても `src/components/map` のテストが全件通ることを確認済み（`a595f67` 時点）: 1回目の `visibleNodeIdsRef`（109行）、2回目の `nodesRef`（119行）、2回目の `visibleNodeIdsRef`（120行）、2回目の `activeBinding`（118行）。追加するテスト:
  - 別の pointer で非表示のノードを押しても、所有中のジェスチャーを止めない（1回目のガードの効果）。
  - `pointerGestures.cancel()` のコールバック（進行中のジェスチャーの cancel）の中でノードが消える・隠れる・binding が解放されると、開始も選択もしない（2回目のガードの効果）。3条件を別々のテストにする。2回目の `nodesRef`（119行）は、外しても3つの生成関数が同じ `nodesRef` で確かめて `null` を返すので等価変異になる。テストは残すが、呼び出し側の変異では確かめない（報告に書く）。
- [ ] 各テストを、呼び出し側の変異で確かめる。1回目の判定を外す・2回目の判定を外すを別々に行い（2回目の `nodesRef` は等価変異なので除く）、`isNodeInteractive` にした後は `nodesRef` と `visibleNodeIdsRef` の条件を1つずつ外す。
- [ ] `isNodeInteractive(nodeId)` を切り出す（`nodesRef` に存在し、`visibleNodeIdsRef` が `undefined` か、含まれる）。1回目と2回目のガードの両方で使う。
- [ ] `createNodeGesture(nodeId, sample, shiftKey)` を切り出す。接続・並べ替え・移動の選択の順序を変えず、`siblingReorderGesture` の記録を中に残す。
- [ ] 1回目のガードの `pointerGestures.owns` の分岐、2回目のガードの `hasActiveGesture()`・`activeBinding` の確認は残す。
- [ ] 追加したテストと既存のテストを変更せずに通す。

## Task 5: `applyTreeChangeWithOutcome`

**Files:** `client/src/hooks/treeChangeOutcome.ts`、`client/src/hooks/__tests__/treeChangeOutcome.test.ts`、`client/src/hooks/useNodes.ts`

**依存:** 設計書 D1。

**Interfaces:**

```ts
export type TreeChangeComputation<R extends { ok: boolean }> = {
  nodes: Node[] | null; // null なら確定しない
  outcome: R;
};

export function applyTreeChangeWithOutcome<R extends { ok: boolean }>(
  applyTreeChange: (update: (currentNodes: readonly Node[], mode: NodeLayoutMode) => Node[] | null) => boolean,
  compute: (currentNodes: readonly Node[], mode: NodeLayoutMode) => TreeChangeComputation<R>,
): R | TreeChangePlacementFailure;
```

- [ ] 先にテストを書き、RED を確かめる: 成功で確定したら outcome を返す / `nodes: null` の失敗は outcome の理由を返し、`applyTreeChange` のコールバックは `null` を返す / 候補は成功だが `applyTreeChange` が `false` なら `placement-failed` / `applyTreeChange` がコールバックを呼ばなければ `placement-failed` / `compute` に `currentNodes` と `mode` がそのまま渡る。
- [ ] 実装する。内部で `settleTreeChangeOutcome<R>(applied, outcome)` を使う。
- [ ] `reorderSibling`・`changeNodeIndent`・`insertParentNode` を置き換える。呼び出しは `applyTreeChangeWithOutcome<ReorderSiblingResult>(...)` のように型引数を明示する（省くと TS2345 になる）。候補から `nodes` を外す処理（`{ nodes, ...summary }`）は各操作に残す。`insertParentNode` の `setSelectedNodeId` は今までどおり確定の後に行う。3つの先頭のコメントと、`documentRevision` を上げない旨のコメントは残す。`outcome はコールバックの中で代入するため…` のコメントは `treeChangeOutcome.ts` の実装へ移す。
- [ ] 使わなくなった `settleTreeChangeOutcome` の import を `useNodes.ts` から消す。
- [ ] `npx jest src/hooks` を通す。

## Task 6: `useLatestRef`

**Files:** `client/src/hooks/useLatestRef.ts`（新規）、`client/src/hooks/__tests__/useLatestRef.test.tsx`（新規）、`client/src/components/map/` の7フック（`useNodeFocusRequest`・`useMapClipboardEvents`・`useSiblingReorderDragEscape`・`useMapViewportShortcut`・`useNodeParentInsertionShortcut`・`useSiblingReorderShortcut`・`useNodeIndentShortcut`）

**依存:** 設計書 D2。

**Interfaces:**

```ts
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }); // 依存配列を付けない
  return ref;
}
```

- [ ] 先にテストを書き、RED を確かめる: 初回の描画の直後に値が読める / 再描画の後、同じ ref オブジェクトで新しい値が読める / 同じコンポーネントで `useLatestRef` の後に宣言した `useLayoutEffect` から最新の値が読める（実装を `useEffect` に変えると落ちることを確かめる）。
- [ ] 実装する。
- [ ] 7フックを置き換える。渡すオブジェクトの項目を1つも落とさない。`useLayoutEffect`・`useRef` の import が不要になったら消す。「window の登録をやり直さないよう…」のコメントは残す。各 effect の依存配列へ `latestOptionsRef` を足す（`[]` は `[latestOptionsRef]` に、`useNodeFocusRequest` は既存の項目に追加）。`exhaustive-deps` は `useLatestRef` の戻り値を安定と判断しないため。ref は同じオブジェクトなので再登録は起きない。`eslint-disable` を使わない。
- [ ] 7フックが `react-hooks` の lint を通ることを確かめる。`useNodeFocusRequest` など、`latestOptionsRef` の使い方が他と違うものは、読み出しの時点が変わらないことを確かめる。
- [ ] `npx jest src/components/map src/hooks` を通す。

## Task 7: その他の薄い箇所のテスト

**Files:** 各対象の `__tests__/`。本体は変えない。

未カバーの行（`a595f67` 時点）:

- `client/src/components/map/pixi/pinchViewport.ts`: 55, 66, 73
- `client/src/components/map/siblingReorderDropSlot.ts`: 65, 66（`left`・`right` の更新。兄弟の x が異なるときの指示線の範囲を固定する）
- `client/src/components/map/useNodeLabelEditRequest.ts`: 49, 50 / `useNodeFocusRequest.ts`: 67, 68 / `useNodeParentInsertionShortcut.ts`: 67, 68（`never` の `default` なら対象外）
- `client/src/hooks/useMapLibrary.ts`: 113, 227, 356, 375
- `client/src/services/imageExport/createMapSvgExport.ts`: 14、`loadMapSvgImage.ts`: 14

- [ ] 各行を読み、到達できるものにテストを追加する。`never` の `default` や到達不能な防御は対象外として報告する。
- [ ] `npx jest` の該当のパスを通す。

## Task 8: ドキュメントの更新と最終検証

**依存:** Task 1〜7 の結果。

**Files:** `docs/development/developer-guide.md`、`docs/architecture/overview.md`

- [ ] `developer-guide.md` 4.2 を `applyTreeChangeWithOutcome` を踏まえた説明に直す（`useNodes.ts` の `settleTreeChangeOutcome<ReorderSiblingResult>(applied, outcome)` の例は今の実装に存在しなくなる。結果付きの構造変更は `applyTreeChangeWithOutcome<ReorderSiblingResult>(...)` のように型引数を明示して使い、それ以外でコールバックの中で代入するときも受け取る関数の型引数を明示する、と書く）。
- [ ] `developer-guide.md` 3.4 に、算術の失敗経路（`checked*` が `null` を返す経路）を公開関数から確かめる方法を短く書く。
- [ ] `developer-guide.md` の4章に、`window` へ登録するフックは `useLatestRef` で最新の options を読むことを短く書く（4.10 の後に節を足すか、既存の節へ追記する。節番号を付け替えない）。
- [ ] `overview.md` の `treeChangeOutcome.ts` の説明に `applyTreeChangeWithOutcome` を足す。`hooks/` の一覧の同じ箇所に `useLatestRef.ts` を足し、`overview.md` の「`src/hooks/` 全 33 ファイル」の数を実数に直す（`__tests__` を除いて数える）。`docs/README.md` の該当の説明に古い記述があれば直す。
- [ ] 設計書・ガイドの記述が実装のシグネチャと一致していることを確かめる（Task 2〜6 の実装を読む）。
- [ ] `ROADMAP.md` を実装と照合する。対応する項目が無いので変更しない。
- [ ] 既存のテストの期待値を変えていないことを確かめる: `git diff a595f67 -- client/src | grep -E '^-' | grep -E 'expect|it\(|describe\(' ` の結果を見て、削除された行があれば理由を報告する。
- [ ] 本体の差分が D1〜D3 に収まることを確かめる: `git diff --name-only a595f67 -- client/src | grep -v -E '/__tests__/'` と `git status --short client/src`（新しいファイルの確認）。基準を `origin/main` にしない（ブランチの既存5コミットが混ざる）。
- [ ] `cd client && npm run verify` を通す。

## 後の工程への引き継ぎ（メインセッションが行う）

- PR 本文に要確認事項として次の2件を書く: `useNodes.addNode` が追加失敗時も ID を返す、`panBy(0,0)` で再描画が起きる。
- コミットは内容とメッセージを一致させる（L-066）。テーマごとに分け、「対応済み」とだけ書かない。
