/**
 * Translation cache — no server or database needed (DB tier degrades to memory).
 * Run with: node --import tsx --test src/__tests__/translation-cache.test.ts
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { translateWithCache, translationKey, _clearTranslationMemory } from '../lib/translation-cache.js';

function fakeProvider() {
  const calls: string[][] = [];
  const fn = async (texts: string[], tgt: string) => {
    calls.push([...texts]);
    return texts.map(t => `${t}@${tgt}`);
  };
  return { fn, calls };
}

describe('translateWithCache', () => {
  beforeEach(() => _clearTranslationMemory());

  it('passes through when source and target are the same language', async () => {
    const p = fakeProvider();
    const r = await translateWithCache(['Olá'], 'PT', 'pt', p.fn);
    assert.deepEqual(r.translations, ['Olá']);
    assert.equal(p.calls.length, 0);
  });

  it('translates each distinct text once and keeps order', async () => {
    const p = fakeProvider();
    const r = await translateWithCache(['a', 'b', 'a', '', '  '], 'en', 'pt', p.fn);
    assert.deepEqual(r.translations, ['a@en', 'b@en', 'a@en', '', '  ']);
    assert.deepEqual(p.calls, [['a', 'b']]);
    assert.equal(r.translated, 2);
  });

  it('serves repeat requests from cache without calling the provider', async () => {
    const p = fakeProvider();
    await translateWithCache(['Reservar agora', 'Contactos'], 'en', 'pt', p.fn);
    const r = await translateWithCache(['Contactos', 'Reservar agora', 'Novo texto'], 'en', 'pt', p.fn);
    assert.deepEqual(r.translations, ['Contactos@en', 'Reservar agora@en', 'Novo texto@en']);
    assert.deepEqual(p.calls[1], ['Novo texto']);
    assert.equal(r.fromCache, 2);
  });

  it('keys depend on source, target and text', () => {
    assert.notEqual(translationKey('pt', 'en', 'x'), translationKey('pt', 'fr', 'x'));
    assert.notEqual(translationKey('pt', 'en', 'x'), translationKey('es', 'en', 'x'));
    assert.match(translationKey('pt', 'en', 'x'), /^[0-9a-f]{64}$/);
  });
});
