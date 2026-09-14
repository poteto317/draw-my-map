# Phase 3 Single-Responsibility Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 3のビューポート差分を、純粋計算、入力所有権、React／DOM lifecycle、compositionの責務へ分離する。

**Architecture:** 決定的な計算とaction解決を純粋関数へ抽出し、Hookはlistener lifecycle、gestureはpointer lifecycle、`stageInteractions`はPixi stage routingだけを所有する。公開APIと利用者が観測する操作は維持する。

**Tech Stack:** TypeScript、React 19、Next.js 16、PixiJS 8、Jest、Testing Library

**Spec:** `docs/superpowers/specs/2026-09-07-phase3-srp-refactor-design.md`

## Global Constraints

- 対象は`origin/main...HEAD`と現在の未コミット差分に含まれるPhase 3変更とする。
- `MapStageProps`、`useMapViewport`、`createStageInteractions`の公開契約を維持する。
- パン、wheel／pinch、`F`キー、編集、移動、接続の挙動を変更しない。
- 新しいruntime依存を追加しない。
- client変更後は`client/`から`npm run verify`を実行する。
- コミット、push、PR作成を行わない。

---

### Task 1: Node固有のviewport投影を分離する

**Files:**
- Create: `client/src/components/map/nodeViewportFocus.ts`
- Create: `client/src/components/map/__tests__/nodeViewportFocus.test.ts`
- Create: `client/src/components/map/nodeLabelEditorLayout.ts`
- Create: `client/src/components/map/__tests__/nodeLabelEditorLayout.test.ts`
- Modify: `client/src/components/map/mapViewport.ts`
- Modify: `client/src/components/map/useMapViewport.ts`
- Modify: `client/src/components/map/NodeLabelEditor.tsx`
- Modify: `client/src/components/map/__tests__/mapViewport.test.ts`
- Modify: `client/src/components/map/__tests__/NodeLabelEditor.test.tsx`

**Interfaces:**
- Produces: `focusViewportOnNode(viewport, node, screen): Viewport`
- Produces: `getNodeLabelEditorLayout(node, viewport): NodeLabelEditorLayout`

- [x] **Step 1: 失敗テストを書く**

`nodeViewportFocus.test.ts`で中心`(100, 60)`を画面中心`(400, 300)`へ合わせた`{ offsetX: 200, offsetY: 180, scale: 2 }`、倍率維持、非有限node／screenで入力参照を返すことを検証する。`nodeLabelEditorLayout.test.ts`でnode`{ x: 10, y: 20, width: 100, height: 60 }`とviewport`{ offsetX: 5, offsetY: -5, scale: 2 }`から`{ left: 25, top: 35, width: 200, height: 120, lineHeight: "120px", fontSize: 28 }`を期待する。

- [x] **Step 2: REDを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/nodeViewportFocus.test.ts src/components/map/__tests__/nodeLabelEditorLayout.test.ts`

Expected: 新規モジュールが存在しないためFAIL。

- [x] **Step 3: 最小実装を行う**

Node固有計算を`nodeViewportFocus.ts`へ移し、`mapViewport.ts`からNode依存を除く。ラベル位置、寸法、line-height、font-sizeの計算を`nodeLabelEditorLayout.ts`へ移し、`NodeLabelEditor.tsx`は戻り値をstyleへ設定する。既存テストのNode固有assertionを新規テストへ移す。

- [x] **Step 4: GREENを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/nodeViewportFocus.test.ts src/components/map/__tests__/nodeLabelEditorLayout.test.ts src/components/map/__tests__/mapViewport.test.ts src/components/map/__tests__/NodeLabelEditor.test.tsx src/components/map/__tests__/useMapViewport.test.tsx`

Expected: PASS。

---

### Task 2: wheel入力計算をHook lifecycleから分離する

**Files:**
- Create: `client/src/components/map/wheelZoom.ts`
- Create: `client/src/components/map/__tests__/wheelZoom.test.ts`
- Modify: `client/src/components/map/useMapWheelZoom.ts`
- Modify: `client/src/components/map/__tests__/useMapWheelZoom.test.tsx`

**Interfaces:**
- Produces: `normalizeWheelDeltaY(deltaY, deltaMode, pageHeight): number`
- Produces: `calculateWheelZoomRequest(input, currentScale): WheelZoomRequest | null`

- [x] **Step 1: 失敗テストを書く**

