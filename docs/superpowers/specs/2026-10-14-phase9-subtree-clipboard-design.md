# Phase 9: 枝のコピー＆ペースト 設計

作成日: 2026-10-14

## 目的と採用方針

選択ノードと全子孫をOSクリップボードへコピーし、同じアプリの別タブ・別マップを含めて貼り付ける。Phase 9の残り2項目（クリップボード対応・貼り付け全体のUndo／Redo）を対象にする。

`superpowers:brainstorming`と`superpowers:writing-plans`、dev-flow-kitの文書レビュー手順に従う。以下は今回採用する仕様。切り取り、普通の文章からのノード生成、画像ファイルの貼り付け、専用コピーボタン／貼り付けボタンは対象外。

| 選択肢 | 判断 |
| --- | --- |
| navigator.clipboardの非同期読み書き＋ボタン | ボタンには適するが、権限拒否と読み込み待ち中のマップ変更の管理が必要 |
| ブラウザのcopy/pasteイベント | 採用。ユーザー操作中のclipboardDataで同期処理し、OS標準ショートカットに対応する |
| アプリ内部のコピー用メモリ | 別タブへ渡せないため採用しない |

貼り付けは常に新しいルートとして追加する。選択中のノードを親にする方式は連続貼り付けで枝が入れ子になるため今回は採用しない。必要なら既存のShift+ドラッグで接続できる。

## Global Constraints

- 新規依存なし。マップのV3保存形式と既存の枝複製の挙動を維持する。
- コピーは全子孫を含むスナップショット。フィルターによる非表示ノードも含める。
- 貼り付け先では全IDを再発行し、根のparentIdはnull、子孫は新IDで対応付ける。
- 貼り付けと自動配置は1回のapplyTreeChangeで確定し、Undo／Redoの1操作とする。
- 入力検証・配置失敗時はマップ、選択、履歴、Redoを変更しない。採番済みIDの欠番は許す。
- 入力欄・contenteditable・選択中のDOMテキストのコピー＆ペーストを奪わない。
- 対象ブラウザはChrome・Firefox（必須）。Safariは実機で確認し、選択範囲が無い状態でcopy/pasteイベントが発火しない場合は既知の制約として文書に記録する（代替経路は追加しない）。
- 実装は`codex/phase9-subtree-clipboard`ブランチ、`.worktrees/codex/phase9-subtree-clipboard`で、タスク順にサブエージェント駆動と独立した仕様・品質レビューを行う。
- 各実装タスクでTDDと`cd client && npm run verify`を行う。最後にROADMAP.mdを更新し、Phase 10以降を完了にしない。

## クリップボード形式と検証

text/plainとして次の専用JSONを保存する。rootIdは重複して保持せず、parentId:nullの唯一のノードを根とする。

```json
{"type":"draw-my-map/subtree","version":1,"nodes":[{"id":1,"parentId":null,"x":0,"y":0,"width":100,"height":60,"label":"例","importance":"medium"}]}
```

コピー時に選択根のparentIdをnullへ切り離す。元のIDと配列順序・座標・寸法・ラベル・重要度・画像を保存する。元のマップは変更しない。生成中の画像やプレビューは含まず、設定済みillustrationだけを含む。コピー後に元を編集・削除してもクリップボードの内容は変わらない。

データ上限は文字列のUTF-16コード単位で5,000,000（JavaScriptのstring.length）、ノード数10,000。コピーと貼り付けに同じ上限を適用する。超過は失敗し、コピー失敗では既存クリップボードを上書きしない。貼り付けは文字数をJSON.parse前、ノード数を各ノードの検証前に判定する。

入力は信用せず、type/version、非空nodes配列、単一ルートを検証する。ノードは既存normalizeMapDocumentNode(..., 3)、グラフはvalidateMapDocumentGraphで検証する。重複ID・循環・存在しない親・複数ルートを拒否する。各Nodeは既存projectionによって既知フィールドのみ再構築し、画像はV3の既存検証と高さ補正を適用する。普通のJSONマップやテキストを枝形式として受け付けない。新しいHTML描画や外部URL読み込みはしない。

## 貼り付けと配置

新しい枝を配列末尾に追加し、コピー元の相対位置と全属性を維持する。元マップの配置モードは持ち込まず、貼り付け先の最新modeを使う。

