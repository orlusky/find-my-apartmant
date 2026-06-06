/**
 * include_groups: AND of ORs — every group must have at least one keyword match.
 * exclude_keywords: any match disqualifies the post.
 * price: if a price is found in the text and it falls outside [min,max], the post is rejected.
 *        if no price is detected, the post is allowed through.
 */
export function matchesFilters(
  text: string,
  includeGroups: string[][],
  excludeKeywords: string[],
  price?: { min?: number; max?: number }
): boolean {
  const lower = text.toLowerCase();

  const allGroupsMatch = includeGroups.every(group =>
    group.some(kw => lower.includes(kw.toLowerCase()))
  );
  if (!allGroupsMatch) return false;

  if (excludeKeywords.some(kw => lower.includes(kw.toLowerCase()))) return false;

  if (price && (price.min !== undefined || price.max !== undefined)) {
    const detected = extractPrice(text);
    if (detected !== null) {
      if (price.min !== undefined && detected < price.min) return false;
      if (price.max !== undefined && detected > price.max) return false;
    }
  }

  return true;
}

/** Returns the first matching keyword per group — use for debug logging. */
export function matchedKeywords(text: string, includeGroups: string[][]): string[] {
  const lower = text.toLowerCase();
  return includeGroups.map(group =>
    group.find(kw => lower.includes(kw.toLowerCase())) ?? '(no match)'
  );
}

export function extractPrice(text: string): number | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/(\d+)[.,](\d)\s*[Kk]/, m => parseInt(m[1]) * 1000 + parseInt(m[2]) * 100],
    [/(\d+)\s*[Kk](?!\w)/, m => parseInt(m[1]) * 1000],
    [/₪\s*([\d,]+)/, m => parseInt(m[1].replace(/,/g, ''))],
    [/([\d,]+)\s*₪/, m => parseInt(m[1].replace(/,/g, ''))],
    [/([\d,]+)\s*ש["״׳"']?ח/, m => parseInt(m[1].replace(/,/g, ''))],
    [/([\d,]+)\s*(?:לחודש|בחודש)/, m => parseInt(m[1].replace(/,/g, ''))],
  ];

  for (const [pattern, extract] of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = extract(match);
      if (value >= 1500 && value <= 40000) return value;
    }
  }

  return null;
}