pixel、line、pageの正規化結果`5`、`80`、`3000`を検証する。合わせてDOMグローバルがない実行環境でもlineとpageを正規化できることを検証する。client`(150, 90)`、bounds`(50, 40)`、deltaY`-100`、scale`2`からanchor`(100, 50)`と`2 * Math.exp(0.1)`を期待する。delta、座標、pageHeight、scaleの非有限値と非正scaleでは`null`を期待する。

- [x] **Step 2: REDを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/wheelZoom.test.ts`

Expected: 新規モジュールが存在しないためFAIL。

- [x] **Step 3: 最小実装を行う**

感度`0.001`、DOMグローバルに依存しない`deltaMode`の規格値、delta正規化、anchor、指数倍率を`wheelZoom.ts`へ移す。Hookは有効なrequestだけ`preventDefault`、`onBeforeZoom`、`onZoomAt`へ配送する。

- [x] **Step 4: GREENを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/wheelZoom.test.ts src/components/map/__tests__/useMapWheelZoom.test.tsx src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS。

---

### Task 3: keyboardとdouble-clickのaction解決を分離する

**Files:**
- Create: `client/src/components/map/viewportFocusShortcut.ts`
- Create: `client/src/components/map/__tests__/viewportFocusShortcut.test.ts`
- Create: `client/src/components/map/mapDoubleClickAction.ts`
- Create: `client/src/components/map/__tests__/mapDoubleClickAction.test.ts`
- Modify: `client/src/components/map/useMapViewportShortcut.ts`
- Modify: `client/src/components/map/__tests__/useMapViewportShortcut.test.tsx`
- Modify: `client/src/components/map/MapStage.tsx`
- Modify: `client/src/components/map/__tests__/MapStage.test.tsx`

**Interfaces:**
- Produces: `resolveViewportFocusRequest(input): { node: Node; screen: ScreenSize } | null`
- Produces: `resolveMapDoubleClickAction(input): { type: "edit"; nodeId: number } | { type: "add"; point: Point } | null`

- [x] **Step 1: 失敗テストを書く**

フォーカスresolverでは成功、`F`以外、編集中、input／textarea／select／contenteditable配下、gesture中、screen欠損、選択欠損を検証する。double-click resolverではcontainer offsetとviewport変換後のnode hitがedit action、空白が変換済みworld座標を含むadd actionになること、変換結果が非有限な場合は`null`となることを検証する。

- [x] **Step 2: REDを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/viewportFocusShortcut.test.ts src/components/map/__tests__/mapDoubleClickAction.test.ts`

Expected: 新規モジュールが存在しないためFAIL。

- [x] **Step 3: 最小実装を行う**

Hookはresolverが返したrequestにだけ`preventDefault()`とfocus commandを実行する。`MapStage`はdouble-click actionが`null`なら何も行わず、それ以外はactionに応じて編集開始または追加callbackだけを呼ぶ。

- [x] **Step 4: GREENを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/__tests__/viewportFocusShortcut.test.ts src/components/map/__tests__/mapDoubleClickAction.test.ts src/components/map/__tests__/useMapViewportShortcut.test.tsx src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS。

---

### Task 4: pointer変換とpinch計算をgesture lifecycleから分離する

**Files:**
- Create: `client/src/components/map/pixi/pointerSample.ts`
- Create: `client/src/components/map/pixi/__tests__/pointerSample.test.ts`
- Create: `client/src/components/map/pixi/pinchViewport.ts`
- Create: `client/src/components/map/pixi/__tests__/pinchViewport.test.ts`
- Modify: `client/src/components/map/pixi/pinchZoomGesture.ts`
- Modify: `client/src/components/map/pixi/__tests__/pinchZoomGesture.test.ts`
- Modify: `client/src/components/map/pixi/stageInteractions.ts`

**Interfaces:**
- Produces: `toPointerSample(event, viewport): PointerSample`
- Produces: `calculatePinchViewport(startViewport, startFirst, startSecond, currentFirst, currentSecond): Viewport | null`

- [x] **Step 1: 失敗テストを書く**

pointer変換ではglobal`(120, 90)`、viewport`{ offsetX: 20, offsetY: 10, scale: 2 }`からscreen`(120, 90)`、world`(50, 40)`を期待し、空pointerTypeを`mouse`へ変換する。pinch計算では距離比、中点移動、倍率上下限、開始距離ゼロ、非有限点を検証する。

