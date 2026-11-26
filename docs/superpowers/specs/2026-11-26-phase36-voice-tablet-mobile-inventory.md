# Phase 36（090/091/092）: 音声・タブレット・モバイル 操作入口インベントリ（L-061）

作成日: 2026-11-26（Task 0）。設計: `docs/superpowers/specs/2026-11-26-phase36-voice-tablet-mobile-design.md` §3〜§8（特に §6）。  
関連: `2026-11-26-phase35-learn-review-inventory.md`（`learningActive`・`editorShortcutsEnabled` 積・学習×プレゼン）、`2026-11-25-phase31-presentation-guide-inventory.md`（`presentationPlayback.screen`・再生中 `inert` 例外）、`2026-11-25-phase32-ai-assist-review-inventory.md`／`2026-11-25-phase33-ai-ideation-support-inventory.md`（AI 入口）、`2026-11-24-phase30-opml-csv-exchange-inventory.md`（取込・確定先行）、`2026-11-23-phase28-relations-groups-inventory.md`（選択ガード）、`COMMAND_CATALOG`（`client/src/domain/commands/commandCatalog.ts`）、`UseNodesReturn`（`client/src/hooks/useNodes.ts`）、`MapEditor.tsx`（`editorShortcutsEnabled`・根 `inert`）

## L-1085（適用外 / N/A）

本 Phase に **合成名は無い**。認識確定テキストは STT 結果またはユーザー発話の正規化文字列であり、UI 専用フォールバック表示名の濫用ではない。よって知見 **L-1085 は本 Phase では N/A**。

- [x] inventory 作成（列挙完了・所有者表込み）

判定語（Phase 28–35 同型）:

| 語 | 意味 |
|----|------|
| **非表示** | `visible=false`（控件が `null`、当該モードで到達不可） |
| **無効** | UI `disabled`・ショートカット無視・API 無操作（構造・ラベル編集・取込・AI 等を listening 中に塞ぐ） |
| **拒否** | 事前条件不成立で実行しない（例: listening 中の音声 start は no-op、学習中の音声 start は reason 付き拒否） |
| **無関係** | 当該条件と交差しない（閲覧のみの選択・狭幅フラグ単体など） |
| **有効** | 条件を満たせば操作可能 |
| **確定先行** | ラベルインライン編集中はヘッダー click の `blur` で確定してから別 UI を開く（Phase 30 同型） |
| **即停止** | listening 中に当該列の排他状態へ入ったら **認識を止め**、以降の final でノード追加しない（設計 §3.1） |

**横断列の読み方（本ファイル共通）**: 各行は **入口** を左に置き、右へ **保護 × 競合 × 学習中 × 再生中 × listening × ダイアログ/パレット × 関連線選択 × グループ選択 × アウトライン × 狭幅** の順で判定する。セルは「その列の状態が真（または該当）のとき、この入口がどうなるか」を表す（複数列が同時に真なら、いずれかが **拒否**／**無効**／**即停止**ならその操作は実行しない・しない想定。`mapVoiceGuards`／`mapLearnGuards`／availability で先頭一本化・L-061）。

※競合列: `conflictState === "conflict"` および `externallyDeleted` を含む。  
※ダイアログ/パレット列: `commandPalette` および Phase 30 同型の import／branchMove／`tourEditor`／`aiAssist`／`partsDialogMode` 等、根または兄弟がモーダル占有する状態を **open** とする。  
※狭幅列: `isNarrowViewport === true`（`NARROW_VIEWPORT_MAX_PX = 767`）。音声・編集可否のブロッカーにはしない（到達性・既定 viewMode は M 行）。

**テスト所有者（カテゴリ）**: **V 系＝Task 1**（`useVoiceInput`／`mapVoiceGuards`／`MapEditor` 結合）、**T 系＝Task 2**（ヒット・長押し・`dialogMouseClickedAtRef`）、**M 系＝Task 3**（`useNarrowViewport`／viewMode 既定）、**E 系＝行別表（§3.2）**。Task 0 は文書のみ。

