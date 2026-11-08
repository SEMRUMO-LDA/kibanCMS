/**
 * Server-side cache for widget translations (POST /i18n/translate-text).
 *
 * Without it every new visitor, in every language, paid for translating the
 * whole page again (the only cache was the visitor's localStorage), and the
 * public endpoint let anyone run up the translation bill.
 *
 * Two tiers, both scoped per tenant:
 *   1. in-memory LRU (fast, per process)
 *   2. table i18n_text_cache (migration 010) — survives restarts/deploys
 * Only texts never seen before reach the translation provider. If the table
 * doesn't exist yet on a tenant, the memory tier still works.
 */

import { createHash } from 'node:crypto';
import { supabase } from './supabase.js';
import { logger } from './logger.js';
import { LRUCache } from './lru-cache.js';
import { tenantStore } from '../middleware/tenant.js';

export type TranslateFn = (texts: string[], targetLang: string, sourceLang: string) => Promise<string[]>;

const memory = new LRUCache<string>({ maxSize: 20_000, ttlMs: 24 * 60 * 60 * 1000 });
const tableMissing = new Set<string>(); // tenants without migration 010

function tenantId(): string {
  return tenantStore.getStore()?.tenant?.id || 'default';
}

export function translationKey(sourceLang: string, targetLang: string, text: string): string {
  return createHash('sha256').update(`${sourceLang}\u0000${targetLang}\u0000${text}`, 'utf8').digest('hex');
}

export interface CachedTranslationResult {
  translations: string[];
  fromCache: number;
  translated: number;
}

export async function translateWithCache(
  texts: string[],
  targetLang: string,
  sourceLang: string,
  translate: TranslateFn,
): Promise<CachedTranslationResult> {
  const tgt = targetLang.toLowerCase();
  const src = sourceLang.toLowerCase();
  const out: string[] = new Array(texts.length);

  // Same language or blank text: nothing to translate.
  if (src === tgt) return { translations: [...texts], fromCache: 0, translated: 0 };

  const tenant = tenantId();
  const memKey = (hash: string) => `${tenant}:${hash}`;
  const hashes = texts.map(t => translationKey(src, tgt, t));
  const pending = new Map<string, number[]>(); // hash -> indexes still missing
  let fromCache = 0;

  texts.forEach((text, i) => {
    if (!text || !text.trim()) { out[i] = text; return; }
    const hit = memory.get(memKey(hashes[i]));
    if (hit !== undefined) { out[i] = hit; fromCache++; return; }
    const list = pending.get(hashes[i]) || [];
    list.push(i);
    pending.set(hashes[i], list);
  });

  // Tier 2: database
  if (pending.size > 0 && !tableMissing.has(tenant)) {
    const keys = [...pending.keys()];
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      let data: Array<{ hash: string; translated_text: string }> | null = null;
      let error: { code?: string; message: string } | null = null;
      try {
        const r = await supabase
          .from('i18n_text_cache')
          .select('hash, translated_text')
          .in('hash', chunk);
        data = r.data as any;
        error = r.error;
      } catch (err: any) {
        error = { message: err?.message || 'cache unavailable' };
      }
      if (error) {
        // 42P01 / PGRST205 = table not found → tenant hasn't run migration 010
        if (error.code === '42P01' || error.code === 'PGRST205') {
          tableMissing.add(tenant);
          logger.warn('i18n_text_cache missing — run database/UPGRADE_TENANT.sql (translations cached in memory only)', { tenant });
        } else {
          logger.warn('Translation cache read failed', { tenant, error: error.message });
        }
        break;
      }
      for (const row of data || []) {
        const idx = pending.get(row.hash);
        if (!idx) continue;
        for (const i of idx) out[i] = row.translated_text;
        fromCache += idx.length;
        memory.set(memKey(row.hash), row.translated_text);
        pending.delete(row.hash);
      }
    }
  }

  // Tier 3: translation provider — only for texts never seen before
  let translated = 0;
  if (pending.size > 0) {
    const missingHashes = [...pending.keys()];
    const missingTexts = missingHashes.map(h => texts[pending.get(h)![0]]);
    const results = await translate(missingTexts, tgt, src);
    const rows: Array<Record<string, string>> = [];
    missingHashes.forEach((hash, j) => {
      const value = results[j] ?? missingTexts[j];
      for (const i of pending.get(hash)!) out[i] = value;
      memory.set(memKey(hash), value);
      rows.push({ hash, source_lang: src, target_lang: tgt, source_text: missingTexts[j], translated_text: value });
    });
    translated = missingTexts.length;

    if (!tableMissing.has(tenant) && rows.length) {
      // Fire-and-forget: never delay (or fail) the response for the cache write.
      try {
        Promise.resolve(
          supabase.from('i18n_text_cache').upsert(rows as any, { onConflict: 'hash', ignoreDuplicates: true }),
        ).then(({ error }) => {
          if (error) logger.warn('Translation cache write failed', { tenant, error: error.message });
        }).catch(() => {});
      } catch { /* cache unavailable — memory tier still has it */ }
    }
  }

  return { translations: out, fromCache, translated };
}

/** Test helper. */
export function _clearTranslationMemory(): void {
  memory.clear();
  tableMissing.clear();
}
