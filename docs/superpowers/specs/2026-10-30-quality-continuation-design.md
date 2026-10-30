# 品質改善の続き（重複の整理・長い関数の分割・テスト・ドキュメント）設計

作成日: 2026-10-30
基準: ブランチ `claude/api-improve-2026-10-30`（`a595f67`）。作業場所は `.worktrees/api-improve`。

## 目的・範囲

利用者から見える振る舞いを変えずに、次の4つを進める。

1. 残っている重複の整理（`useNodes` の結果付きの構造変更、`latestOptionsRef` の定型）。
2. 長い関数の分割（`placeNodeForest`、`wrapMapExportText`、`handleNodePointerDown`）。
3. テストの薄い箇所への特性テストの追加（数値の失敗経路、ポインタのガード）。
4. ドキュメントの整備（新しい補助の説明、開発者向けガイド、アーキテクチャ概要）。

## 対象外

- 振る舞いが変わる修正。次の2件は直さず、PR 本文に要確認事項として書く。
  - `useNodes.addNode` が、追加に失敗したときも ID を返す。
  - `panBy(0,0)` で再描画が起きる。
- `MapEditor`・`MapStage`・`useMapLibrary` など大きなコンポーネント・フックの分割（責務ごとのフックへの分割が既に進んでおり、今回の範囲では再分割しない）。
- `assignOutlineDepths`（設計書の手順と対応した1本の処理で、操作回数の集計を共有しているため、分けると見通しが悪くなる）。
- `formatNodeIndentNotice` などの網羅性の `switch`（開発者向けガイド 4.10 の方針どおり）。
- `NodeIndentControl`・`NodeSiblingOrderControl` の共通化（差分は文言と props だけだが、共通化すると props の受け渡しが増え、読みやすくならない）。
- `useDialogFocusTrap` など `latestOptionsRef` を使っていないフック。
- 保存形式・公開 API・依存パッケージの変更。ROADMAP の項目のチェックの変更（対応する項目が無いため）。

## 決めたこと

### D1. 結果付きの構造変更は `treeChangeOutcome.ts` の純関数にまとめる

`reorderSibling`・`changeNodeIndent`・`insertParentNode` は「`applyTreeChange` のコールバックの中で計算し、結果を外の変数へ代入し、`settleTreeChangeOutcome` で決める」形が同じ。次の関数を追加する。

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

`useNodes` の3つの操作は `compute` だけを書く。呼び出しでは `applyTreeChangeWithOutcome<ReorderSiblingResult>(...)` のように型引数を明示する（省くと成功と失敗で `R` の推論がずれ、TS2345 になる）。候補の計算から `nodes` を外す処理（`{ nodes, ...summary }`）は各操作に残す。型が単純に保てるので見送らない。`insertParentNode` の成功時の `setSelectedNodeId` は今までどおり確定の後に行う。

### D2. 最新の値を ref に写す定型は `useLatestRef` にまとめる

`latestOptionsRef` の `useRef` + `useLayoutEffect` を持つ次の7フックを、`client/src/hooks/useLatestRef.ts` の `useLatestRef(value)` に置き換える。`useNodeFocusRequest`・`useMapClipboardEvents`・`useSiblingReorderDragEscape`・`useMapViewportShortcut`・`useNodeParentInsertionShortcut`・`useSiblingReorderShortcut`・`useNodeIndentShortcut`。

```ts
export function useLatestRef<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
```

`useLatestRef` の `useLayoutEffect` には依存配列を付けない。読み手は項目を読むだけで、オブジェクトの同一性を比較しないため、毎回写しても振る舞いは変わらない。

`useLatestRef` の戻り値は `exhaustive-deps` が安定と判断しないので、読み手の各 effect の依存配列へ `latestOptionsRef` を足す（`[]` は `[latestOptionsRef]` に、`useNodeFocusRequest` は既存の項目に追加）。ref の同一性は変わらないので再登録は起きない。`eslint-disable` は使わない。

`ref.current` の中身は従来と同じ値になる。`window` の登録のやり直しが起きない点も変わらない。`keydown` の登録自体は、ハンドラごとの差が大きいので共通化しない。

### D3. 長い関数の分割の単位