---

## 0. 画面状態・相互排他・`editorShortcutsEnabled` / 根 `inert` の積（Task 1 で実装）

| 状態 | 識別子 | 根 `[data-map-id]` の `inert` | 編集ショートカット | パン・ズーム・折りたたみ（マップ） | 備考 |
|------|--------|------------------------------|--------------------|-------------------------------------|------|
| 通常 | `listening === false` かつ他ダイアログ `closed` かつ `learningActive === false` かつ `presentationPlayback.screen === "closed"` | `!editorShortcutsEnabled` 時のみ `inert`（既存） | `editorShortcutsEnabled` 真なら有効 | 有効 | 現行＋Phase 35 済み積 |
| **listening 中** | `listening === true`（**メモリのみ・永続化しない**） | **`learningActive` 例外をコピーしない**＝`!editorShortcutsEnabled` なら **`inert` を付ける** | **編集系のみ停止**（積に `!listening` を追加。履歴・構造・パレット編集・取込・ラベル・AI 等） | **inert により到達困難になり得る**（学習中・再生中とは異なる。L-522／L-1211／プラン Task 1） | 音声トグル OFF・確定→`insertForest`・閲覧系の一部（§3 E6 等）は到達可 |
| **学習中** | `learningActive === true` | **`inert` を付けない**（Phase 35 §0 維持） | 編集系停止（`!learningActive`） | **有効** | 音声 **開始は拒否**（§0.1） |
| **プレゼン中** | `presentationPlayback.screen === "playing"` | **`inert` なし**（Phase 31 維持） | 編集系停止 | **有効** | 音声 **開始は拒否** |
| 学習＋プレゼン同時 | — | **到達不可** | — | — | Phase 35 相互排他維持 |

`listening` と `learningActive`／`presentationPlayback.screen`（設計 §3.1・Phase 35 §0 と整合）:

| 操作 | 通常 | listening 中 | 学習中 | プレゼン中 |
|------|------|--------------|--------|------------|
| 音声 start（トグル ON／`voice-input-start`） | 可（他ブロッカー除く） | **拒否（no-op・通知なし）** | **拒否** | **拒否** |
| 音声 stop（OFF／`voice-input-stop`） | 到達不可（既 OFF） | **有効** | **有効**（学習中でも停止可） | **有効** |
| 学習開始 | 可 | **拒否**（listening 中は編集モード排他） | 終了のみ | **拒否** |
| プレゼン開始 | 可（steps あり） | **拒否** | **拒否** | 拒否（二重） |
| 排他ダイアログ／パレットを開く | 可（条件付き） | 開いた時点で音声 **即停止** | 同左 | 同左 |
| 学習／プレゼン開始 | 可／拒否 | **開始時 listening が ON なら先に拒否**（学習・プレゼン側は listening を自動 ON にしない） | — | — |

`editorShortcutsEnabled` 予定積（Task 1・Phase 35 継承）:

```
shortcutsEnabled
&& commandPalette.screen === "closed"
&& …（既存: outlineImport, exchangeImport, tourEditor, presentationPlayback,
     branchMove, branchExtract, labelReplace, nodeSplit, nodeMerge,
     aiAssist, partsDialogMode, relationPartner, crossMap, persistence,
     learningActive 等）
&& !listening                           // 新規（listening 中は偽＝編集キー停止）
```

根の `inert` 予定式（Task 1・**listening 例外なし**）:

```
inert={!editorShortcutsEnabled && !playingPresentation && !learningActive}
```

（**listening 中**は `editorShortcutsEnabled === false` になりうるが、`learningActive`／`playingPresentation` と違い **`!listening` を inert 条件に足さない**。よって listening 中は inert が付き得る。学習中・再生中の inert 例外は Phase 35／31 のまま維持。）

アウトライン／マップ鍵 handler の `enabled`（Task 1）:

