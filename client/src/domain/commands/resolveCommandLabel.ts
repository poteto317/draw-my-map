import type {
  CommandAvailabilityContext,
  CommandDefinition,
} from "@/domain/commands/commandTypes";

export function resolveCommandLabel(
  def: CommandDefinition,
  context: CommandAvailabilityContext,
): string {
  if (def.id === "view.fit-all" && context.focusing) {
    return "表示中の枝に合わせる";
  }
  return def.label;
}
