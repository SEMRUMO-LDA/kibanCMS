/**
 * Translation Engine — DeepL API v2
 *
 * Handles:
 * - Batch translation of content fields
 * - Language detection (via translate endpoint)
 * - Content hashing for change detection
 * - HTML preservation for formatted fields
 *
 * Each tenant provides their own DeepL API key
 * via the i18n-config collection in the CMS.
 * DeepL Free keys end with ":fx", Pro keys don't.
 */

import { createHash } from 'crypto';
import { logger } from './logger.js';

function getDeepLEndpoint(apiKey: string): string {
  return apiKey.endsWith(':fx')
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';
}

function mapLangToDeepL(code: string): string {
  return code.toUpperCase();
}

// Field types that should be translated (string-based content)
const TRANSLATABLE_TYPES = new Set(['text', 'textarea', 'richtext', 'email']);

// Field types that should NEVER be translated
const SKIP_TYPES = new Set(['number', 'boolean', 'date', 'image', 'url', 'select']);

// ============================================
// CONTENT HASHING
// ============================================

/**
 * Compute a stable SHA-256 hash of content for change detection.
 * Keys are sorted to ensure consistent hashing regardless of field order.
 */
export function computeContentHash(content: Record<string, any>): string {
  const sorted = Object.keys(content)
    .sort()
    .reduce((acc, key) => {
      acc[key] = content[key];
      return acc;
    }, {} as Record<string, any>);

  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

// ============================================
// FIELD EXTRACTION
// ============================================

/**
 * Extract translatable fields from content based on collection field definitions.
 * Returns only string fields that contain actual text.
 */
export function extractTranslatableFields(
  content: Record<string, any>,
  fieldDefs?: Array<{ id?: string; name?: string; type?: string }>
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(content)) {
    if (typeof value !== 'string' || !value.trim()) continue;

    // If we have field definitions, use them to determine translatability
    if (fieldDefs && fieldDefs.length > 0) {
      const fieldDef = fieldDefs.find(f => (f.id || f.name) === key);
      if (fieldDef) {
        if (SKIP_TYPES.has(fieldDef.type || '')) continue;
        if (TRANSLATABLE_TYPES.has(fieldDef.type || '')) {
          result[key] = value;
          continue;
        }
      }
    }

    // Fallback: translate any string field that looks like content
    // Skip fields that look like IDs, slugs, URLs, dates, or codes
    if (
      key.endsWith('_id') || key.endsWith('_slug') || key === 'slug' ||
      key.endsWith('_url') || key === 'url' || key === 'image' ||
      key === 'currency' || key === 'status' || key.endsWith('_status') ||
      key.endsWith('_at') || key === 'stripe_session_id' ||
      /^[a-f0-9-]{36}$/.test(value) || // UUID
      /^https?:\/\//.test(value) || // URL
      /^\d{4}-\d{2}-\d{2}/.test(value) // Date
    ) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

// ============================================
// GOOGLE TRANSLATE API
// ============================================

interface DeepLResponse {
  translations: Array<{
    text: string;
    detected_source_language?: string;
  }>;
}

/**
 * Translate a batch of text segments using DeepL API v2.
 * Supports HTML content (preserves formatting).
 */
export async function translateTexts(
  texts: string[],
  targetLang: string,
  apiKey: string,
  sourceLang?: string
): Promise<string[]> {
  if (texts.length === 0) return [];

  const MAX_BATCH = 50;
  const results: string[] = [];
  const endpoint = getDeepLEndpoint(apiKey);

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);

    const body: Record<string, any> = {
      text: batch,
      target_lang: mapLangToDeepL(targetLang),
      preserve_formatting: true,
    };
    if (sourceLang) body.source_lang = mapLangToDeepL(sourceLang);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error('DeepL API error', { status: res.status, error: err });
      throw new Error(`DeepL API error: ${res.status}`);
    }

    const json = (await res.json()) as DeepLResponse;
    for (const t of json.translations) {
      results.push(t.text);
    }
  }

  return results;
}

/**
 * Translate a set of named fields.
 * Returns a map of field_id -> translated_value.
 */
export async function translateFields(
  fields: Record<string, string>,
  targetLang: string,
  apiKey: string,
  sourceLang?: string
): Promise<Record<string, string>> {
  const keys = Object.keys(fields);
  const values = Object.values(fields);

  if (keys.length === 0) return {};

  const translated = await translateTexts(values, targetLang, apiKey, sourceLang);

  const result: Record<string, string> = {};
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = translated[i];
  }

  return result;
}

/**
 * Detect the language of a text sample via DeepL translate endpoint.
 */
export async function detectLanguage(
  text: string,
  apiKey: string
): Promise<{ language: string; confidence: number }> {
  try {
    const endpoint = getDeepLEndpoint(apiKey);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text.slice(0, 200)],
        target_lang: 'EN',
      }),
    });

    if (!res.ok) throw new Error(`DeepL API error: ${res.status}`);

    const json = (await res.json()) as DeepLResponse;
    const detected = json.translations[0]?.detected_source_language || 'EN';

    return { language: detected.toLowerCase(), confidence: 1.0 };
  } catch (error) {
    logger.error('Language detection failed', { error });
    return { language: 'en', confidence: 0 };
  }
}

// ============================================
// SUPPORTED LANGUAGES
// ============================================

export const SUPPORTED_LANGUAGES = [
  { code: 'pt', name: 'Portugues', flag: 'pt' },
  { code: 'en', name: 'English', flag: 'gb' },
  { code: 'es', name: 'Espanol', flag: 'es' },
  { code: 'fr', name: 'Francais', flag: 'fr' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'it', name: 'Italiano', flag: 'it' },
  { code: 'nl', name: 'Nederlands', flag: 'nl' },
  { code: 'ru', name: 'Russkiy', flag: 'ru' },
  { code: 'zh', name: 'Zhongwen', flag: 'cn' },
  { code: 'ja', name: 'Nihongo', flag: 'jp' },
  { code: 'ko', name: 'Hangugeo', flag: 'kr' },
  { code: 'ar', name: 'Al-Arabiyyah', flag: 'sa' },
  { code: 'hi', name: 'Hindi', flag: 'in' },
  { code: 'pl', name: 'Polski', flag: 'pl' },
  { code: 'sv', name: 'Svenska', flag: 'se' },
  { code: 'da', name: 'Dansk', flag: 'dk' },
  { code: 'fi', name: 'Suomi', flag: 'fi' },
  { code: 'no', name: 'Norsk', flag: 'no' },
  { code: 'tr', name: 'Turkce', flag: 'tr' },
  { code: 'cs', name: 'Cestina', flag: 'cz' },
  { code: 'ro', name: 'Romana', flag: 'ro' },
  { code: 'uk', name: 'Ukrayinska', flag: 'ua' },
  { code: 'el', name: 'Ellinika', flag: 'gr' },
  { code: 'th', name: 'Thai', flag: 'th' },
  { code: 'vi', name: 'Tieng Viet', flag: 'vn' },
  { code: 'id', name: 'Bahasa Indonesia', flag: 'id' },
  { code: 'ms', name: 'Bahasa Melayu', flag: 'my' },
  { code: 'he', name: 'Ivrit', flag: 'il' },
  { code: 'ca', name: 'Catala', flag: 'es' },
  { code: 'hr', name: 'Hrvatski', flag: 'hr' },
];