- `outlineActions.enabled`／マップ編集キー束:** `editorShortcutsEnabled` に従う**（`learningActive` のように listening 中も OR で緩めない）。
- 中間認識ラベル（`interimTranscript`）は **`isEditableTarget` にならない**（設計 §8 L-522）。

音声専用（`editorShortcutsEnabled` 外または別経路・Task 1）:

| 操作 | listening 中 | 備考 |
|------|--------------|------|
| トグル ON／OFF・パレット start/stop | start は no-op（既 ON）／stop **有効** | 設計 §7 |
| 確定 final → `insertForest` | **有効**（空 final はスキップ） | 1 Undo・`VoiceNodeAddOutcome` |
| 排他状態への遷移 | **即停止**＋通知 | 以降 final は追加しない |

---

## 1. 設計 §6 新入口 — V（音声・Task 1）

| # | 入口 | コマンド ID（追加） | 関与 | 実装（予定） |
|---|------|---------------------|------|----------------|
| V1 | ヘッダー **音声入力** トグル ON | `voice-input-start` | メモリ `listening` | `VoiceInputControl.tsx`／`useVoiceInput.ts` |
| V2 | トグル OFF／stop | `voice-input-stop` | メモリ | 同上 |
| V3 | パレット「音声入力を開始／停止」 | 同上 | メモリ | `commandCatalog`／`resolveCommandAvailability` |
| V4 | 認識 **確定**（`isFinal`）→ ノード追加 | （専用 ID なし・hook 内） | 文書（`insertForest` 1 Undo） | `useVoiceInput`＋`MapEditor` 渡し `insertForest` |

### 1.1 V×条件（正本マトリクス）

| # | 入口 | 保護 | 競合※ | 学習中 | 再生中 | listening | ダイアログ/パレット open | 関連線主選択 | グループ主選択 | アウトライン表示 | 狭幅 | 備考 |
|---|------|------|--------|--------|--------|-----------|--------------------------|--------------|----------------|------------------|------|------|
| V1 | 音声 start | **拒否** | **拒否** | **拒否** | **拒否** | **拒否（no-op）** | **拒否** | **拒否** | **拒否** | **有効** | **有効** | 未対応ブラウザも **拒否**（L-001） |
| V2 | 音声 stop | 有効 | 有効 | 有効 | 有効 | **有効**（ON 時のみ） | 有効 | 無関係 | 無関係 | 有効 | 有効 | 既 OFF は no-op |
| V3 | パレット start/stop | V1 と同型 | 同左 | 同左 | 同左 | 同左 | 同左 | 同左 | 同左 | 同左 | 同左 | V1/V2 と同一状態機械 |
| V4 | 確定→追加 | 有効※ | 有効※ | 有効※ | 有効※ | **有効**（ON かつ停止前） | **即停止**後は **拒否** | フォールバック **root** | フォールバック **root** | 有効 | 無関係 | ※開始拒否を通過後のみ。選択 1 件→child、それ以外→root（設計 §3.3） |

---

## 2. 設計 §4 新入口 — T（タブレット・Task 2）

| # | 入口 | 関与 | 実装（予定） |
|---|------|------|----------------|
| T1 | タッチ時ノード **ヒットパディング**（8–12 logical px） | 閲覧（選択・ドラッグの当たり） | Pixi hit test／`stageInteractions` |
| T2 | タッチ **長押し** → コンテキストメニュー | 閲覧＋既存メニュー | long-press timer／coordinator 優先順位 |

### 2.1 T×条件

| # | 入口 | 保護 | 競合※ | 学習中 | 再生中 | listening | ダイアログ/パレット open | 関連線主選択 | グループ主選択 | アウトライン表示 | 狭幅 | 備考 |
|---|------|------|--------|--------|--------|-----------|--------------------------|--------------|----------------|------------------|------|------|
| T1 | タッチヒット拡大 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **非適用**（マップ） | 無関係 | `pointerType === "touch"` のみ |
| T2 | 長押しメニュー | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **閉鎖直後無視窓**（L-408） | 無関係 | 無関係 | **非適用** | 無関係 | 2 本指・ピンチ中は **開始しない**（coordinator 契約） |

