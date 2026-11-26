# PDF書き出し・印刷設定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. このリポジトリではインライン実装を使わない。

**Goal:** カード #56 の用紙サイズ・改ページ・余白指定を、既存SVGとブラウザのPDF保存／印刷で提供する。

**Architecture:** 純粋なページ計算、DOM印刷文書、印刷セッション管理、Reactの設定UIを分離する。既存exportNodesとSVG生成器を再利用し、印刷専用の一時iframeでCSSを隔離する。

**Tech Stack:** TypeScript / React / Next.js / Jest（jsdom）/ DOM API。新規依存なし。

**Spec:** docs/superpowers/specs/2026-11-26-pdf-print-settings-design.md

## Global Constraints

- 実装はタスクごとに新しい子エージェント、逐次実行。実装者以外が仕様適合とコード品質をレビューする。
- TDDでテスト追加→RED確認→実装→GREEN確認。featureステップ中はコミットしない。後続commit-jaで責務別に分割する。
- 既存SVGの対象・描画・32pxパディング・安全性を維持し、exportNodesをそのまま使う。printはSVG同様all/visibleのみ、selectionは無効。
- A4=210×297mm、A3=297×420mm、Letter=215.9×279.4mm。縦横、上下左右0〜50mm（0.1mm単位）、既定A4縦・各10mm・fit。印字領域は幅高さとも1mm以上。
- fitは縦横比維持し1ページ中央配置。tileは96px=25.4mmの実寸で左→右、上→下。整数との差1e-9以内は整数へ丸めてceil。最大100ページ、SVG Blob最大10MiB。
- 全体1ページ／自動タイルが今回の改ページ指定。手動ノード改ページ・縮尺指定・設定永続化・PDF直接生成は非目標。
- 任意HTML挿入禁止。SVGはBlob URLのimg。利用者の文字列はtextContent、CSSは検証済み値のみ。
- 準備のみ合計15秒制限。font/imageロード・decode完了前のprint禁止。二重実行を同期ガード。キャンセル・失敗・アンマウントは所有資源のみ冪等cleanup。
- afterprintと保存成功を混同しない。印刷中の固定時間破棄禁止。afterprint未発火は明示「印刷を終了」で解除する。
- 最後にclientでnpm run verifyを通し、実装済み範囲だけROADMAP.mdを更新する。日本語の通常文で成果物を記述する。
- 既知の注意点: L-001/003/004/047/048/052/059/060。client/AGENTS.mdに従い関連Next.jsガイドを読む。

## Review Focus

- 非対称余白とLetter横向きで印字領域・物理寸法が一致する（Task 1計算/DOMテスト）。
- 境界ちょうど・わずかな超過・100ページ境界・非有限寸法で白紙増殖や無制限DOM作成が起きない（Task 1）。
- font/image/decode待機中の取消・timeout・遅延完了はprintせず、所有外iframeを残す（Task 1サービス）。
- scope変更やマップ編集後も印刷スナップショットを維持し、古いイベントが次セッションに干渉しない（Task 2 Hook）。
- afterprint未発火、印刷取消、フォーカス復帰、親ショートカットの干渉を確認する（Task 2 UI/実ブラウザ）。

### Task 1: ページ計算と印刷サービス

**Files:**
- Create: client/src/types/mapPrintExport.ts
- Create: client/src/domain/printExport/mapPrintLayout.ts
- Create: client/src/services/printExport/mapPrintDocument.ts
- Create: client/src/services/printExport/printMapSvg.ts
- Test: 各domain/services配下の__tests__/mapPrintLayout.test.ts、mapPrintDocument.test.ts、printMapSvg.test.ts

