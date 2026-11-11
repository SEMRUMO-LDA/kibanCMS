/**
 * Inline editing ("Editar no site") — pure helpers (no network, no DB).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickFallbackCollections, MAX_FALLBACK_ENTRIES, MAX_FALLBACK_PER_COLLECTION } from '../lib/inline-edit.js';
import {
  parseMode, roleAllowed, saveModeFor, isEditableCollection, parsePath, editableFields,
  normalizeChanges, applyChanges, mergePending, currentValue, sanitizeText,
} from '../lib/inline-edit.js';

describe('inline edit: modes and roles', () => {
  it('defaults to off and gates roles per mode', () => {
    assert.equal(parseMode(undefined), 'off');
    assert.equal(parseMode('weird'), 'off');
    assert.equal(parseMode('beta'), 'beta');
    assert.equal(roleAllowed('off', 'super_admin'), false);
    assert.equal(roleAllowed('beta', 'admin'), true);
    assert.equal(roleAllowed('beta', 'editor'), false);
    assert.equal(roleAllowed('on', 'editor'), true);
    assert.equal(roleAllowed('on', 'author'), false);
    assert.equal(saveModeFor('beta'), 'draft');
    assert.equal(saveModeFor('on'), 'publish');
  });

  it('never exposes config or customer collections', () => {
    for (const slug of ['bookings', 'orders', 'stripe-config', 'site-settings', 'seo-settings', 'forms-config', 'form-submissions', 'whatsapp-widget', 'i18n-translations', 'newsletter-campaigns', 'coupon-redemptions']) {
      assert.equal(isEditableCollection(slug), false, slug);
    }
    for (const slug of ['pages', 'tours', 'blog', 'testimonials', 'faq']) assert.equal(isEditableCollection(slug), true, slug);
  });
});

describe('inline edit: path → slugs', () => {
  it('maps the home page, nested paths and language prefixes', () => {
    assert.deepEqual(parsePath('/', []).slugs.slice(0, 2), ['home', 'index']);
    assert.deepEqual(parsePath('/sobre', []), { lang: null, slugs: ['sobre'], collectionHint: null });
    assert.deepEqual(parsePath('/tours/lisbon-tour/', []), { lang: null, slugs: ['lisbon-tour'], collectionHint: 'tours' });
    assert.deepEqual(parsePath('/en/tours/lisbon-tour?utm=1', ['pt', 'en']), { lang: 'en', slugs: ['lisbon-tour'], collectionHint: 'tours' });
    // "en" is only a language when the site has it
    assert.deepEqual(parsePath('/en/about', ['pt', 'es']), { lang: null, slugs: ['about'], collectionHint: 'en' });
    assert.equal(parsePath('/Sobre.html', []).slugs[0], 'sobre');
    assert.deepEqual(parsePath('/weird%20path!', []).slugs, []);
  });
});

describe('inline edit: editable fields', () => {
  const fields = [
    { id: 'headline', name: 'Headline', type: 'text' },
    { id: 'body', name: 'Body', type: 'richtext' },
    { id: 'price', name: 'Price', type: 'number' },
    { id: 'hero', name: 'Hero', type: 'image' },
    { id: 'api_key', name: 'Key', type: 'text' },
    { id: 'schedule', name: 'Schedule', type: 'weekly_schedule' },
  ];

  it('follows the schema and skips secrets and composite fields', () => {
    const keys = Object.fromEntries(editableFields(fields, {}).map(f => [f.key, f.type]));
    assert.equal(keys['title'], 'text');
    assert.equal(keys['content.headline'], 'text');
    assert.equal(keys['content.body'], 'richtext');
    assert.equal(keys['content.price'], 'number');
    assert.equal(keys['content.hero'], 'image');
    assert.equal(keys['content.api_key'], undefined);
    assert.equal(keys['content.schedule'], undefined);
  });

  it('infers types for schema-less collections', () => {
    const keys = Object.fromEntries(editableFields([], {
      intro: 'Olá', long: 'a\nb', photo: 'https://x.pt/a.jpg', html: '<p>x</p>', n: 3, obj: { url: 'https://x.pt/b.png' }, token: 'secret', stripe_key: 'k', slug: 's',
    }).map(f => [f.key, f.type]));
    assert.equal(keys['content.stripe_key'], undefined);
    assert.equal(keys['content.slug'], undefined);
    assert.equal(keys['content.intro'], 'text');
    assert.equal(keys['content.long'], 'textarea');
    assert.equal(keys['content.photo'], 'image');
    assert.equal(keys['content.html'], 'richtext');
    assert.equal(keys['content.n'], 'number');
    assert.equal(keys['content.obj'], 'image');
    assert.equal(keys['content.token'], undefined);
  });

  it('validates and sanitises changes', () => {
    const ok = normalizeChanges([
      { field: 'title', value: '  Novo <b>título</b> ' },
      { field: 'content.price', value: '12,50 €' },
      { field: 'content.hero', value: 'https://cdn.example.com/a.webp' },
      { field: 'content.headline', value: 'a' }, { field: 'content.headline', value: 'b' },
    ], fields, {}, null);
    assert.deepEqual(ok, [
      { field: 'title', value: 'Novo título' },
      { field: 'content.price', value: 12.5 },
      { field: 'content.hero', value: 'https://cdn.example.com/a.webp' },
      { field: 'content.headline', value: 'b' },
    ]);
    assert.throws(() => normalizeChanges([{ field: 'content.body', value: 'x' }], fields, {}, null), /rich text/);
    assert.throws(() => normalizeChanges([{ field: 'content.api_key', value: 'x' }], fields, {}, null), /cannot be edited/);
    assert.throws(() => normalizeChanges([{ field: 'content.hero', value: 'javascript:alert(1)' }], fields, {}, null), /URL/);
    assert.throws(() => normalizeChanges([{ field: 'title', value: '<br>' }], fields, {}, null), /empty/);
    assert.throws(() => normalizeChanges([{ field: 'excerpt', value: 'x' }], fields, {}, 'en'), /shared by all languages/);
    assert.throws(() => normalizeChanges([], fields, {}, null), /No changes/);
    assert.equal(sanitizeText('a  \n\n\n\nb c').length, 'a\n\nb c'.length);
  });
});

describe('inline edit: applying changes', () => {
  const entry = {
    title: 'Old', excerpt: 'e', featured_image: null,
    content: { headline: 'H', hero: { url: 'https://x.pt/old.jpg', focal: { x: 0.3, y: 0.6 } } },
    meta: { translations: { en: { _title: 'Old EN', headline: 'H EN' } } },
  };

  it('updates the entry in the default language and keeps image objects', () => {
    const update = applyChanges(entry, [
      { field: 'title', value: 'New' },
      { field: 'content.headline', value: 'H2' },
      { field: 'content.hero', value: 'https://x.pt/new.jpg' },
      { field: 'excerpt', value: '' },
    ], null);
    assert.equal(update.title, 'New');
    assert.equal(update.excerpt, null);
    assert.equal(update.content.headline, 'H2');
    assert.deepEqual(update.content.hero, { url: 'https://x.pt/new.jpg', focal: { x: 0.3, y: 0.6 } });
    assert.equal(update.meta, undefined);
  });

  it('writes translations for other languages without touching the source', () => {
    const update = applyChanges(entry, [{ field: 'title', value: 'New EN' }, { field: 'content.headline', value: 'H2 EN' }], 'en');
    assert.equal(update.title, undefined);
    assert.equal(update.content, undefined);
    assert.deepEqual(update.meta.translations.en, { _title: 'New EN', headline: 'H2 EN' });
  });

  it('reads the value the site shows', () => {
    assert.equal(currentValue(entry, 'title', null), 'Old');
    assert.equal(currentValue(entry, 'title', 'en'), 'Old EN');
    assert.equal(currentValue(entry, 'content.headline', 'en'), 'H EN');
    assert.equal(currentValue(entry, 'content.hero', null), entry.content.hero);
  });

  it('queues pending changes, replacing older ones for the same field', () => {
    const first = mergePending(undefined, [{ field: 'title', value: 'A' }], entry, null, 'a@b.pt', '2026-01-01T00:00:00Z');
    assert.equal(first.length, 1);
    assert.equal(first[0].previous, 'Old');
    const second = mergePending(first, [{ field: 'title', value: 'C EN' }], entry, 'en', 'a@b.pt');
    // the EN change does not replace the default-language one
    assert.equal(second.length, 2);
    assert.equal(second[0].value, 'A');
    assert.equal(second[1].lang, 'en');
    assert.equal(second[1].previous, 'Old EN');
    const third = mergePending(second, [{ field: 'title', value: 'D' }], entry, null, 'c@d.pt');
    assert.equal(third.length, 2);
    assert.equal(third.find(p => !p.lang)?.value, 'D');
  });
});

describe('pickFallbackCollections', () => {
  it('sends small collections whole, smallest first, within the budget', () => {
    const ids = pickFallbackCollections([
      { id: 'blog', count: 500 }, { id: 'team', count: 11 }, { id: 'services', count: 19 }, { id: 'empty', count: 0 },
    ]);
    assert.deepEqual(ids, ['team', 'services']);
    assert.deepEqual(pickFallbackCollections([{ id: 'a', count: 80 }, { id: 'b', count: 90 }, { id: 'c', count: 100 }], 100, 200), ['a', 'b']);
    assert.deepEqual(pickFallbackCollections([{ id: 'a', count: 101 }], 100, 300), []);
    assert.ok(MAX_FALLBACK_PER_COLLECTION <= MAX_FALLBACK_ENTRIES);
  });
});
