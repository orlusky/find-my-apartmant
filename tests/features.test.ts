import { describe, it, expect } from 'vitest';
import { extractPrice, extractRooms, extractSize, hasFeature, isBroker } from '../src/matching/features';

describe('extractPrice', () => {
  it.each([
    ['שכ"ד 7500 לחודש', 7500],
    ['₪ 6,300', 6300],
    ['5000 ש"ח', 5000],
    ['4.5K', 4500],
    ['4K', 4000],
  ])('parses %s', (text, expected) => {
    expect(extractPrice(text)).toBe(expected);
  });
  it('ignores out-of-range numbers', () => {
    expect(extractPrice('דירה מספר 12')).toBeNull();
    expect(extractPrice('100000 ש"ח')).toBeNull();
  });
});

describe('extractRooms', () => {
  it.each([
    ['3 חדרים', 3],
    ["3.5 חד'", 3.5],
    ['דירת 4 חדרים', 4],
  ])('parses %s', (t, e) => expect(extractRooms(t)).toBe(e));
});

describe('extractSize', () => {
  it('parses m²', () => {
    expect(extractSize('72 מ"ר')).toBe(72);
    expect(extractSize('100 מטר')).toBe(100);
  });
});

describe('features', () => {
  it('detects amenities with synonyms', () => {
    expect(hasFeature('יש חנייה מקורה', 'parking')).toBe(true);
    expect(hasFeature('דירה משופצת', 'renovated')).toBe(true);
    expect(hasFeature('בלי מעלית', 'elevator')).toBe(true); // detection only
  });
  it('flags broker listings', () => {
    expect(isBroker('דירה בתיווך רימקס')).toBe(true);
    expect(isBroker('בעל הבית משכיר')).toBe(false);
  });
});
