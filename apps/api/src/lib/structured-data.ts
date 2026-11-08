/**
 * Structured data (schema.org JSON-LD) and llms.txt — so search engines and
 * AI assistants can understand, trust and cite a client's content.
 *
 * Everything is derived from what the CMS already has: Settings (business
 * name, contacts, socials), Permalinks (URLs) and each entry's fields. The
 * schema type is detected from the collection slug/fields (tours →
 * TouristTrip, events → Event, …) and can be forced per collection with
 * collection.settings.jsonld_type.
 */

import { supabase } from './supabase.js';
import { tenantStore } from '../middleware/tenant.js';
import { PRIVATE_COLLECTIONS } from '../routes/entries.js';
import { applyPattern, normalizeSiteUrl, getSingletonContent, NON_PAGE_COLLECTIONS, isNoindex } from './sitemap.js';

type Json = Record<string, any>;

export type EntryType = 'TouristTrip' | 'Event' | 'Product' | 'FAQPage' | 'BlogPosting' | 'WebPage';

const BUSINESS_TYPES = new Set([
  'Organization', 'LocalBusiness', 'TravelAgency', 'TouristInformationCenter',
  'LodgingBusiness', 'Restaurant', 'Store', 'ProfessionalService', 'SportsActivityLocation',
]);