**Interfaces:**
- Consumes: createMapSvgExport(nodes: readonly Node[]): MapSvgDocument | null、createMapSvgBlob(svg: string): Blob。MapSvgDocument={svg:string,width:number,height:number}。
- Produces: MapPrintSettings={paperSize:"a4"|"a3"|"letter",orientation:"portrait"|"landscape",margins:{top:number,right:number,bottom:number,left:number},pagination:"fit"|"tile"} と DEFAULT_MAP_PRINT_SETTINGS。
- Produces: calculateMapPrintLayout(width:number,height:number,settings:MapPrintSettings):MapPrintLayout。MapPrintLayoutはpaperWidthMm/paperHeightMm/contentWidthMm/contentHeightMm/columns/rows/pages（各ページの画像のleftMm/topMm/widthMm/heightMm）を含む。無効値はRangeError。
- Produces: createMapPrintDocument(doc:Document,layout:MapPrintLayout,settings:MapPrintSettings,imageUrl:string,mapName:string):HTMLImageElement[]。DOM APIでdoc.head/bodyを構築し画像配列を返す。
- Produces: startMapPrint(options:{nodes:readonly Node[],mapName:string,settings:MapPrintSettings,onPrinting:()=>void}):MapPrintSession。MapPrintSession={done:Promise<MapPrintResult>,cancel:()=>void,finish:()=>void}。cancelは準備中取消またはアンマウント時解放、finishは明示終了。MapPrintResult={status:"dialog-closed"|"cancelled"}|{status:"failed",reason:"invalid-settings"|"page-limit"|"size-limit"|"preparation"}。doneはrejectしない。型はtypes/mapPrintExport.tsに置く。ページ計算の例外には安全な理由コードを付け、Hookは内部例外文字列を表示せず固定の原因別通知へ変換する。
- サービス自身がparent fonts.ready→SVG生成→layout/Blobサイズ確認→iframe構築→iframe fonts/全画像load/decode→printを調停する。calculateMapPrintLayoutの寸法エラーはUIプレビューでも扱う。

- [x] Step 1: 計算テストを先に書く。A4既定でcontent=190×277、Letter横でpaper=279.4×215.9、非対称余白、fit中央／比率、tile行列と最後の余り、整数誤差1e-9、100ページちょうど許可／101拒否、負数・NaN・Infinity・巨大値・余白空欄相当・小数精度をassertする。
- [x] Step 2: clientで `npm test -- --runInBand mapPrintLayout` を実行し未実装によるREDを記録する。
- [x] Step 3: 型・検証・calculateMapPrintLayoutを実装し同コマンドでGREENを確認する。
- [x] Step 4: DOM/サービスのテストを先に書く。用紙サイズとpadding・最終ページのbreak-after無し、textContentによる悪意あるmapName処理、Blob画像共有、10MiBちょうど許可／超過size-limit、100ページ超過page-limit、全資源ready前print無し、15秒timeout、decode失敗、cancel後遅延完了、print同期例外、afterprintとfinish、他iframe保持・URL一度だけrevokeをassertする。ブラウザAPIだけmockしDOM/計算は実物を使う。
- [x] Step 5: `npm test -- --runInBand mapPrintDocument printMapSvg` でREDを記録する。
- [x] Step 6: 文書生成とセッションを実装。iframeは画面外、非display:none、tabIndex=-1/aria-hidden。load待機はイベントを先に登録、complete/naturalWidthも扱い、iframe/doc欠落を失敗にする。準備のtimeoutをprint直前に解除し、afterprintをprint前に登録する。cleanupは参照保持した資源に限定する。
- [x] Step 7: 関連テスト、`npm run typecheck`、`npm run lint` を実行。変更ファイルとRED/GREENの出力を報告へ記録。コミットせず別エージェントの仕様・品質レビューを待つ。

### Task 2: 設定UIとエディタ接続

**Files:**
- Create: client/src/hooks/useMapPrintExport.ts
- Create: client/src/components/layout/MapPrintControls.tsx（必要ならMapPrintDialog.tsxへ分離）
- Modify: client/src/components/map/MapEditor.tsx
- Modify: client/src/domain/exportScope/exportFormatAvailability.ts
- Test: client/src/hooks/__tests__/useMapPrintExport.test.tsx、client/src/components/layout/__tests__/MapPrintControls.test.tsx、availability/MapEditorの既存テスト

