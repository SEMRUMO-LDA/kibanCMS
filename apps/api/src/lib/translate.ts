/**
 * Translation Engine — Google Cloud Translation API v2
 *
 * Handles:
 * - Batch translation of content fields
 * - Language detection
 * - Content hashing for change detection
 * - HTML preservation for richtext fields
 *
 * Each tenant provides their own Google Translate API key
 * via the i18n-config collection in the CMS.
 */

import { createHash } from 'crypto';
import { logger } from './logger.js';

const GOOGLE_TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const GOOGLE_DETECT_URL = 'https://translation.googleapis.com/language/translate/v2/detect';

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

interface TranslateResponse {
  data: {
    translations: Array<{
      translatedText: string;
      detectedSourceLanguage?: string;
    }>;
  };
}

interface DetectResponse {
  data: {
    detections: Array<Array<{
      language: string;
      confidence: number;
    }>>;
  };
}

/**
 * Translate a batch of text segments using Google Cloud Translation API v2.
 * Supports HTML content (preserves tags).
 */
export async function translateTexts(
  texts: string[],
  targetLang: string,
  apiKey: string,
  sourceLang?: string
): Promise<string[]> {
  if (texts.length === 0) return [];

  // Google Translate API accepts up to 128 segments per request
  const MAX_BATCH = 128;
  const results: string[] = [];

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);

    const params = new URLSearchParams();
    params.set('key', apiKey);
    params.set('target', targetLang);
    params.set('format', 'html'); // Preserves HTML tags in richtext
    if (sourceLang) params.set('source', sourceLang);
    for (const text of batch) {
      params.append('q', text);
    }

    const res = await fetch(`${GOOGLE_TRANSLATE_URL}?${params.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error('Google Translate API error', { status: res.status, error: err });
      throw new Error(`Google Translate API error: ${res.status}`);
    }

    const json = (await res.json()) as TranslateResponse;
    for (const t of json.data.translations) {
      results.push(t.translatedText);
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
 * Detect the language of a text sample.
 */
export async function detectLanguage(
  text: string,
  apiKey: string
): Promise<{ language: string; confidence: number }> {
  const params = new URLSearchParams();
  params.set('key', apiKey);
  params.append('q', text.slice(0, 500)); // Use first 500 chars for detection

  const res = await fetch(`${GOOGLE_DETECT_URL}?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('Google Detect API error', { status: res.status, error: err });
    throw new Error(`Google Detect API error: ${res.status}`);
  }

  const json = (await res.json()) as DetectResponse;
  const detection = json.data.detections[0]?.[0];

  return {
    language: detection?.language || 'en',
    confidence: detection?.confidence || 0,
  };
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
