/**
 * Internationalization (i18n) Routes
 *
 * Handles:
 * - Language configuration and detection
 * - Entry translation (single + bulk)
 * - Translation status tracking
 * - Widget config for frontends
 *
 * Google Translate API key is per-client, stored in i18n-config collection.
 */

import { Router, type Response } from 'express';
import { supabase } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
  translateFields,
  detectLanguage,
  computeContentHash,
  extractTranslatableFields,
  SUPPORTED_LANGUAGES,
} from '../lib/translate.js';

const router: Router = Router();

// ============================================
// HELPERS
// ============================================

interface I18nConfig {
  defaultLanguage: string;
  defaultLanguageName: string;
  enabledLanguages: Array<{ code: string; name: string }>;
  googleApiKey: string;
  autoTranslate: boolean;
  widgetEnabled: boolean;
  widgetPosition: string;
  widgetStyle: string;
  translatableCollections: string[];
}

let configCache: { config: I18nConfig; fetchedAt: number } | null = null;
const CONFIG_TTL = 60_000;

async function getI18nConfig(): Promise<I18nConfig | null> {
  if (configCache && Date.now() - configCache.fetchedAt < CONFIG_TTL) {
    return configCache.config;
  }

  const { data: col } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', 'i18n-config')
    .single();

  if (!col) return null;

  const { data: entry } = await supabase
    .from('entries')
    .select('content')
    .eq('collection_id', col.id)
    .eq('slug', 'default')
    .eq('status', 'published')
    .single();

  if (!entry?.content) return null;

  const c = entry.content as Record<string, any>;
  if (!c.google_translate_api_key) return null;

  let enabledLangs: Array<{ code: string; name: string }> = [];
  try {
    enabledLangs = typeof c.enabled_languages === 'string'
      ? JSON.parse(c.enabled_languages)
      : c.enabled_languages || [];
  } catch { /* invalid JSON, empty array */ }

  let translatableCols: string[] = [];
  try {
    translatableCols = typeof c.translatable_collections === 'string'
      ? JSON.parse(c.translatable_collections)
      : c.translatable_collections || [];
  } catch { /* invalid JSON, empty array */ }

  const config: I18nConfig = {
    defaultLanguage: c.default_language || 'pt',
    defaultLanguageName: c.default_language_name || 'Portugues',
    enabledLanguages: enabledLangs,
    googleApiKey: c.google_translate_api_key,
    autoTranslate: c.auto_translate === true || c.auto_translate === 'true',
    widgetEnabled: c.widget_enabled === true || c.widget_enabled === 'true',
    widgetPosition: c.widget_position || 'bottom-right',
    widgetStyle: c.widget_style || 'dropdown',
    translatableCollections: translatableCols,
  };

  configCache = { config, fetchedAt: Date.now() };
  return config;
}

async function getCollectionId(slug: string): Promise<string | null> {
  const { data } = await supabase
    .from('collections')
    .select('id')
    .eq('slug', slug)
    .single();
  return data?.id || null;
}

async function getCollectionFields(slug: string): Promise<any[]> {
  const { data } = await supabase
    .from('collections')
    .select('fields')
    .eq('slug', slug)
    .single();
  return data?.fields || [];
}

async function getAdminProfileId(): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .in('role', ['super_admin', 'admin'])
    .limit(1)
    .single();
  return data?.id || null;
}

// ============================================
// GET /api/v1/i18n/languages (Public — API key auth)
// Returns available languages for frontends
// ============================================