listening・学習・再生は T 行の **ブロッカーにしない**（メニュー内の構造操作は E12／`editorShortcutsEnabled` 側で無効）。

---

## 3. 設計 §5 新入口 — M（狭幅・Task 3）

| # | 入口 | 関与 | 実装（予定） |
|---|------|------|----------------|
| M1 | 狭幅進入時 **outline 既定** | メモリ `viewMode`／`userChoseMapOnNarrow` | `useNarrowViewport.ts`／`MapEditor` `applyViewMode` |
| M2 | 狭幅で **マップ手動切替** | 同上（フラグ立て） | `changeViewMode` 配線 |
| M3 | 狭幅ヘッダー **横スクロール**（表示切替・音声・保存到達） | レイアウトのみ | `AppHeader` CSS／構造 |

### 3.1 M×条件

| # | 入口 | 保護 | 競合※ | 学習中 | 再生中 | listening | ダイアログ/パレット open | 関連線主選択 | グループ主選択 | アウトライン表示 | 狭幅 | 備考 |
|---|------|------|--------|--------|--------|-----------|--------------------------|--------------|----------------|------------------|------|------|
| M1 | outline 既定 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 結果 **outline** | **有効** | `userChoseMapOnNarrow` 時 **スキップ（通知なし）** |
| M2 | マップ手動選択 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | **map** | **有効** | フラグ立て・幅往復でも上書きしない |
| M3 | ヘッダー到達性 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 無関係 | 両モード | **有効** | V1 トグル visible は狭幅でも維持 |

`userChoseMapOnNarrow` リセット: **`mapId` 変更（再マウント）**、**保護モード等での編集画面再構築**のみ（設計 §5.2）。`viewMode` 切替・幅変化だけではリセットしない。

---

## 4. 既存 UI 入口 — E（listening 列必須・Task 1 中心）

Phase 35 inventory §3 を **listening** 列付きで拡張。プレゼン専用・学習専用 UI は listening 中は原則到達不可または相互排他（§0.1）。

### 4.1 E×条件（構造・取込・AI・学習・プレゼン・パレット他）

