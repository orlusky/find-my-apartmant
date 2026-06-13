import { normalize } from './normalize';

/**
 * Synonym groups for amenity / attribute detection. Each canonical feature maps
 * to the spelling variants that appear in real Hebrew listings. Extendable from
 * config later, but these deterministic defaults cover the common cases.
 */
export const FEATURE_SYNONYMS: Record<string, string[]> = {
  parking:   ['חניה', 'חנייה', 'חנאיה', 'parking', 'מקום חניה'],
  elevator:  ['מעלית', 'elevator'],
  balcony:   ['מרפסת', 'מרפסת שמש', 'balcony'],
  renovated: ['משופצת', 'משופץ', 'שופצה', 'renovated'],
  furnished: ['מרוהטת', 'מרוהט', 'ריהוט מלא', 'furnished'],
  storage:   ['מחסן', 'storage'],
  ac:        ['מזגן', 'מיזוג', 'מזגנים', 'מיזוג מרכזי'],
  bars:      ['סורגים', 'סורג'],
};

/** Markers that the poster is a broker / agency rather than a private seller. */
export const BROKER_MARKERS = ['תיווך', 'מתיווך', 'תיוווך', 'בלעדיות', 'נדלן', 'נדל"ן', 'remax', 'רימקס'];

export function hasFeature(text: string, feature: string): boolean {
  const variants = FEATURE_SYNONYMS[feature];
  if (!variants) return false;
  const n = normalize(text);
  return variants.some(v => n.includes(normalize(v)));
}

export function isBroker(text: string): boolean {
  const n = normalize(text);
  return BROKER_MARKERS.some(m => n.includes(normalize(m)));
}

/** Extract the first plausible monthly rent (₪) from free text, or null. */
export function extractPrice(text: string): number | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => number][] = [
    [/(\d+)[.,](\d)\s*[kK]/, m => +m[1] * 1000 + +m[2] * 100],
    [/(\d+)\s*[kK](?!\w)/, m => +m[1] * 1000],
    [/₪\s*([\d,]+)/, m => +m[1].replace(/,/g, '')],
    [/([\d,]+)\s*₪/, m => +m[1].replace(/,/g, '')],
    [/([\d,]+)\s*ש["'׳״]?ח/, m => +m[1].replace(/,/g, '')],
    [/([\d,]+)\s*(?:לחודש|בחודש)/, m => +m[1].replace(/,/g, '')],
  ];
  for (const [re, f] of patterns) {
    const m = text.match(re);
    if (m) {
      const v = f(m);
      if (v >= 1500 && v <= 40000) return v;
    }
  }
  return null;
}

/** Extract number of rooms (supports "3", "3.5", "3 חד'", "3 חדרים"). */
export function extractRooms(text: string): number | null {
  const m = text.match(/(\d(?:\.\d)?)\s*(?:חד['׳]?|חדרים)/);
  if (m) {
    const v = parseFloat(m[1]);
    if (v >= 1 && v <= 10) return v;
  }
  return null;
}

/** Extract size in m² ("72 מ\"ר", "72 מטר"). */
export function extractSize(text: string): number | null {
  const m = text.match(/(\d{2,3})\s*(?:מ["'׳״]?ר|מטר)/);
  if (m) {
    const v = parseInt(m[1], 10);
    if (v >= 15 && v <= 600) return v;
  }
  return null;
}