/** Drops undefined/empty values recursively so the JSON-LD stays clean. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(clean).filter(v =>
      v !== undefined && v !== null && v !== '' &&
      !(Array.isArray(v) && !v.length) &&
      !(v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)) as any;
  }
  if (value && typeof value === 'object') {
    const out: Json = {};
    for (const [k, v] of Object.entries(value as Json)) {
      const c = clean(v);
      if (c === undefined || c === null || c === '') continue;
      if (Array.isArray(c) && c.length === 0) continue;
      if (typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 0) continue;
      out[k] = c;
    }
    return out as T;
  }
  return value;
}

export function plainText(v: unknown, max = 300): string {
  if (typeof v !== 'string') return '';
  const text = v
    .replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|td|th|section|article|blockquote)\b[^>]*>/gi, ' ') // block tags → space
    .replace(/<[^>]+>/g, '')                     // inline tags (b, a, span…) → nothing
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
}

function firstUrl(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === 'string' && /^https?:\/\//.test(c)) return c;
    if (Array.isArray(c) && c.length) { const u = firstUrl(c[0]); if (u) return u; }
    if (c && typeof c === 'object') { const u = firstUrl((c as Json).url, (c as Json).src); if (u) return u; }
  }
  return undefined;
}

export function describe(entry: Json): string {
  const c = entry.content || {};
  return plainText(c.meta_description || c.description || c.excerpt || c.summary || entry.excerpt || c.short_description || c.body || c.content);
}

export function detectEntryType(collectionSlug: string, content: Json, override?: unknown): EntryType {
  const allowed: EntryType[] = ['TouristTrip', 'Event', 'Product', 'FAQPage', 'BlogPosting', 'WebPage'];
  if (typeof override === 'string') {
    const o = override === 'Article' ? 'BlogPosting' : override;
    if ((allowed as string[]).includes(o)) return o as EntryType;
  }
  const s = collectionSlug.toLowerCase();
  if (/tour|experien|activit|trip|passeio|excurs|bookable/.test(s)) return 'TouristTrip';
  if (/event|evento|agenda/.test(s)) return 'Event';
  if (/product|produto|shop|loja/.test(s)) return 'Product';
  if (/faq|pergunta/.test(s)) return 'FAQPage';
  if (/blog|post|news|noticia|artigo|article/.test(s)) return 'BlogPosting';
  const c = content || {};
  if (c.start_date || c.event_date) return 'Event';
  if ((c.price ?? c.price_adult) !== undefined && (c.location || c.meeting_point || c.duration)) return 'TouristTrip';
  if ((c.price ?? c.price_adult) !== undefined) return 'Product';
  if (Array.isArray(c.faqs) && c.faqs.length) return 'FAQPage';
  return 'WebPage';
}

export interface SiteContext {
  siteUrl: string;
  name: string;
  businessType: string;
  site: Json;
  seo: Json;
}

export function organizationJsonLd(ctx: SiteContext): Json {
  const s = ctx.site;
  return clean({
    '@context': 'https://schema.org',
    '@type': ctx.businessType,
    name: ctx.name,
    url: ctx.siteUrl || undefined,
    logo: firstUrl(s.logo_url),
    image: firstUrl(s.og_image, s.logo_url),
    description: plainText(s.site_description || ctx.seo.meta_description),
    telephone: s.contact_phone,
    email: s.contact_email,
    address: s.address ? { '@type': 'PostalAddress', streetAddress: plainText(s.address, 200) } : undefined,
    sameAs: [s.facebook_url, s.instagram_url, s.linkedin_url, s.youtube_url, s.tiktok_url, s.twitter_url]
      .filter((u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u)),
  });
}

export function websiteJsonLd(ctx: SiteContext): Json {
  return clean({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: ctx.name,
    url: ctx.siteUrl || undefined,
    inLanguage: ctx.site.language,
  });
}

export function entryJsonLd(entry: Json, collectionSlug: string, ctx: SiteContext, override?: unknown): Json {
  const c = entry.content || {};
  const type = detectEntryType(collectionSlug, c, override);
  const name = plainText(entry.title || c.title || c.name, 200);
  const url = ctx.siteUrl
    ? ctx.siteUrl + applyPattern(String(ctx.site.entry_url_pattern || '/{collection}/{slug}'), { collection: collectionSlug, slug: entry.slug })
    : undefined;
  const image = firstUrl(c.featured_image, c.image, c.cover_image, c.hero_image, c.thumbnail, c.images, c.gallery);
  const description = describe(entry);
  const priceRaw = c.price ?? c.price_adult ?? c.priceAdult;
  const price = priceRaw !== undefined && priceRaw !== '' && Number.isFinite(Number(priceRaw)) ? String(Number(priceRaw)) : undefined;
  const offers = price ? {
    '@type': 'Offer',
    price,
    priceCurrency: String(c.currency || 'EUR').toUpperCase(),
    availability: 'https://schema.org/InStock',
    url,
  } : undefined;
  const provider = { '@type': ctx.businessType, name: ctx.name, url: ctx.siteUrl || undefined };
  const location = plainText(c.location || c.meeting_point || c.address || c.city, 200);
  const base = { '@context': 'https://schema.org', '@type': type, url };

  switch (type) {
    case 'TouristTrip':
      return clean({ ...base, name, description, image, offers, provider,
        touristType: c.tourist_type, itinerary: location ? { '@type': 'Place', name: location } : undefined });
    case 'Event':
      return clean({ ...base, name, description, image, offers, organizer: provider,
        startDate: c.start_date || c.event_date || c.date,
        endDate: c.end_date,
        location: location ? { '@type': 'Place', name: location, address: location } : undefined });
    case 'Product':
      return clean({ ...base, name, description, image, offers, brand: { '@type': 'Brand', name: ctx.name } });
    case 'FAQPage': {
      const faqs: Json[] = Array.isArray(c.faqs) ? c.faqs
        : c.question ? [{ question: c.question, answer: c.answer }] : [];
      if (!faqs.length) return clean({ ...base, '@type': 'WebPage', name, description });
      return clean({ ...base, name, mainEntity: faqs.map(f => ({
        '@type': 'Question', name: plainText(f.question, 300),
        acceptedAnswer: { '@type': 'Answer', text: plainText(f.answer, 2000) },
      })) });
    }
    case 'BlogPosting':
      return clean({ ...base, headline: name.slice(0, 110), description, image,
        datePublished: entry.published_at || entry.created_at, dateModified: entry.updated_at,
        author: { '@type': 'Organization', name: ctx.name },
        publisher: { '@type': 'Organization', name: ctx.name, logo: firstUrl(ctx.site.logo_url) ? { '@type': 'ImageObject', url: firstUrl(ctx.site.logo_url) } : undefined },
        mainEntityOfPage: url });
    default:
      return clean({ ...base, name, description, image });
  }
}

// ── Tenant context (cached per tenant for 60s) ─────────────────────

const ctxCache = new Map<string, { ctx: SiteContext; at: number }>();

export async function getSiteContext(): Promise<SiteContext> {
  const tenantId = tenantStore.getStore()?.tenant?.id || 'default';
  const hit = ctxCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit.ctx;
  const site = await getSingletonContent('site-settings');
  const seo = await getSingletonContent('seo-settings');
  const businessType = BUSINESS_TYPES.has(site.business_type) ? site.business_type : 'Organization';
  const ctx: SiteContext = {
    siteUrl: normalizeSiteUrl(String(site.site_url || '')),
    name: String(site.site_name || seo.site_name || '').trim(),
    businessType,
    site,
    seo,
  };
  ctxCache.set(tenantId, { ctx, at: Date.now() });
  return ctx;
}

// ── llms.txt ────────────────────────────────────────────────────────

export const LLMS_PER_COLLECTION = 50;
export const LLMS_MAX_LINKS = 500;

export interface LlmsSection { title: string; links: Array<{ title: string; url: string; description: string }> }

export function renderLlmsTxt(ctx: SiteContext, sections: LlmsSection[]): string {
  const s = ctx.site;
  const lines: string[] = [`# ${ctx.name || 'Website'}`, ''];
  const summary = plainText(s.site_description || ctx.seo.meta_description, 500);
  if (summary) lines.push(`> ${summary}`, '');
  const contact = [s.contact_phone, s.contact_email, plainText(s.address, 200)].filter(Boolean).join(' · ');
  if (contact) lines.push(`Contact: ${contact}`, '');
  for (const sec of sections) {
    if (!sec.links.length) continue;
    lines.push(`## ${sec.title}`, '');
    for (const l of sec.links) lines.push(`- [${l.title.replace(/[[\]]/g, '')}](${l.url})${l.description ? `: ${l.description}` : ''}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** Builds llms.txt for the current tenant (published, public content only). */