- `placeNodeForest`: 子の列の配置（`calculateChildFrames`）を切り出す。`null` の伝播の順序と `actualY` の扱いは変えない。
- `wrapMapExportText`: 明示的な改行で分けた1行の折り返し（`wrapExplicitLine`）と、折り返し位置の探索（`findLastBreakableIndex`）を切り出す。折り返せる空白の判定は `isBreakableWhitespace` にまとめ、探索と、幅で切った直後の空白の消費で共有する。
- `handleNodePointerDown`（`stageInteractions.ts`）: 2回書かれている「ノードが今も操作できるか」の判定（`isNodeInteractive`）と、ジェスチャーの選択（`createNodeGesture`）を切り出す。1回目のガードと2回目のガードで判定以外の処理が違うので、ガードそのものは残す。`siblingReorderGesture` の記録は `createNodeGesture` の中に残す。

### D4. テストの方針

- 振る舞いを変えない分割なので、分割の前に特性テストを追加して通し、分割の後も同じテストが変更なしで通ることを確かめる。新しい関数（`applyTreeChangeWithOutcome`・`useLatestRef`）は通常の TDD で RED を確かめる。
- 特性テストは「通る」だけでは検証にならないので、追加したテストごとに対象の分岐を一時的に壊して（`null` の戻りを外す、条件を反転するなど）落ちることを確かめ、控えと比べて元に戻す。失敗経路はどれも同じ `null` を返すことが多く、結果だけでは別の分岐で止まったテストと区別できないため、この確認を省かない。
- ガードの変異は呼び出し側で入れる。`handleNodePointerDown` では「1回目の判定を外す」「2回目の判定を外す」を別々に行う（2回目の `nodesRef` の条件は、ジェスチャーの生成関数が同じ確認をするので等価変異になり、対象から除く）。`isNodeInteractive` の中の `nodesRef`・`visibleNodeIdsRef` の条件は1つずつ外す。補助関数の中だけを壊すと両方のガードに効き、ガードごとの検証にならない。
- 行を実行するだけのテストにしない。失敗経路のテストでは、結果（`null`・`placement-failed`・呼ばれないコールバックなど）を固定する。
- 到達できない防御（`never` の `default`、前段の検証で届かない分岐）は、テストのためにコードを変えたりキャストで無理に通したりしない。対象の行が到達不能だと分かったら、テストを書かずに報告する。
- カバレッジの数値は目標にしない。

### D5. ドキュメントの範囲

実装した内容に合わせて、次だけを更新する。

- `docs/development/developer-guide.md`: 4.2（`applyTreeChangeWithOutcome`）、`latestOptionsRef` の代わりの `useLatestRef`、テストの書き方の「数値の失敗経路」。
- `docs/architecture/overview.md`: `treeChangeOutcome.ts` と `useLatestRef.ts` の説明。
- `ROADMAP.md`: 対応する項目が無いので照合だけ行い、変更しない。

## 知見の反映

- L-001: `applyTreeChangeWithOutcome` は確定の可否を結果に反映し、失敗を成功として返さない。
- L-060: `useLatestRef` への置き換えで options の項目を落とさない。各フックの既存テストで最新の値を読むことを確かめる。
- L-167・L-168・L-174・L-179: 失敗経路のテストは、対象の分岐を壊すと落ちることで、その分岐に届いていることを確かめる（D4）。
- L-187: 2回のガードと各条件を、呼び出し側の変異で別々に確かめる（D4）。
- L-066: コミットの内容とメッセージを一致させる。

## 受け入れ条件

- `client` で `npm run verify` が通る。
- 既存のテストの期待値を変えていない（追加のみ。`treeChangeOutcome.test.ts` などへの追記を含む）。例外は、レビューで検証の弱さが見つかり強化したテストだけで、`a595f67` の時点から次の3件を直した。
  - `mapLibrarySession.test.ts` の `readBody`: 本体を入れて読み出す値を確かめる。
  - `cloudflareRunModel.test.ts` の `message` が文字列でない場合: 入力を配列に変える。
  - `nodeSiblingReorderSequence.test.ts`: 名前を検証の内容に合わせる。
- `git diff a595f67 -- client/src` のうちテスト以外の差分が、上の D1〜D3 の範囲に収まっている。
- PR 本文に、対象外とした2件の要確認事項が書かれている。
