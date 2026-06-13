import { describe, it, expect } from 'vitest';
import { scoreAd, SearchProfile } from '../src/matching/ScoringEngine';
import { PropertyAd, contentFingerprint } from '../src/models/PropertyAd';

const profile: SearchProfile = {
  name: 'test',
  enabled: true,
  threshold: 40,
  locations: { cities: ['רמת גן'], neighborhoods: ['חרוזים', 'בבלי'], streets: ['אסף'] },
  required_any: [['להשכרה', 'מתפנה', 'מחליפים']],
  preferred_keywords: ['משופצת'],
  exclude_keywords: ['שותפ', 'תיווך'],
  price: { minimum: 3000, maximum: 8000 },
  rooms: { minimum: 2.5, maximum: 4 },
};

function ad(over: Partial<PropertyAd> = {}): PropertyAd {
  return {
    source: 'yad2', externalId: 'a', url: 'http://y', title: 'אסף 36',
    description: '', city: 'רמת גן', neighborhood: 'חרוזים', street: 'אסף 36',
    price: 7000, rooms: 3, collectedAt: new Date(), imageUrls: [],
    metadata: { rawText: 'להשכרה דירה משופצת בחרוזים רמת גן 3 חדרים' },
    ...over,
  };
}

describe('scoreAd', () => {
  it('matches a good ad with reasons', () => {
    const r = scoreAd(ad(), profile);
    expect(r.matched).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.reasons).toContain('Neighborhood matched: חרוזים');
    expect(r.reasons).toContain('Within budget');
  });

  it('rejects excluded keyword', () => {
    const r = scoreAd(ad({ metadata: { rawText: 'דירה בתיווך משופצת להשכרה חרוזים' } }), profile);
    expect(r.matched).toBe(false);
    expect(r.rejectionReasons[0]).toMatch(/Excluded/);
  });

  it('rejects when required_any group has no hit', () => {
    const r = scoreAd(ad({ metadata: { rawText: 'דירה למכירה בחרוזים רמת גן' } }), profile);
    expect(r.matched).toBe(false);
    expect(r.rejectionReasons.join()).toMatch(/required group/);
  });

  it('rejects out-of-range rooms', () => {
    const r = scoreAd(ad({ rooms: 5 }), profile);
    expect(r.matched).toBe(false);
  });

  it('rejects wrong location', () => {
    const r = scoreAd(
      ad({ city: 'חולון', neighborhood: undefined, street: undefined, title: 'דירה',
           metadata: { rawText: 'להשכרה דירה בחולון 3 חדרים' } }),
      profile
    );
    expect(r.matched).toBe(false);
    expect(r.rejectionReasons.join()).toMatch(/location/);
  });

  it('applies over-budget penalty instead of hard reject', () => {
    const r = scoreAd(ad({ price: 8500 }), profile);
    expect(r.reasons.join()).toMatch(/Over budget/);
  });
});

describe('contentFingerprint', () => {
  it('is stable for identical content', () => {
    expect(contentFingerprint(ad())).toBe(contentFingerprint(ad()));
  });
  it('changes when price changes (enables update detection)', () => {
    expect(contentFingerprint(ad({ price: 7000 }))).not.toBe(contentFingerprint(ad({ price: 6500 })));
  });
});
