import { PropertyAd } from '../models/PropertyAd';
import { normalize } from './normalize';
import { hasFeature, isBroker } from './features';

/** A configurable search profile (one or more live in config.yaml). */
export interface SearchProfile {
  name: string;
  enabled: boolean;
  locations?: {
    cities?: string[];
    neighborhoods?: string[];
    streets?: string[];
  };
  required_keywords?: string[];   // every one must appear
  required_any?: string[][];      // AND of ORs: each group needs ≥1 hit
  preferred_keywords?: string[];  // each adds points
  exclude_keywords?: string[];    // any one rejects
  price?: { minimum?: number; maximum?: number };
  rooms?: { minimum?: number; maximum?: number };
  minimum_size_sqm?: number;
  property_type?: string;
  require_parking?: boolean;
  require_elevator?: boolean;
  require_balcony?: boolean;
  seller?: 'private' | 'broker' | 'any';
  /** Score at/above which an ad is notified. Default 50. */
  threshold?: number;
  /** Points awarded per matched preferred keyword / amenity. Overridable. */
  weights?: Partial<typeof DEFAULT_WEIGHTS>;
}

export const DEFAULT_WEIGHTS = {
  neighborhood: 30,
  street: 20,
  city: 15,
  withinPrice: 20,
  parking: 10,
  elevator: 10,
  balcony: 10,
  preferredKeyword: 5,
  overPricePenalty: 25,
};

export interface MatchResult {
  matched: boolean;
  score: number;
  reasons: string[];
  rejectionReasons: string[];
}

/** Searchable blob: title + description + extracted location fields. */
function adText(ad: PropertyAd): string {
  return normalize(
    [ad.title, ad.description, ad.city, ad.neighborhood, ad.street,
     String(ad.metadata.rawText ?? '')].filter(Boolean).join(' ')
  );
}

function anyMatch(text: string, terms?: string[]): string | null {
  if (!terms?.length) return null;
  for (const t of terms) {
    if (text.includes(normalize(t))) return t;
  }
  return null;
}

/**
 * Deterministic, transparent scoring. Returns matched + score + the exact
 * reasons that produced it. An optional AI classifier can layer on top later,
 * but these rules remain the primary decision mechanism.
 */
export function scoreAd(ad: PropertyAd, profile: SearchProfile): MatchResult {
  const w = { ...DEFAULT_WEIGHTS, ...(profile.weights ?? {}) };
  const text = adText(ad);
  const reasons: string[] = [];
  const rejectionReasons: string[] = [];
  let score = 0;

  // --- Hard rejects ---------------------------------------------------------
  const excluded = anyMatch(text, profile.exclude_keywords);
  if (excluded) rejectionReasons.push(`Excluded keyword: ${excluded}`);

  for (const req of profile.required_keywords ?? []) {
    if (!text.includes(normalize(req))) rejectionReasons.push(`Missing required keyword: ${req}`);
  }

  for (const group of profile.required_any ?? []) {
    if (!anyMatch(text, group)) rejectionReasons.push(`None of required group matched: ${group.join('/')}`);
  }

  if (profile.seller === 'private' && isBroker(text)) rejectionReasons.push('Broker listing (wanted private)');
  if (profile.seller === 'broker' && !isBroker(text)) rejectionReasons.push('Private listing (wanted broker)');

  if (profile.price?.maximum != null && ad.price != null && ad.price > profile.price.maximum) {
    // configurable: penalty rather than hard reject keeps near-budget ads visible
    score -= w.overPricePenalty;
    reasons.push(`Over budget by ₪${ad.price - profile.price.maximum} (penalty)`);
  }
  if (profile.price?.minimum != null && ad.price != null && ad.price < profile.price.minimum) {
    rejectionReasons.push(`Below minimum price ₪${profile.price.minimum}`);
  }
  if (profile.rooms?.minimum != null && ad.rooms != null && ad.rooms < profile.rooms.minimum) {
    rejectionReasons.push(`Fewer rooms than ${profile.rooms.minimum}`);
  }
  if (profile.rooms?.maximum != null && ad.rooms != null && ad.rooms > profile.rooms.maximum) {
    rejectionReasons.push(`More rooms than ${profile.rooms.maximum}`);
  }
  if (profile.minimum_size_sqm != null && ad.sizeSqm != null && ad.sizeSqm < profile.minimum_size_sqm) {
    rejectionReasons.push(`Smaller than ${profile.minimum_size_sqm} m²`);
  }
  if (profile.require_parking && !hasFeature(text, 'parking')) rejectionReasons.push('No parking');
  if (profile.require_elevator && !hasFeature(text, 'elevator')) rejectionReasons.push('No elevator');
  if (profile.require_balcony && !hasFeature(text, 'balcony')) rejectionReasons.push('No balcony');

  // Location: city is the one near-required signal. If cities are configured and
  // none match (and no neighborhood/street matches either), reject.
  const cityHit = anyMatch(text, profile.locations?.cities);
  const hoodHit = anyMatch(text, profile.locations?.neighborhoods);
  const streetHit = anyMatch(text, profile.locations?.streets);
  const anyLocationConfigured =
    !!(profile.locations?.cities?.length || profile.locations?.neighborhoods?.length || profile.locations?.streets?.length);
  if (anyLocationConfigured && !cityHit && !hoodHit && !streetHit) {
    rejectionReasons.push('No configured location matched');
  }

  if (rejectionReasons.length) {
    return { matched: false, score: 0, reasons, rejectionReasons };
  }

  // --- Positive scoring -----------------------------------------------------
  if (cityHit)   { score += w.city;         reasons.push(`City matched: ${cityHit}`); }
  if (hoodHit)   { score += w.neighborhood; reasons.push(`Neighborhood matched: ${hoodHit}`); }
  if (streetHit) { score += w.street;       reasons.push(`Street matched: ${streetHit}`); }

  if (profile.price?.maximum != null && ad.price != null && ad.price <= profile.price.maximum) {
    score += w.withinPrice; reasons.push('Within budget');
  }

  if (hasFeature(text, 'parking'))  { score += w.parking;  reasons.push('Parking detected'); }
  if (hasFeature(text, 'elevator')) { score += w.elevator; reasons.push('Elevator detected'); }
  if (hasFeature(text, 'balcony'))  { score += w.balcony;  reasons.push('Balcony detected'); }

  for (const kw of profile.preferred_keywords ?? []) {
    if (text.includes(normalize(kw))) { score += w.preferredKeyword; reasons.push(`Preferred: ${kw}`); }
  }

  const threshold = profile.threshold ?? 50;
  const matched = score >= threshold;
  if (!matched) rejectionReasons.push(`Score ${score} below threshold ${threshold}`);

  return { matched, score: Math.max(0, score), reasons, rejectionReasons };
}