**Interfaces:**
- Consumes: Task 1のMapPrintSettings、DEFAULT_MAP_PRINT_SETTINGS、calculateMapPrintLayout、startMapPrint、MapPrintSession。
- Produces: useMapPrintExport({nodes,mapName,enabled,disabledReason,startPrint?})。戻り値はstate（idle/preparing/printing）、notice、start(settings)、cancel()、finish()。startPrintはstartMapPrintと同じ型の注入点。プレビューに必要な寸法生成は既存SVGを再利用し同じcalculateMapPrintLayoutを使う。不要なSVG再生成を避ける。
- Produces: MapPrintControlsはnodes/mapName/enabled/disabledReasonを受け、Hookを使用して既存OperationNotice領域へ通知を渡す。MapEditorへのnotice配線が必要なため、HookをMapEditorで使いControlsへ結果をpropsで渡す形を優先する。最終props名は実装者が既存作法に合わせて定義・報告する。
- MapEditorはexportNodes、現在mapName、exportFormatControls.printをHook/UIへ渡し、operationNoticesにprint.noticeを追加する。

- [x] Step 1: Hookテストを先に書く。enabled=falseと空対象でサービス未実行、同tick二重startは1回、nodes/settingsのsnapshot、cancelとunmountでcancel、afterprint/finishでidle、遅延doneは新セッションを上書きしない、failed/cancelledで保存成功通知なし、page-limit/size-limitの原因別案内をassert。
- [x] Step 2: `npm test -- --runInBand useMapPrintExport` のRED後にHook実装、GREEN確認。
- [x] Step 3: UI/availability/配線テストを先に追加。all/visible有効・selection無効、空visible理由。ラベル付き用紙/方向/余白4入力/配置select、初期値、入力空欄・負値・0.01刻み拒否、ページ数、Escape/Tab/focus復帰、準備取消、printing手動終了案内と終了ボタンをassertする。MapEditorからscope対象とmapNameが渡り通知が表示される接続も検証する。
- [x] Step 4: 関連テストRED後にUI、availability print追加、MapEditor配線を実装。フォームは既存フォーカストラップとeditor shortcut制御の作法に従い、背景操作を防ぐ。印刷操作後の自動閉鎖でfinish操作を失わない。
- [x] Step 5: 関連テストGREEN、既存PNG/SVGテスト、`npm run verify` を実行する。別エージェントの仕様・品質レビューを待つ。
- [x] Step 6: メイン担当が実ブラウザでPDF保存の紙寸法、ページ数、非対称余白、tileの境界、末尾白紙なし、日本語・絵文字・許可イラストと取消後再実行を確認。Chromiumの実生成PDF検証を完了ゲートとする。Firefox/Safariは補助確認対象とし、使えなければ未確認と記録してPRへ制約を明記する。実行環境がないだけで未確認を合格扱いしない。ブラウザ名・バージョン・印刷設定・PDFページ数/寸法/余白の結果を記録する。Chromiumでの破綻はTask 2未完了としてROADMAP完了更新とマージを停止する。必要な修正は同実装者へ戻す。

### Task 3: ロードマップを実装結果へ合わせる

**Files:** Modify: ROADMAP.md

**Interfaces:** Consumes: Task 1/2の検証結果と実装済み範囲。Produces: 候補067の完了状態・現在地・次項目・最終更新日。

- [x] Step 1: 設計・実装・テスト・実ブラウザ確認記録を照合し、用紙・改ページ・余白が提供済みか確認する。
- [x] Step 2: 候補067のチェックとPhase30説明を更新し、070/071未実装項目は残す。全体次項目014等の既存優先順位を変えない。Phase30の次は候補070。最終更新は2026-11-26。
- [x] Step 3: ROADMAP差分のみで事実整合を確認し、独立エージェントによる仕様・品質レビューを受ける。追加の実装がなければテストは作らない。全タスク後、clientでnpm run verifyの最終成功を確認する。

## コミットの責務境界

後続commit-jaで (1)設計・計画、(2)ページ計算と対応テスト、(3)印刷サービスと対応テスト、(4)UI接続と対応テスト、(5)ROADMAP を依存順に分割する。単独で型・ビルドが成立しない境界はまとめる。フローの残りはrefactor-srp→dev-flow-review→commit-ja→pr-ja→dev-flow-pr-review→pr-merge→後処理→review-digest→lessons-push。