router.get('/languages', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getI18nConfig();
    if (!config) {
      return res.status(404).json({
        error: { message: 'i18n not configured', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const defaultLang = SUPPORTED_LANGUAGES.find(l => l.code === config.defaultLanguage);

    res.json({
      data: {
        default: config.defaultLanguage,
        available: [
          { code: config.defaultLanguage, name: config.defaultLanguageName, flag: defaultLang?.flag || config.defaultLanguage },
          ...config.enabledLanguages.map(l => {
            const supported = SUPPORTED_LANGUAGES.find(s => s.code === l.code);
            return { code: l.code, name: l.name, flag: supported?.flag || l.code };
          }),
        ],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching i18n languages', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch languages', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/i18n/widget
// Returns widget configuration + embed code
// ============================================

router.get('/widget', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getI18nConfig();
    if (!config || !config.widgetEnabled) {
      return res.json({
        data: { enabled: false },
        timestamp: new Date().toISOString(),
      });
    }

    const host = req.headers.host || 'localhost';
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${protocol}://${host}`;

    res.json({
      data: {
        enabled: true,
        position: config.widgetPosition,
        style: config.widgetStyle,
        default_language: config.defaultLanguage,
        languages: [
          { code: config.defaultLanguage, name: config.defaultLanguageName },
          ...config.enabledLanguages,
        ],
        embed_code: `<script src="${baseUrl}/api/v1/i18n/widget.js" data-api-key="YOUR_API_KEY"></script>`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching widget config', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch widget config', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/i18n/supported-languages
// Returns all languages Google Translate supports
// ============================================

router.get('/supported-languages', async (_req: AuthRequest, res: Response) => {
  res.json({
    data: SUPPORTED_LANGUAGES,
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// POST /api/v1/i18n/detect-language
// Detects the default language from existing content
// ============================================

router.post('/detect-language', async (req: AuthRequest, res: Response) => {
  try {
    const config = await getI18nConfig();
    if (!config) {
      return res.status(503).json({
        error: { message: 'i18n not configured. Install the add-on and add your Google Translate API key.', status: 503, timestamp: new Date().toISOString() }
      });
    }

    // Sample text from the first few published entries
    const { data: entries } = await supabase
      .from('entries')
      .select('content, title')
      .eq('status', 'published')
      .limit(5);

    if (!entries || entries.length === 0) {
      return res.json({
        data: { language: 'pt', confidence: 0, message: 'No content found to detect' },
        timestamp: new Date().toISOString(),
      });
    }

    // Collect text samples
    const samples: string[] = [];
    for (const entry of entries) {
      if (entry.title) samples.push(entry.title);
      const content = entry.content as Record<string, any>;
      for (const val of Object.values(content)) {
        if (typeof val === 'string' && val.length > 20) {
          samples.push(val.slice(0, 200));
        }
      }
    }

    const sampleText = samples.join(' ').slice(0, 1000);
    const result = await detectLanguage(sampleText, config.googleApiKey);

    logger.info('Language detected', { language: result.language, confidence: result.confidence });

    res.json({
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error detecting language', { error: error.message });
    res.status(500).json({
      error: { message: error.message || 'Failed to detect language', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// POST /api/v1/i18n/translate
// Translate a single entry to a target language
// Body: { entry_id, collection_slug, target_lang }
// ============================================

router.post('/translate', async (req: AuthRequest, res: Response) => {
  try {
    const { entry_id, collection_slug, target_lang } = req.body;

    if (!entry_id || !collection_slug || !target_lang) {
      return res.status(400).json({
        error: { message: 'Missing required fields: entry_id, collection_slug, target_lang', status: 400, timestamp: new Date().toISOString() }
      });
    }

    const config = await getI18nConfig();
    if (!config) {
      return res.status(503).json({
        error: { message: 'i18n not configured', status: 503, timestamp: new Date().toISOString() }
      });
    }

    // Fetch the entry
    const { data: entry, error: fetchErr } = await supabase
      .from('entries')
      .select('id, title, content, meta')
      .eq('id', entry_id)
      .single();

    if (fetchErr || !entry) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const content = entry.content as Record<string, any>;
    const currentMeta = (entry.meta || {}) as Record<string, any>;
    const contentHash = computeContentHash(content);

    // Check if translation is already up-to-date
    const existingHash = currentMeta.i18n?.content_hash;
    const existingTranslation = currentMeta.translations?.[target_lang];
    if (existingHash === contentHash && existingTranslation) {
      return res.json({
        data: { message: 'Translation already up-to-date', skipped: true },
        timestamp: new Date().toISOString(),
      });
    }

    // Get collection field definitions for smart field detection
    const fields = await getCollectionFields(collection_slug);

    // Extract translatable fields
    const translatableFields = extractTranslatableFields(content, fields);

    if (Object.keys(translatableFields).length === 0) {
      return res.json({
        data: { message: 'No translatable fields found', skipped: true },
        timestamp: new Date().toISOString(),
      });
    }

    // Also translate the entry title
    const titleTranslation = entry.title
      ? await translateFields({ _title: entry.title }, target_lang, config.googleApiKey, config.defaultLanguage)
      : {};

    // Translate the content fields
    const translated = await translateFields(
      translatableFields,
      target_lang,
      config.googleApiKey,
      config.defaultLanguage
    );

    const allTranslated = { ...translated, ...titleTranslation };

    // Store translations in entry meta
    const updatedMeta = {
      ...currentMeta,
      translations: {
        ...(currentMeta.translations || {}),
        [target_lang]: allTranslated,
      },
      i18n: {
        source_lang: config.defaultLanguage,
        content_hash: contentHash,
        last_translated: new Date().toISOString(),
      },
    };

    await supabase
      .from('entries')
      .update({ meta: updatedMeta })
      .eq('id', entry_id);

    // Log translation in i18n-translations collection
    const logColId = await getCollectionId('i18n-translations');
    if (logColId) {
      const adminId = await getAdminProfileId();
      const logSlug = `tr-${entry_id.slice(0, 8)}-${target_lang}-${Date.now().toString(36)}`;

      await supabase.from('entries').upsert({
        collection_id: logColId,
        title: `${entry.title} → ${target_lang}`,
        slug: logSlug,
        content: {
          entry_id,
          collection_slug,
          language: target_lang,
          status: 'auto-translated',
          translated_fields: JSON.stringify(allTranslated),
          content_hash: contentHash,
          translated_at: new Date().toISOString(),
        },
        status: 'published',
        published_at: new Date().toISOString(),
        author_id: adminId,
        tags: ['i18n', target_lang, 'auto'],
      } as any);
    }

    logger.info('Entry translated', {
      entryId: entry_id,
      targetLang: target_lang,
      fields: Object.keys(translated).length,
    });

    res.json({
      data: {
        translated_fields: Object.keys(allTranslated),
        target_lang,
        content_hash: contentHash,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error translating entry', { error: error.message });
    res.status(500).json({
      error: { message: error.message || 'Failed to translate', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// POST /api/v1/i18n/translate-bulk
// Translate all entries in a collection
// Body: { collection_slug, target_lang }
// ============================================

router.post('/translate-bulk', async (req: AuthRequest, res: Response) => {
  try {
    const { collection_slug, target_lang } = req.body;

    if (!collection_slug || !target_lang) {
      return res.status(400).json({
        error: { message: 'Missing required fields: collection_slug, target_lang', status: 400, timestamp: new Date().toISOString() }
      });
    }

    const config = await getI18nConfig();
    if (!config) {
      return res.status(503).json({
        error: { message: 'i18n not configured', status: 503, timestamp: new Date().toISOString() }
      });
    }

    const colId = await getCollectionId(collection_slug);
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const fields = await getCollectionFields(collection_slug);

    // Fetch all published entries
    const { data: entries, error } = await supabase
      .from('entries')
      .select('id, title, content, meta')
      .eq('collection_id', colId)
      .eq('status', 'published');

    if (error) throw error;
    if (!entries || entries.length === 0) {
      return res.json({
        data: { total: 0, translated: 0, skipped: 0, errors: 0 },
        timestamp: new Date().toISOString(),
      });
    }

    let translated = 0, skipped = 0, errors = 0;
    const logColId = await getCollectionId('i18n-translations');
    const adminId = await getAdminProfileId();

    // Process in chunks of 5 concurrently
    const CHUNK_SIZE = 5;
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
      const chunk = entries.slice(i, i + CHUNK_SIZE);

      const results = await Promise.allSettled(
        chunk.map(async (entry: any) => {
          const content = entry.content as Record<string, any>;
          const currentMeta = (entry.meta || {}) as Record<string, any>;
          const contentHash = computeContentHash(content);

          // Skip if up-to-date
          if (currentMeta.i18n?.content_hash === contentHash && currentMeta.translations?.[target_lang]) {
            return 'skipped';
          }

          const translatableFields = extractTranslatableFields(content, fields);
          if (Object.keys(translatableFields).length === 0) return 'skipped';

          // Translate
          const translatedContent = await translateFields(
            translatableFields,
            target_lang,
            config.googleApiKey,
            config.defaultLanguage
          );

          const titleTranslation = entry.title
            ? await translateFields({ _title: entry.title }, target_lang, config.googleApiKey, config.defaultLanguage)
            : {};

          const allTranslated = { ...translatedContent, ...titleTranslation };

          // Update entry meta
          const updatedMeta = {
            ...currentMeta,
            translations: {
              ...(currentMeta.translations || {}),
              [target_lang]: allTranslated,
            },
            i18n: {
              source_lang: config.defaultLanguage,
              content_hash: contentHash,
              last_translated: new Date().toISOString(),
            },
          };

          await supabase
            .from('entries')
            .update({ meta: updatedMeta })
            .eq('id', entry.id);

          // Log
          if (logColId && adminId) {
            const logSlug = `tr-${entry.id.slice(0, 8)}-${target_lang}-${Date.now().toString(36)}`;
            await supabase.from('entries').insert({
              collection_id: logColId,
              title: `${entry.title} → ${target_lang}`,
              slug: logSlug,
              content: {
                entry_id: entry.id,
                collection_slug,
                language: target_lang,
                status: 'auto-translated',
                content_hash: contentHash,
                translated_at: new Date().toISOString(),
              },
              status: 'published',
              published_at: new Date().toISOString(),
              author_id: adminId,
              tags: ['i18n', target_lang, 'auto', 'bulk'],
            } as any);
          }

          return 'translated';
        })
      );

      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value === 'translated') translated++;
          else skipped++;
        } else {
          errors++;
          logger.error('Bulk translation entry error', { error: r.reason?.message });
        }
      }
    }

    logger.info('Bulk translation complete', {
      collection: collection_slug,
      targetLang: target_lang,
      total: entries.length,
      translated,
      skipped,
      errors,
    });

    res.json({
      data: { total: entries.length, translated, skipped, errors },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error in bulk translation', { error: error.message });
    res.status(500).json({
      error: { message: error.message || 'Failed to bulk translate', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// GET /api/v1/i18n/status/:collection
// Translation status overview for a collection
// ============================================

router.get('/status/:collection', async (req: AuthRequest, res: Response) => {
  try {
    const { collection } = req.params;

    const config = await getI18nConfig();
    if (!config) {
      return res.status(503).json({
        error: { message: 'i18n not configured', status: 503, timestamp: new Date().toISOString() }
      });
    }

    const colId = await getCollectionId(collection);
    if (!colId) {
      return res.status(404).json({
        error: { message: 'Collection not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const { data: entries } = await supabase
      .from('entries')
      .select('id, title, meta')
      .eq('collection_id', colId)
      .eq('status', 'published');

    const enabledLangs = config.enabledLanguages.map(l => l.code);

    const status = (entries || []).map((entry: any) => {
      const meta = (entry.meta || {}) as Record<string, any>;
      const translations = meta.translations || {};

      const langStatus: Record<string, string> = {};
      for (const lang of enabledLangs) {
        langStatus[lang] = translations[lang] ? 'translated' : 'pending';
      }

      return {
        entry_id: entry.id,
        title: entry.title,
        languages: langStatus,
      };
    });

    res.json({
      data: {
        collection,
        default_language: config.defaultLanguage,
        enabled_languages: enabledLangs,
        entries: status,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error fetching translation status', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to fetch status', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

// ============================================
// PUT /api/v1/i18n/translation/:entryId/:lang
// Manually update a translation
// Body: { fields: { field_id: "translated value", ... } }
// ============================================

router.put('/translation/:entryId/:lang', async (req: AuthRequest, res: Response) => {
  try {
    const { entryId, lang } = req.params;
    const { fields } = req.body;

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({
        error: { message: 'Missing fields object', status: 400, timestamp: new Date().toISOString() }
      });
    }

    const { data: entry, error: fetchErr } = await supabase
      .from('entries')
      .select('id, meta')
      .eq('id', entryId)
      .single();

    if (fetchErr || !entry) {
      return res.status(404).json({
        error: { message: 'Entry not found', status: 404, timestamp: new Date().toISOString() }
      });
    }

    const currentMeta = (entry.meta || {}) as Record<string, any>;
    const currentTranslation = currentMeta.translations?.[lang] || {};

    const updatedMeta = {
      ...currentMeta,
      translations: {
        ...(currentMeta.translations || {}),
        [lang]: { ...currentTranslation, ...fields },
      },
    };

    await supabase
      .from('entries')
      .update({ meta: updatedMeta })
      .eq('id', entryId);

    logger.info('Translation manually updated', { entryId, lang, fields: Object.keys(fields).length });

    res.json({
      data: { message: 'Translation updated' },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logger.error('Error updating translation', { error: error.message });
    res.status(500).json({
      error: { message: 'Failed to update translation', status: 500, timestamp: new Date().toISOString() }
    });
  }
});

export default router;
