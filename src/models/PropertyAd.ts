import { createHash } from 'crypto';

/** Normalized advertisement shared across all providers. */
export interface PropertyAd {
  source: string;            // 'yad2' | 'facebook'
  externalId: string;        // provider-native id (unique per source)
  url: string;
  title: string;
  description?: string;
  city?: string;
  neighborhood?: string;
  street?: string;
  price?: number;
  rooms?: number;
  floor?: number;
  sizeSqm?: number;
  propertyType?: string;
  publishedAt?: Date;
  collectedAt: Date;
  imageUrls: string[];
  sellerName?: string;
  /** Free-form provider extras (e.g. raw post text used for matching). */
  metadata: Record<string, unknown>;
}

/**
 * Content fingerprint — detects reposts / lightly-edited duplicates that carry a
 * different externalId. Built from the stable, meaning-bearing fields only, so a
 * price change deliberately produces a *different* fingerprint (enabling update
 * notifications) while a verbatim repost produces the same one.
 */
export function contentFingerprint(ad: PropertyAd): string {
  const parts = [
    ad.city ?? '',
    ad.neighborhood ?? '',
    ad.street ?? '',
    ad.rooms != null ? String(ad.rooms) : '',
    ad.sizeSqm != null ? String(ad.sizeSqm) : '',
    ad.price != null ? String(ad.price) : '',
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/** Identity key for primary dedup: stable across reposts of the same listing. */
export function adKey(ad: PropertyAd): string {
  return `${ad.source}:${ad.externalId}`;
}