| # | 入口 | 保護 | 競合※ | 学習中 | 再生中 | listening | ダイアログ/パレット open | 関連線主選択 | グループ主選択 | アウトライン表示 | 狭幅 | listening 時の根拠 |
|---|------|------|--------|--------|--------|-----------|--------------------------|--------------|----------------|------------------|------|---------------------|
| E1 | 閲覧「戻る」「進む」 | 有効 | 有効 | **有効** | 無効 | **無効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | `editorShortcutsEnabled` 積（学習とは差分） |
| E1b–E1g | 枝集中・展開・折畳・fit・パンくず | 有効 | 有効 | **有効** | 無効 | **無効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | 同上 |
| E2 | 表示ブックマーク | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | 編集系積 |
| E3 | 箇条書き取込 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | 構造・取込 |
| E4 | OPML／CSV 取込 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | 同上 |
| E5 | JSON 読み込み（全文置換） | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | 構造 |
| E6 | 各種書き出し | 有効 | 有効 | 有効 | 有効 | **有効** | 有効 | 無関係 | 無関係 | 有効 | 無関係 | download のみ（Phase 31 同型） |
| E7 | アウトライン行ラベル・構造 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | **対象 UI** | 無関係 | outline `enabled`＝`editorShortcutsEnabled` |
| E8 | マップ・ラベルインライン編集 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 非適用 | 無関係 | 構造・ラベル |
| E9 | ヘッダー構造操作群 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | §0 編集ロック |
| E10 | コマンドパレット（開く） | 有効 | 有効 | 有効 | 有効 | **即停止**／開くと **無効**（編集系） | — | 無関係 | 無関係 | 有効 | 無関係 | 開状態は V1 **拒否**・listening **即停止** |
| E11 | 右パネル属性編集 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | 属性 |
| E12 | コンテキストメニュー（構造・関連・グループ） | 無効 | 無効 | 無効 | 無効 | **無効**（T2 開くのは可・中身は無効） | 無効 | 無効 | 無効 | 非適用 | 無関係 | T2 と組み合わせ Task 2 |
| E13 | ノード／枝 DnD・ピンドラッグ | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 非適用 | 無関係 | 構造・座標 |
| E14 | 履歴 Undo／Redo（文書） | 無効 | 無効 | **有効** | **有効** | **有効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | 音声追加 1 Undo の巻き戻し可 |
| L35-N1 | 学習開始／終了（L1–L2） | 開始可 | 無効 | — | 開始**拒否** | 開始**拒否** | 無効 | 有効 | 有効 | 有効 | 無関係 | Phase 35 ＋ §0.1 |
| L35-L3–L8 | 学習開示・リセット・カード | 条件付き | 無効 | 学習中のみ | 到達不可 | **無効** | 無効 | 条件付き | 条件付き | 有効 | 無関係 | 学習中以外は従来どおり |
| P31-N1 | ツアー編集を開く | 無効 | 無効 | 無効 | 無効 | **無効** | — | 有効 | 有効 | 有効 | 無関係 | ダイアログ open で V **即停止** |
| P31-N3 | プレゼン開始 | 有効 | 無効 | **拒否** | 拒否 | **拒否** | 無効 | 有効 | 有効 | 有効 | 無関係 | §0.1 |
| P31-N4–N7 | 再生バー・再生キー | 有効 | 無効 | 到達不可 | 有効 | **到達不可**（開始不可） | 無効 | 無関係 | 無関係 | マップ中心 | 無関係 | listening と再生同時不可 |
| AI-N | 右パネル AI 支援 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | Phase 32–33 |
| AI-A | AI 採用適用 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | 同上 |
| E15 | `view.map`／`view.outline` 切替 | 有効 | 有効 | **有効** | 有効 | **無効** | 無効 | 無関係 | 無関係 | — | **M1/M2 と整合** | C1–C2・狭幅は Task 3 |
| E16 | fit・focus・expand/collapse（C3–C8） | 有効 | 有効 | **有効** | 無効 | **無効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | listening＝編集積に含める |
| E17 | 検索フォーカス（C25–C26） | 有効 | 有効 | **有効** | 有効 | **無効** | 無効 | 無関係 | 無関係 | 有効 | 無関係 | 閲覧 UI も積で停止 |
| E18 | パレット **MUTATING** 一括 | 無効 | 無効 | 無効 | 無効 | **無効** | 無効 | 無効 | 無効 | 有効 | 無関係 | `MUTATING_IDS`＋`!listening`（Task 1） |

### 4.2 E 行ごとのテスト所有者（必須）

| # | 入口（要約） | Task | 主な検証ファイル／観点 |
|---|--------------|------|-------------------------|
| E1, E1b–E1g | 表示ナビ | **1** | `MapEditor` 結合・`editorShortcutsEnabled` listening 時 false |
| E2 | ブックマーク | **1** | 同上 |
| E3–E5 | 取込・全文置換 | **1** | `mapVoiceGuards`＋取込ボタン `disabled` |
| E6 | 書き出し | **1** | listening 中も download 可 |
| E7–E9 | アウトライン・ラベル・ヘッダー構造 | **1** | outline `enabled`／`NodeLabelEditor` |
| E10 | パレット | **1** | 開くと即停止・voice／learn start 拒否 |
| E11 | 属性パネル | **1** | `NodeDetailPanel` disabled 積 |
| E12 | コンテキストメニュー | **2**＋**1** | Task 2: 長押しで開く／Task 1: 構造項無効 |
| E13 | DnD | **2**＋**1** | Task 2: タッチヒット／Task 1: listening 中ドラッグ不可 |
| E14 | Undo／Redo | **1** | 音声 `insertForest` 後 Undo |
| L35-N1 | 学習トグル | **1** | listening 中開始拒否・`mapLearnGuards` 整合 |
| L35-L3–L8 | 学習本体 | **1** | listening 中は学習専用も原則不可（終了は可） |
| P31-N1 | ツアー編集 | **1** | ダイアログ＋即停止 |
| P31-N3 | プレゼン開始 | **1** | 相互拒否 |
| P31-N4–N7 | 再生 UI | **1** | listening 時再生到達不可 |
| AI-N, AI-A | AI | **1** | `resolveAiAssistEntryAvailability`＋`!listening` |
| E15 | view 切替 | **3**＋**1** | Task 3: 狭幅既定／Task 1: listening 中キー無効 |
| E16, E17 | fit・検索 | **1** | `commandCatalog` availability |
| E18 | MUTATING_IDS | **1** | `commandCatalog.test.ts`・palette dispatch |