- manualかつ既存ノードあり: 現行複製と同じ計算で、既存マップ全体の下端からSIBLING_VERTICAL_GAP（40）空けて垂直移動する。xはそのまま。
- manualかつ空マップ: コピー時の座標を維持する。
- auto: 座標移動をせず候補を既存forestレイアウトへ渡す。

manualでは全貼り付けノードのx/yおよび右端・下端の有限性を検査し、必要な間隔を丸めによって失う場合も拒否する。autoは既存レイアウトの失敗判定に従う。失敗しうるmanualの検査はすべて採番より前に済ませ、その後に`nextAvailableIds`を1回だけ呼んで全ノードのIDを一括採番する。IDが既存IDとも互いにも重ならない根拠は、`nextAvailableIds`が既存IDと採番済みIDを占有集合に加えることにある（L-432）。欠番が出るのはautoレイアウトの失敗時だけ。既存の複製コードを共有化する場合も、複製の親・配置・失敗条件を不用意に変えない。

成功すると新しい根を選択する。コピー時に重要度が低い枝は貼り付け後もその重要度を保持し、現在の表示フィルターを維持するため見えない場合がある。既存の非表示選択解除を優先し、成功通知で表示設定を案内する。viewportの自動移動はしない。

コピーは履歴を追加しない。貼り付け成功はRedoを破棄し、Undo1回で追加前、Redoで同じID・座標・画像に戻る。documentRevisionは通常の貼り付けでは増やさず、Undo／Redoは既存失効処理を使う。JSON／localStorageには貼り付け後のマップのみを既存形式で保存する。

## イベントとユーザー操作

MapStageがwindowのcopy/pasteイベントを登録する専用hookを1回呼ぶ。ヘッダーにキーボード操作の案内を表示する。イベントはブラウザが発火するものを扱い、keydownで別途C/Vを捕まえない。navigator.clipboardとexecCommandは使わない。

対象判定はevent.targetとdocument.activeElementの両方に既存isEditableTargetを適用する。どちらかが編集可能、DOM selectionが非空（`window.getSelection()?.isCollapsed === false`で判定する）、ノードラベル編集中、ジェスチャー中、またはdefaultPreventedの場合は何もせずブラウザへ任せる。ジェスチャー中のコピーは中間座標を取り込まない。ヘッダーボタンへfocusがあっても編集可能でなければ使える。

対象になるcopyで選択がなければ何もしない。選択があればスナップショットを検証・serializeしてからclipboardData.setData('text/plain', text)する。成功時にpreventDefault。例外／clipboardData欠落／上限超過ではエラー通知を出し、preventDefaultしない。この経路に入るのはDOM選択範囲が空の場合だけなので、既定のコピー動作はクリップボードへ何も書かない。一方、setDataせずにpreventDefaultすると空の内容で上書きされうるため、失敗時は既定動作に任せて直前のクリップボードの内容を残す。エラーになる前にsetDataを行わない。

対象になるpasteはpreventDefaultしてtext/plainを取得し、検証して1回挿入する。clipboardData欠落・取得例外・非対応形式・配置失敗はエラー通知のみ。文字入力先へのpasteはこの経路に入らない。貼り付けは選択なしでも使える。

DOM範囲選択をコピーしたい場合を優先するため、マップ操作を再開するにはテキスト選択を解除する。Ctrl/Cmd+Vを押し続けてpasteイベントが繰り返し発火した場合は、そのつど1回ずつ貼り付ける（各回がUndoの1操作になる。フォーカスを移さないため、L-408の事故には当たらない）。リスナーは最新のpropsを使い、アンマウント時に解除する。同期イベント処理なので読み込み待ちや非同期クリップボード要求の世代管理は導入しない。

## 通知・文言

