# Phase 21 集中表示と閲覧状態の保存の実装計画

設計は [2026-11-20-phase21-view-navigation](../specs/2026-11-20-phase21-view-navigation.md)。対象は ITEM-026 の6項目。

## Global Constraints

- タスクを順に実行する。各タスクは対応するテストを先に書き、対象テストを実行して RED を記録し、実装後に GREEN を記録する。それぞれ別エージェントで仕様適合、コード品質をレビューする。
- 作業と検証は専用 worktree。Jest、Testing Library、既存の Pixi ハーネスを活用する。対象テストは client で npm test -- --runInBand <パス> を使う。
- ノード本文、図形、編集履歴、JSON と画像・アウトラインの書き出しに表示状態を混ぜない。キーボード操作は既存のダイアログガードと編集ガードに従う。旧データでも使えるようにする。
- L-015/L-472 を踏まえ、部分表示は正規の森林に書き戻さない。L-037/L-061/L-155 を踏まえ、要求の世代、すべての既存入口、操作後のフォーカスを検証する。L-047/L-470 を踏まえ、座標・倍率と保存値を検証する。L-453/L-467/L-669 を踏まえ、合成操作を関数型更新で扱い、ストレージを描画と分離し、読み込み失敗時の上書きを防ぐ。

## Task 1 — 集中表示、パンくず、一括開閉

関連ファイルは domain/nodes/nodeCollapse.ts、hooks/useBranchCollapse.ts、hooks/useMapDisplayState.ts、hooks/useNodeSearchNavigation.ts、components/map/MapEditor.tsx と components/layout の新規表示部品。

- [x] RED。複数ルートと3階層以上の枝で、対象枝のみを描画、集中先の解像度優先（自身は低解像度でも表示）と復元時に残った祖先の折りたたみの展開、集中解除時の位置・倍率維持、集中先の削除、枝外への検索・パンくず・同一マップのリンク移動、一括閉と単独展開、一括開、枝外の閉状態保持を確認する。集合を使うテストでは実データと選択操作を使う。
- [x] 森林インデックスで子孫 ID を求め、集中範囲を表示状態の可視集合に適用する。パンくずはルート順に並べる。検索とパンくずが同じ移動処理に入り、存在する枝外の対象へ移動する場合にのみ集中解除できるようにする。
- [x] 閉 ID の一括設定と有効 ID の置き換えを useBranchCollapse に追加し、既存の単独・検索展開操作を確認する。無効ボタン、アクセシブル名、現在位置を確認して GREEN。

### Interfaces

- useBranchCollapse が collapsedNodeIds、setCollapsedNodeIds(ids)、setSubtreeCollapsed(nodeId, collapsed)、既存の index と展開の入口を提供する。
- useMapDisplayState に focusVisibleNodeIds または同等の任意の集合を渡す。単一の最終可視集合を描画と操作へ渡し、フィット用に解像度フィルター前の表示対象も導出できるようにする。
- MapEditor に focusRootId と setFocusRootId をまとめる。集中解除条件はノードの削除、マップ置換、枝外への有効な移動。パンくず、検索、同じマップを対象とする useCrossMapNavigation のキャンバス移動は同じ navigateToNode を使う。useOutlineCanvasReturn と、アウトラインからキャンバスへ移る横断操作には集中範囲の判定を接続する。

## Task 2 — フィットとビューポートの受け渡し

関連ファイルは components/map/mapViewport.ts、useMapViewport.ts、MapStage.tsx、MapEditor.tsx、既存の表示コントロール。

- [x] RED。負の座標、倍率境界、少数ノード・マップが空・無効サイズ、集中・折りたたみ・解像度を組み合わせた全体フィットと単一・複数選択フィット、集中時の「表示中の枝に合わせる」ラベルを確認する。実キャンバス側で変換を受け取ることを既存 Pixi ハーネスで確認する。
- [x] fitViewportToNodes で座標境界と余白から倍率、オフセットを計算する。既存の倍率定数と妥当性判定を利用する。
- [x] MapStage の現ビューポートをイベントの前後で取得・適用できる接点を設ける。既存のシーン更新、パン、ホイール、ラベル編集、フォーカス要求、アウトライン切り替えと文書リセットの振る舞いを保つ。画面未準備や失効要求を検証して GREEN。

### Interfaces

- fitViewportToNodes(nodes, screen) は Viewport または null。利用側は Task 1 の表示投影済みノードを渡す。
- MapEditor 側で最新の Viewport を同期的に読み出せる。MapStage 側で適用、現在の画面サイズ、中央移動やフィットの成否を扱える。Stage の単体利用は既定値で動かす。
- Task 3 から導入する閲覧記録は、Stage の操作が有効か判断できる時点で直前の Viewport を読む。成功前に履歴を進めない。

## Task 3 — 表示状態の取得・復元と閲覧履歴

