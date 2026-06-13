import { describe, it, expect } from 'vitest';
import { formatMessage } from '../src/telegram/TelegramClient';
import { PropertyAd } from '../src/models/PropertyAd';
import { MatchResult } from '../src/matching/ScoringEngine';

const ad: PropertyAd = {
  source: 'yad2', externalId: 'a', url: 'https://yad2.co.il/item/x',
  title: 'אסף 36', city: 'רמת גן', neighborhood: 'חרוזים', street: 'אסף 36',
  price: 7700, rooms: 3, sizeSqm: 72, collectedAt: new Date(),
  publishedAt: new Date(Date.now() - 10 * 60000), imageUrls: [], metadata: {},
};

const match: MatchResult = {
  matched: true, score: 87,
  reasons: ['Within budget', 'Neighborhood matched: חרוזים'], rejectionReasons: [],
};

describe('formatMessage', () => {
  it('renders a new-match message', () => {
    const msg = formatMessage(ad, match, 'new');
    expect(msg).toContain('Score: 87/100');
    expect(msg).toContain('₪7,700');
    expect(msg).toContain('🛏 3 rooms');
    expect(msg).toContain('📐 72 m²');
    expect(msg).toContain('Within budget');
    expect(msg).toContain('https://yad2.co.il/item/x');
  });

  it('caps displayed score at 100', () => {
    const msg = formatMessage(ad, { ...match, score: 130 }, 'new');
    expect(msg).toContain('Score: 100/100');
  });

  it('renders a price-drop update', () => {
    const msg = formatMessage({ ...ad, price: 6800 }, match, 'update', 7700);
    expect(msg).toContain('Price drop');
    expect(msg).toContain('was ₪7,700');
  });
});
