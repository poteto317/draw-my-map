# ホイールズーム感度設定 — 実装計画

## Global Constraints

- コミットは責務単位。`client` 変更後は `npm run verify`。
- TDD: ドメイン・ストレージ・wheelZoom・UI のテストを先に追加。

## Tasks

1. **ドメイン** `uiPrefsModel` / `uiPrefsCodec` + テスト
2. **ストレージ** `uiPrefsStorage` + テスト
3. **wheelZoom** 感度引数 + テスト、`useMapWheelZoom` ref 更新 + テスト
4. **UI** `useUiPrefs`, `WheelZoomSensitivityControl`, `MapEditor` / `MapStage` 配線
5. **ドキュメント** `features.md`, `ROADMAP.md`, 本計画・設計

## Interfaces

- `clampWheelZoomSensitivity(n: number): number`
- `readUiPrefs(storage): { prefs, document, repaired }`
- `useUiPrefs(storage?) => { prefs, setWheelZoomSensitivity }`
- `MapStage` prop `wheelZoomSensitivity?: number`