export async function buildLlmsTxt(): Promise<string> {
  const ctx = await getSiteContext();
  if (!/^https?:\/\//.test(ctx.siteUrl)) {
    throw new Error('Set the site URL in Settings → General to generate llms.txt.');
  }
  const allow = String(ctx.seo.sitemap_collections || '').split(',').map(x => x.trim()).filter(Boolean);
  const { data: collections, error } = await supabase.from('collections').select('id, slug, name');
  if (error) throw error;
  const cols = (collections || []).filter(c => allow.length
    ? allow.includes(c.slug) && !PRIVATE_COLLECTIONS.has(c.slug)
    : !PRIVATE_COLLECTIONS.has(c.slug) && !NON_PAGE_COLLECTIONS.has(c.slug));

  const sections: LlmsSection[] = [];
  let total = 0;
  for (const col of cols) {
    if (total >= LLMS_MAX_LINKS) break;
    const q = () => supabase.from('entries')
      .select('title, slug, excerpt, content, meta, updated_at')
      .eq('collection_id', col.id).eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(Math.min(LLMS_PER_COLLECTION, LLMS_MAX_LINKS - total));
    let { data: entries, error: e } = await q().is('deleted_at', null);
    if (e?.code === '42703') ({ data: entries, error: e } = await q());
    if (e) throw e;
    const links = (entries || []).filter(en => !isNoindex(en)).map(en => ({
      title: plainText(en.title, 150) || en.slug,
      url: ctx.siteUrl + applyPattern(String(ctx.site.entry_url_pattern || '/{collection}/{slug}'), { collection: col.slug, slug: en.slug }),
      description: describe(en).slice(0, 200),
    }));
    total += links.length;
    sections.push({ title: col.name || col.slug, links });
  }
  return renderLlmsTxt(ctx, sections);
}