- [x] **Step 2: REDを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/pointerSample.test.ts src/components/map/pixi/__tests__/pinchViewport.test.ts`

Expected: 新規モジュールが存在しないためFAIL。

- [x] **Step 3: 最小実装を行う**

`toPointerSample`は`screenToWorld`へ委譲する。`calculatePinchViewport`は中点と距離を計算し、`zoomViewportAt`後に`panViewport`を適用する。gestureはpointer座標とactive状態だけを保持し、非nullの計算結果だけを通知する。

- [x] **Step 4: GREENを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/pointerSample.test.ts src/components/map/pixi/__tests__/pinchViewport.test.ts src/components/map/pixi/__tests__/pinchZoomGesture.test.ts src/components/map/pixi/__tests__/stageInteractions.test.ts`

Expected: PASS。

---

### Task 5: touch所有権をstage routingから分離する

**Files:**
- Create: `client/src/components/map/pixi/touchGestureCoordinator.ts`
- Create: `client/src/components/map/pixi/__tests__/touchGestureCoordinator.test.ts`
- Modify: `client/src/components/map/pixi/stageInteractions.ts`
- Modify: `client/src/components/map/pixi/__tests__/stageInteractions.test.ts`

**Interfaces:**
- Produces: `createTouchGestureCoordinator(options): TouchGestureCoordinator`
- Consumes: `createPinchZoomGesture`、`viewportRef`、`onViewportChangeRef`、`onBeforePinch`

- [x] **Step 1: 失敗テストを書く**

最初のtouchを通常gestureへ委ねること、2本目で通常gestureを一度キャンセルしてpinchを始めること、固定pair、3本目の無視、pair終了後の抑止、全touch終了後の解除、`cancel`、`reset`を独立して検証する。

