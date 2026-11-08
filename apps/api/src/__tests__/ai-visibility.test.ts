/**
 * AI/search visibility: robots AI policy, JSON-LD and llms.txt — pure functions.
 * Run with: node --import tsx --test src/__tests__/ai-visibility.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aiRobotsRules, buildRobotsTxt, normalizePolicy } from '../lib/ai-crawlers.js';
import { detectEntryType, entryJsonLd, organizationJsonLd, clean, plainText, renderLlmsTxt, type SiteContext } from '../lib/structured-data.js';

const ctx: SiteContext = {
  siteUrl: 'https://www.marsolve.pt',
  name: 'Marsolve',
  businessType: 'TravelAgency',
  site: {
    site_name: 'Marsolve', site_description: 'Passeios de barco no <b>Algarve</b>.',
    contact_phone: '+351 900 000 000', contact_email: 'info@marsolve.pt', address: 'Marina de Lagos',
    instagram_url: 'https://instagram.com/marsolve', facebook_url: '', logo_url: 'https://cdn.x/logo.png',
    entry_url_pattern: '/{collection}/{slug}', language: 'pt',
  },
  seo: {},
};

describe('AI crawler policy', () => {
  it('adds nothing when both are allowed (default)', () => {
    assert.equal(aiRobotsRules('allow', 'allow'), '');
  });

  it('blocks training bots but keeps AI search allowed', () => {
    const rules = aiRobotsRules('allow', 'block');
    assert.match(rules, /User-agent: GPTBot[\s\S]*Disallow: \//);
    assert.match(rules, /User-agent: OAI-SearchBot[\s\S]*?Allow: \//);
    assert.ok(!/User-agent: Googlebot/.test(rules), 'normal search must never be blocked');
  });

  it('builds a full robots.txt with the sitemap line once', () => {
    const txt = buildRobotsTxt({ base: 'User-agent: *\nAllow: /', search: 'block', training: 'block', sitemapUrl: 'https://www.marsolve.pt/sitemap.xml' });
    assert.ok(txt.startsWith('User-agent: *\nAllow: /\n'));
    assert.equal((txt.match(/Sitemap:/g) || []).length, 1);
    const withOwn = buildRobotsTxt({ base: 'User-agent: *\nAllow: /\nSitemap: https://x/s.xml', search: 'allow', training: 'allow', sitemapUrl: 'https://y/s.xml' });
    assert.equal((withOwn.match(/Sitemap:/g) || []).length, 1);
  });

  it('normalizes unknown values to allow', () => {
    assert.equal(normalizePolicy('block'), 'block');
    assert.equal(normalizePolicy(undefined), 'allow');
    assert.equal(normalizePolicy('whatever'), 'allow');
  });
});

describe('JSON-LD', () => {
  it('detects types from the collection and fields, with override', () => {
    assert.equal(detectEntryType('tours', {}), 'TouristTrip');
    assert.equal(detectEntryType('passeios-barco', {}), 'TouristTrip');
    assert.equal(detectEntryType('blog', {}), 'BlogPosting');
    assert.equal(detectEntryType('agenda', {}), 'Event');
    assert.equal(detectEntryType('misc', { start_date: '2027-06-01' }), 'Event');
    assert.equal(detectEntryType('misc', { price: 30, meeting_point: 'Marina' }), 'TouristTrip');
    assert.equal(detectEntryType('misc', {}), 'WebPage');
    assert.equal(detectEntryType('tours', {}, 'Product'), 'Product');
    assert.equal(detectEntryType('tours', {}, 'Nonsense'), 'TouristTrip');
  });

  it('builds a TouristTrip with offer, provider and canonical URL', () => {
    const ld = entryJsonLd({ title: 'Grutas de Benagil', slug: 'grutas-benagil',
      content: { description: '<p>Visita às grutas</p>', price: '35', image: 'https://cdn.x/b.jpg', meeting_point: 'Marina de Lagos' } }, 'tours', ctx);
    assert.equal(ld['@type'], 'TouristTrip');
    assert.equal(ld.url, 'https://www.marsolve.pt/tours/grutas-benagil');
    assert.equal(ld.description, 'Visita às grutas');
    assert.deepEqual(ld.offers, { '@type': 'Offer', price: '35', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: 'https://www.marsolve.pt/tours/grutas-benagil' });
    assert.equal(ld.provider['@type'], 'TravelAgency');
    assert.equal(ld.itinerary.name, 'Marina de Lagos');
  });

  it('builds a BlogPosting with dates and publisher', () => {
    const ld = entryJsonLd({ title: 'Melhor época', slug: 'melhor-epoca', published_at: '2027-01-01T10:00:00Z', updated_at: '2027-01-02T10:00:00Z', content: {} }, 'blog', ctx);
    assert.equal(ld['@type'], 'BlogPosting');
    assert.equal(ld.headline, 'Melhor época');
    assert.equal(ld.datePublished, '2027-01-01T10:00:00Z');
    assert.equal(ld.publisher.logo.url, 'https://cdn.x/logo.png');
  });

  it('builds an FAQPage from a faqs list', () => {
    const ld = entryJsonLd({ title: 'FAQ', slug: 'faq', content: { faqs: [{ question: 'Posso levar crianças?', answer: 'Sim, a partir dos 4 anos.' }] } }, 'faq', ctx);
    assert.equal(ld.mainEntity[0]['@type'], 'Question');
    assert.equal(ld.mainEntity[0].acceptedAnswer.text, 'Sim, a partir dos 4 anos.');
  });

  it('builds the business node from Settings, skipping empty socials', () => {
    const org = organizationJsonLd(ctx);
    assert.equal(org['@type'], 'TravelAgency');
    assert.deepEqual(org.sameAs, ['https://instagram.com/marsolve']);
    assert.equal(org.address.streetAddress, 'Marina de Lagos');
    assert.equal(org.description, 'Passeios de barco no Algarve.');
  });

  it('clean() drops empty values recursively', () => {
    assert.deepEqual(clean({ a: '', b: undefined, c: { d: null }, e: [], f: 1, g: [{ h: '' }, 'x'] }), { f: 1, g: ['x'] });
    assert.equal(plainText('<p>a&nbsp; <b>b</b></p>'), 'a b');
  });
});

describe('llms.txt', () => {
  it('renders the llmstxt.org layout', () => {
    const txt = renderLlmsTxt(ctx, [
      { title: 'Tours', links: [{ title: 'Grutas de Benagil', url: 'https://www.marsolve.pt/tours/grutas-benagil', description: 'Visita às grutas' }] },
      { title: 'Vazia', links: [] },
    ]);
    assert.ok(txt.startsWith('# Marsolve\n\n> Passeios de barco no Algarve.\n'));
    assert.ok(txt.includes('Contact: +351 900 000 000 · info@marsolve.pt · Marina de Lagos'));
    assert.ok(txt.includes('## Tours\n\n- [Grutas de Benagil](https://www.marsolve.pt/tours/grutas-benagil): Visita às grutas'));
    assert.ok(!txt.includes('## Vazia'));
  });
});
