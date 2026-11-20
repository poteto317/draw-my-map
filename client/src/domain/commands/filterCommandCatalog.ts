import { COMMAND_CATALOG } from "@/domain/commands/commandCatalog";
import { resolveCommandAvailability } from "@/domain/commands/resolveCommandAvailability";
import { resolveCommandLabel } from "@/domain/commands/resolveCommandLabel";
import type {
  CommandAvailabilityContext,
  FilterCommandCatalogResult,
  FilteredCommand,
} from "@/domain/commands/commandTypes";
import { normalizeNodeSearchQuery } from "@/domain/search/nodeLabelSearch";

const DEFAULT_LIMIT = 50;

function matchesQuery(item: FilteredCommand, normalizedQuery: string): boolean {
  if (normalizedQuery === "") return true;
  const haystacks = [
    item.displayLabel,
    ...item.definition.aliases,
    item.definition.categoryLabel,
  ];
  return haystacks.some((text) => normalizeNodeSearchQuery(text).includes(normalizedQuery));
}

export function filterCommandCatalog(
  query: string,
  context: CommandAvailabilityContext,
  options?: { readonly limit?: number },
): FilterCommandCatalogResult {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const normalizedQuery = normalizeNodeSearchQuery(query);
  const emptyQuery = normalizedQuery === "";

  const matched: FilteredCommand[] = [];
  for (const definition of COMMAND_CATALOG) {
    const availability = resolveCommandAvailability(definition.id, context);
    if (emptyQuery && availability.modeMismatch) continue;

    const displayLabel = resolveCommandLabel(definition, context);
    const item: FilteredCommand = { definition, availability, displayLabel };
    if (!matchesQuery(item, normalizedQuery)) continue;
    matched.push(item);
  }

  const items = matched.slice(0, Math.max(0, limit));
  return {
    items,
    overflowCount: Math.max(0, matched.length - items.length),
  };
}
