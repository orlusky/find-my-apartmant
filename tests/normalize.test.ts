import { describe, it, expect } from 'vitest';
import { normalize, includesNormalized } from '../src/matching/normalize';

describe('normalize', () => {
  it('strips niqqud', () => {
    expect(normalize('שָׁלוֹם')).toBe('שלום');
  });
  it('normalizes geresh / quote variants', () => {
    expect(normalize('3 חד׳')).toBe(normalize('3 חד\''));
    expect(normalize('מ״ר')).toBe('מר');
  });
  it('collapses whitespace and dashes', () => {
    expect(normalize('רמת-גן   מרכז')).toBe('רמת גן מרכז');
  });
  it('matches across spelling variants', () => {
    expect(includesNormalized('דירה בחנייה מקורה', 'חנייה')).toBe(true);
  });
});
