import type { Series, StageElement, StageShot } from "@/lib/store";

function shotSearchText(shot: StageShot): string {
  return [
    shot.narration,
    shot.imagePrompt,
    ...(shot.dialogue ?? []).map((line) => line.line),
  ].filter(Boolean).join(" ");
}

function pushUnique(list: string[], id: string | undefined) {
  if (id && !list.includes(id)) list.push(id);
}

export function suggestedElementRefsForShot(shot: StageShot, series: Series): string[] {
  const bible = series.bible;
  const text = shotSearchText(shot);
  const result: string[] = [];
  const existing = shot.elementRefs ?? [];

  for (const line of shot.dialogue ?? []) pushUnique(result, line.speakerId);

  const chars = bible.filter((el) => el.kind === "character");
  const locs = bible.filter((el) => el.kind === "location");
  const props = bible.filter((el) => el.kind === "prop");

  for (const char of chars) {
    if (char.name && text.includes(char.name)) pushUnique(result, char.id);
  }
  for (const loc of locs) {
    if (loc.name && text.includes(loc.name)) pushUnique(result, loc.id);
  }
  for (const prop of props) {
    if (prop.name && text.includes(prop.name)) pushUnique(result, prop.id);
  }

  const hasLocation = result.some((id) => bible.find((el) => el.id === id)?.kind === "location")
    || existing.some((id) => bible.find((el) => el.id === id)?.kind === "location");
  if (!hasLocation && locs.length === 1) pushUnique(result, locs[0].id);

  for (const id of existing) pushUnique(result, id);
  return result.filter((id) => !!bible.find((el) => el.id === id));
}

export function elementRefSummary(refIds: string[], bible: StageElement[]): string {
  return refIds
    .map((id) => bible.find((el) => el.id === id)?.name)
    .filter(Boolean)
    .join("、");
}
