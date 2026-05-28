import { Group } from '../types';

interface ScoredGroup {
  group: Group;
  score: number;
  matchedKeywords: string[];
}

export function detectGroup(
  title: string,
  description: string,
  groups: Group[],
  threshold: number = 0.4
): Group | null {
  const text = `${title} ${description}`.toLowerCase();
  const words = text.split(/\s+/);

  const scored: ScoredGroup[] = groups.map((group) => {
    const matchedKeywords: string[] = [];

    for (const keyword of group.keywords) {
      const kw = keyword.toLowerCase();
      if (text.includes(kw)) {
        matchedKeywords.push(keyword);
      }
    }

    const score =
      group.keywords.length > 0
        ? matchedKeywords.length / group.keywords.length
        : 0;

    return { group, score, matchedKeywords };
  });

  const best = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (!best || best.score < threshold) {
    // Fallback: check if any group name appears in the text
    const byName = groups.find((g) => text.includes(g.name.toLowerCase()));
    return byName ?? null;
  }

  return best.group;
}

export function rankGroupSuggestions(
  title: string,
  description: string,
  groups: Group[]
): Array<{ group: Group; score: number }> {
  const text = `${title} ${description}`.toLowerCase();

  return groups
    .map((group) => {
      let matches = 0;
      for (const kw of group.keywords) {
        if (text.includes(kw.toLowerCase())) matches++;
      }
      const score = group.keywords.length > 0 ? matches / group.keywords.length : 0;
      return { group, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}
