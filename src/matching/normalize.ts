/**
 * Hebrew-aware text normalization for robust keyword matching.
 * - strips niqqud (vowel points)
 * - normalizes geresh/gershayim variants (״ ׳ " ') to a single form
 * - collapses whitespace
 * - lowercases (affects embedded Latin text only; Hebrew has no case)
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud + cantillation
    .replace(/["'׳״‘’“”]/g, '') // quote/geresh variants
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** True if `needle` appears in `haystack` after both are normalized. */
export function includesNormalized(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}