- [x] **Step 2: REDを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/touchGestureCoordinator.test.ts`

Expected: 新規モジュールが存在しないためFAIL。

- [x] **Step 3: 最小実装を行う**

`stageInteractions.ts`からpinch、touch Map、抑止flagを削除する。down／move／upをcoordinatorへ委譲し、公開cancelは通常gestureとpinchを終了、binding cleanupはcoordinatorをresetする。

- [x] **Step 4: テスト責務を移動する**

3本目、終了後抑止、pair cancelの詳細をcoordinator testへ移し、stage testには2本目touchが通常gestureをキャンセルしてviewport更新へ到達する統合ケースを残す。

- [x] **Step 5: GREENを確認する**

Run: `cd client && npm test -- --runInBand src/components/map/pixi/__tests__/touchGestureCoordinator.test.ts src/components/map/pixi/__tests__/stageInteractions.test.ts src/components/map/__tests__/useMapStageInteractions.test.tsx src/components/map/__tests__/MapStage.test.tsx`

Expected: PASS。

---

### Task 6: 多観点SRP再監査を指摘0件まで繰り返す

**Files:**
- Review: `git diff --name-only origin/main...HEAD`で列挙される全ファイル
- Review: `git diff --name-only`で列挙される全ファイル
- Modify/Test: 再監査で新しい責務混在が見つかった対象だけ

**監査第1巡で追加した分離:**

- `client/src/components/map/pixi/pointerGestureSession.ts`が単一pointer gestureのactive state、lease、再入保護を所有する。
- `client/src/components/map/pixi/__tests__/pointerGestureSession.test.ts`が所有pointer、end／cancel前のlease解放、古いleaseによる誤消去防止を検証する。
- `stageInteractions.ts`はsessionへイベントを配送するだけとする。

**監査第2巡で追加した分離:**

- `client/src/components/map/pixi/dragActivation.ts`が画面上のdrag開始閾値と開始後の総差分を所有する。
- `client/src/components/map/pixi/__tests__/dragActivation.test.ts`が閾値境界と開始後の状態を検証する。
- `canvasPanGesture.ts`と`nodeMoveGesture.ts`は共通のdrag activationへ委譲する。
- `canvasPanGesture.ts`は非ゼロ差分のviewport演算失敗時にcallbackを抑止し、直前の有効なパン結果を開始位置へ巻き戻さない。開始点へ戻るゼロ差分は通知する。

**監査第3巡で修正した境界:**

- `useMapViewportShortcut.ts`は`F`以外をlistener境界で除外し、不要なgesture状態照会を行わない。
- Hookテストで非対象キーが`hasActiveGesture`を呼ばないことを検証する。

**監査第4巡:**

- semantic cohesion、state ownership、dependency direction、test responsibilityの全観点で追加指摘0件。
- 本番側に残っていないことを構造検索で確認する対象は、stage内のtouch／pinch状態、MapStage内の座標・hit計算、editor内の投影式、wheel Hook内の倍率式、汎用viewport内のNode依存、各drag gesture内の閾値状態とする。

**コードレビュー第1巡で追加した境界条件:**

- Ctrl／Meta／Alt付き`F`と、空文字・`plaintext-only`を含むcontenteditable配下ではviewport shortcutを発動しない。
- pinchの現在距離ゼロは最小倍率へ制限し、開始距離ゼロは最初の正距離を新しい基準として次のmoveから計算する。
- touch coordinatorは`pointerDown`で登録済みのpointerだけをmoveで更新する。
- viewportの直接設定でも倍率`0.25`〜`4`の不変条件を守る。
- stage cleanupはlistener解除・gesture cancelの例外後も残りの解除とtouch resetを試行する。
- `MapStage`統合テストでパン／ズーム後の追加、編集、移動、接続を検証する。

**コードレビュー第2巡で追加した境界条件:**

- `F`と修飾キーの判定を共有predicateへ集約し、Hookの早期除外とresolverの条件判定を一致させる。
- 異なるpointerによるblank downでは、進行中gestureと選択状態の双方を変更しない。
- 倍率制限後に現在倍率と同じ場合、`zoomViewportAt`は同じviewport参照を返して再描画を抑止する。
- パン座標のoverflowはcallbackを呼ばず、開始点へ戻る操作だけは開始viewportを通知する。

**コードレビュー第3巡で追加した境界条件:**

- 右・中ボタンではblank／nodeの選択やgestureを開始しない。
- ゼロ距離pinchの基準待機中は非有限値と距離overflowを拒否し、最初の有限な正距離から復旧する。
- 選択ノードが既に中央なら同じviewport参照を返す。
- 固定52pxを差し引くMap高を廃止し、動的viewport高のflex shellがheader実寸後の残領域を割り当てる。

**コードレビュー第4巡で追加した境界条件:**

- scroll抑止はMap領域だけへ適用し、ページshellと可変高headerをclipしない。
- pinch中点とanchor zoomは、大きな有限座標でも途中計算だけをoverflowさせない。
- `page.tsx`はheaderとMap領域を割り当てるcomposition shellとして責務一覧へ分類する。

**コードレビュー第5巡で追加した境界条件:**

- ノード移動は開始・現在のscreen／world座標と算出先を検証し、非有限値をstate更新callbackへ渡さない。
- `MapStage`統合テストで、wheelが進行中の移動／接続をキャンセルし、gesture中の`F`がviewportを変更しない配線を固定する。
- pinch倍率は距離比を先に求め、パン・ズーム・フォーカスを含む有限値演算の結果が非有限なら状態を更新しない。

**コードレビュー第6巡で強化したテスト境界:**

- gesture中の`F`抑止は、keydown後も最新world containerが同一で、viewport更新と`preventDefault`が発生しないことを統合テストで確認する。

**コードレビュー第7巡で追加した再入境界:**

- 2本目touchで単一gestureをcancelした後にgeneration、touch pair、stage binding、単一pointer所有権を再検証し、cleanupまたは新gesture開始で失効したpinchを作らない。
- cancel callbackからの同期cleanupと新gesture開始をstage統合テストで再現する。

- [x] **Step 1: semantic cohesionを監査する**

各本番ファイルの変更理由を一文で記述し、異なるactor、policy、lifecycleが同居していないことを確認する。

- [x] **Step 2: state ownershipとlifecycleを監査する**

各mutable state、Ref、Map、listener、Pixi resourceの所有者が一つで、生成・更新・cleanupが同じ境界に閉じていることを確認する。

- [x] **Step 3: dependency directionを監査する**

純粋計算がReact、DOM listener、Pixi runtimeへ依存せず、compositionからpolicy、policyから計算へ一方向に依存することを確認する。

- [x] **Step 4: test responsibilityを監査する**

純粋計算を直接テストし、Hookと統合テストがその詳細を重複検証せず、状態機械の詳細がstage testへ集中していないことを確認する。

- [x] **Step 5: 指摘があればTDDで修正してStep 1へ戻る**

新しい責務混在ごとに、壊れうる契約の失敗テストでREDを確認し、最小抽出でGREENにする。新しい指摘がなくなるまでStep 1〜4を繰り返す。

---

### Task 7: 完全検証

- [x] **Step 1: client全体を検証する**

Run: `cd client && npm run verify`

Expected: Tailwind scan、ESLint、TypeScript、全Jest suite、Next.js production buildが成功する。

- [x] **Step 2: 差分を検証する**

Run: `git diff --check origin/main...HEAD`および`git diff --check`

Expected: 出力なし、exit code 0。

- [x] **Step 3: 未コミットを確認する**

Run: `git status --short --branch`および`git log -1 --oneline`

Expected: リファクタリング差分が未コミットで、HEADは作業開始時の`36f69d5`のまま。