関連ファイルは hooks/useMapResolutionFilter.ts、MapEditor.tsx、MapStage.tsx と閲覧状態・履歴用の小さな型とフック。

- [x] RED。検索 A→B、枝外検索、集中、パンくず、フィット、中央移動から戻る・進む。前のパン、倍率、閉状態、自動レベル、主選択と複数選択が復元されること。解像度の閾値帯で拡大側・縮小側から入った状態の往復と固定モードの previousAutoLevel 保持、最大50件で古い項目が落ちること、パンとホイールだけでは項目を作らないこと、無効操作、同じ位置、進むの分岐、連続操作と同一文書世代で遅延した旧フォーカスが最新の位置・履歴を上書きしないこと、マップ本文置換時の履歴破棄、編集 Undo/Redo 後の履歴維持と旧文書世代の保留要求の破棄、消滅ノード、編集履歴との分離を確認する。
- [x] 直前の表示状態記録と、戻る・進む時に現在の表示状態を保存する履歴を実装する。適用側はフォーカス要求の競合を解消し、検索による表示変更と位置変更を一つの移動として扱う。履歴を増やさずにスナップショットを適用する。倍率と自動レベルを同時に反映し、旧倍率の通知でヒステリシスを確定させない。履歴はエディタ再マウントと resetRevision で破棄し、実行待ちの要求は documentRevision と要求 ID で失効させる。
- [x] 「閲覧を戻る」「閲覧を進む」をキャンバス表示に追加し、履歴境界で無効化して GREEN。

### Interfaces

- MapViewSnapshot が viewport、selectedNodeId、selectedNodeIds、focusRootId、collapsedNodeIds、resolutionMode、autoResolutionLevel を持つ。
- captureView() と applyView(snapshot) を同じ MapEditor の現在の文書に対して使う。applyView は最新の森林で消滅 ID を補正する。useNodes の既存選択モデルに沿って主選択と複数選択を単一操作で復元する。
- recordNavigation(before) または同等の入口へ、成功した閲覧移動で取得した直前スナップショットを渡す。Task 4 ではブックマーク適用をここへ接続する。

## Task 4 — 名前付き表示ブックマーク

関連ファイルは services/persistence 配下の専用ブックマークストレージ、MapEditor.tsx、components/layout 配下の操作部品。

- [x] RED。現在値保存と適用、再読み込み後の一覧復元と自動適用されないこと、別のマップへの分離、同一ライブラリエントリの本文置換・外部再読み込みでの保持、新規マップ・別名保存・バックアップからの追加で引き継がれないこと、同一IDで作成日時が異なる場合の分離、ゴミ箱の元ID復元と別ID復元（移行先に既存データがある場合を含む）、完全削除・空にする操作・期限切れ、期限切れ処理でインデックス書き込みを失敗させた場合の旧キー保持、破損したゴミ箱で帰属不明なキーが保持されること、ブックマーク削除、重複・空名、壊れた値、読み込みと書き込みの失敗、作成日時を取得できない互換入口と保護モードで保存が無効になることを確認する。永続化失敗で現在の一覧と本文を汚さないことを確認する。
- [x] マップ ID と作成日時で分離した専用キー、バージョン付きの読み込み、保存前の再読み取りと妥当性検証を実装する。MapViewSnapshot を値として保存する。既存の mapTrashTransaction と mapTrashStorage の確定後処理に復元時のキー移行・完全削除時のキー掃除を接続する。衝突による別 ID 復元では移行先の既存データを保護し、新キーの書き込みが成功した後にだけ旧キーを消す。途中失敗時にマップ本文の成功と補助データの後処理失敗を区別する。purgeExpiredTrashWithIndex の status:ok にはインデックス永続化失敗も含まれるため、補助キーの削除はインデックスの永続化まで確定した削除成功分だけに行う。破損したゴミ箱の帰属不明キーを列挙して削除しない。
- [x] キャンバス表示に入力・適用・削除を置く。Task 3 の履歴に適用操作を記録し、保存失敗を操作通知で知らせる。適用時のキーボードフォーカスと旧データを確認して GREEN。

### Interfaces

- page.tsx から MapEditorProps に currentMap.createdAt を渡す。作成日時を取得できない互換入口と保護状態では、表示操作は使えるようにしつつブックマーク保存を無効にする。ブックマークは名前と Task 3 の MapViewSnapshot。ストレージの全読み込みと更新は失敗を判別できる結果を返す。
- 保存・削除は閲覧履歴を変えない。適用は Task 3 の復元処理を通す。

## Task 5 — ROADMAP と統合検証

- [x] 仕様を達成した Phase 21 の6項目をチェックし、見出し、現在地、次の未完了項目、最終更新を実装結果に合わせる。
- [x] 既存の折りたたみ、マップ内・横断検索、マップ間リンク、複数選択、アウトライン往復、編集 Undo/Redo、読み込みと書き出しの回帰を確認し、client で npm run verify を成功させる。
