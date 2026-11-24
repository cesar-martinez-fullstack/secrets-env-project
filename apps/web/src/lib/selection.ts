export function toggleId(selected: ReadonlySet<number>, id: number): Set<number> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function pruneSelection(
  selected: ReadonlySet<number>,
  existing: readonly number[],
): Set<number> {
  const valid = new Set(existing);
  return new Set([...selected].filter((id) => valid.has(id)));
}

export function toggleAllIds(selected: ReadonlySet<number>, all: readonly number[]): Set<number> {
  return all.length > 0 && all.every((id) => selected.has(id)) ? new Set() : new Set(all);
}

const LISTED_NAMES = 10;

export function summarizeNames(
  names: readonly string[],
  moreLabel: (count: number) => string,
): string {
  const listed = names.slice(0, LISTED_NAMES).join(', ');
  const rest = names.length - LISTED_NAMES;
  return rest > 0 ? `${listed} ${moreLabel(rest)}` : listed;
}
