import { getCommandDefinition } from "@/domain/commands/commandCatalog";
import { resolveCommandAvailability } from "@/domain/commands/resolveCommandAvailability";
import { resolveCommandLabel } from "@/domain/commands/resolveCommandLabel";
import type {
  CommandAvailabilityContext,
  CommandId,
} from "@/domain/commands/commandTypes";
import type { CommandPaletteCloseReason } from "@/hooks/commandPaletteState";
import type { OperationNotice } from "@/types/operationNotice";

/**
 * パレット側の成功文言を出さないコマンド。
 * - 構造系: siblingReorder / nodeIndent / deletion 等の共有コアが notice を出す
 * - outline.add-*: 成功時は startAdded（ラベル編集開始）がフィードバック。失敗時のみ error notice
 * - outline.begin-edit: ラベル編集 UI 開始がフィードバック
 */
const SELF_NOTIFYING_IDS = new Set<CommandId>([
  "edit.duplicate-branch",
  "edit.delete-node-only",
  "edit.insert-parent",
  "edit.move-sibling-up",
  "edit.move-sibling-down",
  "edit.indent",
  "edit.outdent",
  "outline.add-root",
  "outline.add-child",
  "outline.add-sibling",
  "outline.begin-edit",
  "voice-input.start",
  "voice-input.stop",
]);

/** documentRevision を進める操作。revision 連動 notice は残らないためパレット成功文言も出さない */
const REVISION_BUMPING_IDS = new Set<CommandId>([
  "edit.undo",
  "edit.redo",
]);

export type CommandPaletteExecutionDeps = {
  closePalette: (reason: CommandPaletteCloseReason) => void;
  setReject: (message: string) => void;
  publishSuccessNotice: (notice: OperationNotice) => void;
  getAvailabilityContext: () => CommandAvailabilityContext;
  /**
   * 即時系コア。ヘッダーの enabled ガードを迂回した既存コアへの同期呼び出し。
   * 戻り値 false はコア側で実行できなかった場合（追加の拒否は出さず、成功 notice も出さない）。
   */
  runImmediateCore: (id: CommandId) => boolean;
  /** opensDialog 系: 既存 open* のみ（確定 API は呼ばない） */
  openDialogCommand: (id: CommandId) => void;
};

export function executeCommandPaletteActive(
  id: CommandId,
  deps: CommandPaletteExecutionDeps,
): void {
  const def = getCommandDefinition(id);
  if (def === undefined) return;

  const context = deps.getAvailabilityContext();
  const availability = resolveCommandAvailability(id, context);
  if (!availability.enabled) {
    deps.setReject(availability.disabledReason ?? "実行できません");
    return;
  }

  if (def.opensDialog) {
    deps.closePalette("execute-dialog");
    deps.openDialogCommand(id);
    return;
  }

  const ran = deps.runImmediateCore(id);
  deps.closePalette("execute-immediate");

  if (ran && !SELF_NOTIFYING_IDS.has(id) && !REVISION_BUMPING_IDS.has(id)) {
    const label = resolveCommandLabel(def, context);
    deps.publishSuccessNotice({
      kind: "status",
      message: `「${label}」を実行しました。`,
    });
  }
}
