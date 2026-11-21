# ホイールズーム感度設定 — 設計

## 目的

`Ctrl`/`Cmd`+ホイール（および ctrlKey 付きトラックパッドピンチ）のズーム感度を、マップ表示ヘッダーから調整できるようにする。

## スコープ

- UI: マップ表示時のヘッダー操作エリア（解像度フィルタの隣）。ラベル + range スライダー + 現在値。
- 永続化: `localStorage` キー `draw-my-map.ui-prefs.v1`。マップ本体・ライブラリメタには含めない。
- 影響範囲: `calculateWheelZoomRequest` / `useMapWheelZoom` のみ。`+/-` ボタン・タッチピンチは変更なし。
- 既定値 `0.0025`、範囲 `0.0005`〜`0.006`、刻み `0.0001`。

## データ

```json
{ "version": 1, "wheelZoomSensitivity": 0.0025 }
```

破損・欠損時は感度のみ既定へ修復。未知キーは encode 時に保持。

## 主要モジュール

- `client/src/domain/uiPrefs/*`
- `client/src/services/persistence/uiPrefsStorage.ts`
- `client/src/hooks/useUiPrefs.ts`
- `client/src/components/layout/WheelZoomSensitivityControl.tsx`