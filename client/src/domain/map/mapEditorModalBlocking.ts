/** ダイアログ／パレット表示中に編集ショートカットと音声開始を止めるための入力 */
export type MapEditorModalBlockingInput = {
  readonly commandPaletteOpen: boolean;
  readonly printSettingsOpen: boolean;
  readonly outlineImportOpen: boolean;
  readonly exchangeImportOpen: boolean;
  readonly tourEditorOpen: boolean;
  readonly presentationPlaybackOpen: boolean;
  readonly branchMoveOpen: boolean;
  readonly branchExtractOpen: boolean;
  readonly labelReplaceOpen: boolean;
  readonly nodeSplitOpen: boolean;
  readonly nodeMergeOpen: boolean;
  readonly aiAssistOpen: boolean;
  readonly partsDialogOpen: boolean;
  readonly crossMapSearchOpen: boolean;
  readonly brokenLinksDialogOpen: boolean;
  readonly persistenceConfirmOpen: boolean;
  readonly shareDialogOpen: boolean;
};

/** モーダル／パレットが1つでも開いていれば編集入口を止める（L-061 と音声 dialog-open ガードの正本） */
export function resolveMapEditorModalsBlockEditing(input: MapEditorModalBlockingInput): boolean {
  return input.commandPaletteOpen
    || input.printSettingsOpen
    || input.outlineImportOpen
    || input.exchangeImportOpen
    || input.tourEditorOpen
    || input.presentationPlaybackOpen
    || input.branchMoveOpen
    || input.branchExtractOpen
    || input.labelReplaceOpen
    || input.nodeSplitOpen
    || input.nodeMergeOpen
    || input.aiAssistOpen
    || input.partsDialogOpen
    || input.crossMapSearchOpen
    || input.brokenLinksDialogOpen
    || input.persistenceConfirmOpen
    || input.shareDialogOpen;
}