責務の境界: MapStageが呼ぶhookは、対象判定（編集可能要素、DOM選択範囲、ラベル編集中、ジェスチャー中、defaultPrevented）、clipboardDataの読み書き、codecによる検証だけを担う。コピーのスナップショット生成と貼り付けの挿入はMapStageの必須props `onCopySubtree(sourceId): SubtreeClipboardResult<string>`・`onPasteSubtree(data): number | null`（Homeで`useNodes`の`copySubtree`・`pasteSubtree`を渡す）を呼び、結果の通知は必須props `onClipboardNotice(notice)`でHomeへ返す。通知のstateとdocumentRevisionによる失効はHomeが持つ。実装では、`{ notice, revision }`として保持し古い通知を隠す処理を共通hook `useRevisionScopedNotice`に切り出し、Homeのコピー／貼り付けの通知と`useNodeDuplicationAction`の複製の通知の両方で使う。

既存MapOperationNoticeへ通知を追加する。次の対象コピー／貼り付け要求で通知を更新し、documentRevision変更で隠す。対象外イベントは通知を変更しない。コピー／貼り付けの通知は、枝の複製の通知とは独立した枠として表示し、互いに消さない（永続化・画像出力・複製の通知と同じ慣行）。

- コピー成功: 「枝をコピーしました。」
- 貼り付け成功: 「枝を貼り付けました。Fキーで選択ノードへ移動できます。見えない場合は表示を『すべて』に切り替えてください。」
- コピー失敗: 「枝をコピーできませんでした。」
- 非対応／不正な貼り付け: 「貼り付ける枝データが無効です。」
- 上限超過（両操作）: 「枝データが大きすぎます（10,000ノード・5,000,000文字以内）。」
- 取得・配置失敗: 「枝を貼り付けできませんでした。」
- 常設案内: 「枝をコピー: Ctrl/Cmd+C ／ 貼り付け: Ctrl/Cmd+V（新しいルートとして追加）」

## 検証・参照

codec、挿入ドメイン、hook、実Home/MapStageの結合に分ける。Jestの合成ClipboardEventだけでOS連携成功と判断せず、ブラウザで実キーボード・別タブ貼り付け・入力欄優先・コピー失敗後も直前のクリップボードの内容が残ることを確認する。ブラウザ操作ツールの合成キーではクリップボードコマンドが起きないため、実キーボードでの確認は利用者による手動確認とし、実施ブラウザ／OSと未確認環境を記録する。OSの編集メニューからの操作も、選択範囲が無いと無効になる環境では未確認／制約として記録する。

codecのdecode・単一ルート判定と挿入は、上限10,000ノードに対して線形で終わることを、時間計測ではなく、逆順に並んだ深い鎖と全件が衝突するIDの入力で、配列要素と各ノードの`id`の読み取り回数がノード数の定数倍以内であることで確かめる（L-431）。localStorageへの保存の確認は、最後の値だけでなく`setItem`をspyして書き込みの回数と各回の値を確かめる（L-419）。

関連知見: L-001（成否）、L-018/L-022（外部入力検証）、L-038/L-063（一括確定）、L-048（複製互換）、L-058/L-060（UI配線）、L-061（全操作入口）、L-059（モックと実環境）、L-157/L-408（フォーカスを移さない。キーリピートの続きの入力）、L-419（保存のテスト）、L-431（計算量の退行をテストで検出する）、L-432（一括採番と非重複の根拠）。

## 決めたこと

- Safariで選択範囲が無いとcopy/pasteイベントが発火しない場合は、既知の制約として記録する（利用者の判断。keydown＋navigator.clipboardの代替経路や隠し選択範囲は追加しない）。Chrome・Firefoxを必須とする。
- コピー失敗時はpreventDefaultしない（setDataなしのpreventDefaultは空の内容で上書きしうるため。設計レビューによる変更）。
- DOM選択範囲の判定は`window.getSelection()?.isCollapsed === false`に統一する。
- Ctrl/Cmd+Vの押し続けによる連続貼り付けは許す（各回がUndoの1操作）。
- コピー／貼り付けの通知は複製の通知と独立して表示する。
- manualの検査を採番より前に済ませ、一括採番を1回だけ行う。
- 貼り付け成功の通知にFキーの案内を追加した（設計レビュー後、利用者の判断。手動配置では枝が画面外に置かれ表示位置も動かないため。枝の複製の通知と揃える）。

ClipboardEventでの同期setData/getDataとpreventDefaultは、[MDN copyイベント](https://developer.mozilla.org/en-US/docs/Web/API/Element/copy_event)・[MDN pasteイベント](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event)に基づく。