---

## 5. 予定 API・hook 操作（Task 1）

| # | 操作 | 保護 | 競合※ | 学習中 | 再生中 | listening | 根拠 |
|---|------|------|--------|--------|--------|-----------|------|
| A1 | `voice.start`（`listening` 真） | **拒否** | **拒否** | **拒否** | **拒否** | no-op（既 ON） | メモリ・L-001 |
| A2 | `voice.stop` | 有効 | 有効 | 有効 | 有効 | **有効** | メモリ |
| A3 | 確定→`insertForest` | 有効※ | 有効※ | 有効※ | 有効※ | **有効** | 文書・§3.3 |
| A4 | 排他入室→`stopListening` | — | — | **即停止** | **即停止** | — | 設計 §3.1 |

`mapVoiceGuards.ts`（Task 1）で **操作ごとにガードをコピーせず** 先頭で共通判定（L-061）。`assertNodesEditable`／`learningActive`／`presentationPlayback`／`listening`／ダイアログ open／選択形を inventory 行と揃える。

---

## 6. `useNodes` 公開操作×listening（Phase 35 §4 拡張）

状態プロパティは列挙対象外。※競合は Phase 28 同型。列 **listening**＝`listening === true`。

| # | 操作 | 保護 | 競合※ | 学習中 | 再生中 | listening | 根拠 |
|---|------|------|--------|--------|--------|-----------|------|
| U1–U3 | add 系 | 無効 | 無効 | 無効 | 無効 | **無効** | 構造 |
| U4–U13 | 選択系 | 無関係 | 無関係 | 無関係 | 無関係 | **無関係** | 選択可（確定先のため） |
| U14–U42 | 構造・属性・統合等 | 無効 | 無効 | 無効 | 無効 | **無効** | §4 E 行 |
| U43–U46 | レイアウト・`replaceMap` | 無効 | 無効 | 無効 | 無効 | **無効** | 文書級 |
| U47 | `undo`／`redo` | 無効 | 無効 | 有効 | 有効 | **有効** | E14 |
| U48 | `beginMoveHistory` | 無効 | 無効 | 無関係 | 無関係 | 無関係 | 内部 |

音声ノード追加は **`insertForest` 経由（hook）**。`useNodes` 直接の mutator は listening 中 **呼ばない**（ガード＋UI 無効）。

---

## 7. コマンドパレット（`COMMAND_CATALOG`）

### 7.1 新規 voice 行（Task 1）

| # | id | 保護 | 競合※ | 学習中 | 再生中 | listening | アウトライン | 狭幅 |
|---|-----|------|--------|--------|--------|-----------|--------------|------|
| N-V1 | `voice-input-start` | **拒否** | **拒否** | **拒否** | **拒否** | **拒否** | **有効** | **有効** |
| N-V2 | `voice-input-stop` | 有効 | 有効 | 有効 | 有効 | **有効** | 有効 | 有効 |

### 7.2 既存項目×listening（方針）

listening 中は `editorShortcutsEnabled === false` のため **C11–C24・C27–C30・AI 6 件・learn 開始系は無効**。`voice-input-stop`・**C9–C10（undo/redo）**・**C1–C2 は Task 1 で inventory 確定**（C1–C2／C3–C8／C25–C26 は **無効**、C9–C10 は **有効**、E6 書き出しコマンドは **有効**）。learn 系は Phase 35 どおり学習中のみ有効だが、**listening 中は learn 開始含め無効**。

