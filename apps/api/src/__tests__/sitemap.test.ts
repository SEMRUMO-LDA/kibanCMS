/**
 * Sitemap helpers — no server or database needed.
 * Run with: node --import tsx --test src/__tests__/sitemap.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPattern, normalizeSiteUrl, isNoindex, toSitemapXml, NON_PAGE_COLLECTIONS } from '../lib/sitemap.js';

describe('sitemap helpers', () => {
  it('applies the permalink pattern', () => {
    assert.equal(applyPattern('/{collection}/{slug}', { collection: 'blog', slug: 'ola-mundo' }), '/blog/ola-mundo');
    assert.equal(applyPattern('/{slug}', { slug: 'sobre' }), '/sobre');
    assert.equal(applyPattern('{collection}//{slug}', { collection: 'tours', slug: 'x' }), '/tours/x');
  });

  it('encodes unsafe characters and drops unknown placeholders', () => {
    assert.equal(applyPattern('/{collection}/{slug}', { collection: 'blog', slug: 'a b' }), '/blog/a%20b');
    assert.equal(applyPattern('/{lang}/{slug}', { slug: 'x' }), '/x');
  });

  it('normalizes the site URL', () => {
    assert.equal(normalizeSiteUrl(' https://marsolve.pt/// '), 'https://marsolve.pt');
  });

  it('detects noindex in content or meta', () => {
    assert.equal(isNoindex({ content: { noindex: true } }), true);
    assert.equal(isNoindex({ meta: { seo: { noindex: 'true' } } }), true);
    assert.equal(isNoindex({ content: {}, meta: {} }), false);
  });

  it('renders valid, escaped XML with date-only lastmod', () => {
    const xml = toSitemapXml([{ url: 'https://x.pt/a?b=1&c=2', lastModified: '2026-11-08T10:00:00Z', collection: 'blog' }]);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('<loc>https://x.pt/a?b=1&amp;c=2</loc>'));
    assert.ok(xml.includes('<lastmod>2026-11-08</lastmod>'));
  });

  it('never lists config collections', () => {
    for (const slug of ['site-settings', 'seo-settings', 'redirects', 'forms-config']) assert.ok(NON_PAGE_COLLECTIONS.has(slug));
  });
});