### 7.3 `MUTATING_IDS`（Task 1）

`commandCatalog` の MUTATING 集合は **listening 中は一括無効**（`resolveCommandAvailability`／palette dispatch）。代表: 構造編集・取込・AI 採用・learn リセット／生成・presentation 編集系。例外: **`voice-input-stop`**、**undo/redo**、**export 系**（inventory E6／§7.2 と一致させる）。

---

## 8. Phase 25 inventory 抜粋×listening

| # | 入口（Phase25） | 学習中（参考） | listening | 根拠 |
|---|-----------------|----------------|-----------|------|
| P1 | ノードドラッグ | 無効 | **無効** | E13 |
| P2 | ラベルインライン編集 | 無効 | **無効** | E8 |
| P3 | 削除・Backspace | 無効 | **無効** | 編集ショートカット |
| P4 | 分割・統合・親挿入 | 無効 | **無効** | E9 |
| P5 | 属性パネル更新 | 無効 | **無効** | E11 |
| P6 | 兄弟 DnD | 無効 | **無効** | E13 |
| P7 | クリップボード貼付 | 無効 | **無効** | U33 |
| P8–P11 | 整列・書式・枝切り出し | 無効 | **無効** | U 行 |

---

## 9. 行数サマリ

| 区分 | 行数（入口 ID 数） |
|------|-------------------|
| §1 V（V1–V4） | **4** |
| §2 T（T1–T2） | **2** |
| §3 M（M1–M3） | **3** |
| §4 E（E1–E18＋L35＋P31＋AI） | **23**（集約行含む） |
| §4.2 E テスト所有者 | **23** 行（E 系と 1:1） |
| §5 API（A1–A4） | **4** |
| §6 `useNodes` 要約 | **6** 行（U 集合） |
| §7 voice 新規（N-V1–N-V2） | **2** |
| §8 Phase25 抜粋 | **11** |
| **新入口合計（V+T+M）** | **9** |
| **listening ガード合計（概算・E+U+C+P+A+V）** | **≥130** |

---

## 10. Task 1–3 統合テスト代表経路（チェックリスト・未実装）

**Task 1（音声・090＋E 系 listening）**

- [x] V1 開始拒否（保護・競合・学習・再生・ダイアログ・関連線・グループ・未対応ブラウザ）
- [x] V1 再 start no-op、V2 stop、排他入室即停止
- [x] V4 `insertForest` 1 Undo・空 final スキップ・子／root フォールバック
- [x] `editorShortcutsEnabled` に `!listening`・**listening 中はヘッダー到達・編集本体 inert**（learning 例外はコピーしない）
- [x] outline／map キー handler が listening 中無効（OR 緩和なし）
- [x] §4.2 の E 行代表（E3–E11・E18・L35-N1・P31-N3・AI）RED/GREEN
- [x] L-060 必須 props 配線・L-166 クリア

**Task 2（タブレット・091）**

- [x] T1 タッチのみパディング
- [x] T2 長押しメニュー・ピンチ中不開始・閉鎖直後無視（E12 分担）
- [x] E12／E13 のタッチ経路（所有者表どおり）

**Task 3（狭幅・092）**

- [ ] M1 狭幅 outline 既定・`userChoseMapOnNarrow` スキップ
- [ ] M2 手動 map・幅往復上書きなし
- [ ] E15 狭幅＋view コマンド整合・mapId／保護でフラグリセット

---

## 11. 型コメント・docs 同期（Task 4 / L-203）

| 箇所 | 状態 |
|------|------|
| 本 inventory §0–§10 | **Task 0 済** |
| `features.md` 音声・タッチ・狭幅 | Task 4 |
| `browser-test-cases.md` | Task 4 |
| `ROADMAP.md` 090–092 | Task 4 |
| 設計 §6 → 本ファイル | **正本リンク済** |