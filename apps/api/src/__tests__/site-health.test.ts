/**
 * Site health evaluators — no server or database needed.
 * Run with: node --import tsx --test src/__tests__/site-health.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateSchema, evaluateApiKeys, evaluateRecipients, EXPECTED_SCHEMA_VERSION,
} from '../routes/site-health.js';

const fullSchema = {
  schema_version: EXPECTED_SCHEMA_VERSION,
  snapshots: true, coupon_limits: true, trash: true, addons: true, channel_manager: true,
  api_key_rpc: true, role_protection: true, cookie_consents: true, media_bucket: true,
  translation_cache: true,
  private_rls: true,
  author_set_null: true,
  live_slug_index: true,
  site_notes_private: true,
  translation_log_private: true,
};

describe('evaluateSchema', () => {
  it('ok when everything is present', () => {
    assert.equal(evaluateSchema(fullSchema).status, 'ok');
  });

  it('error when the status function is missing (upgrade never ran)', () => {
    const c = evaluateSchema(null);
    assert.equal(c.status, 'error');
    assert.deepEqual(c.facts.missing, ['schema_status']);
  });

  it('lists missing features', () => {
    const c = evaluateSchema({ ...fullSchema, trash: false, cookie_consents: false });
    assert.equal(c.status, 'error');
    assert.deepEqual(c.facts.missing, ['trash', 'cookie_consents']);
  });

  it('error when the schema version is older than the API expects', () => {
    assert.equal(evaluateSchema({ ...fullSchema, schema_version: EXPECTED_SCHEMA_VERSION - 1 }).status, 'error');
  });
});

describe('evaluateApiKeys', () => {
  const now = new Date('2026-11-08T12:00:00Z');

  it('error with no active keys', () => {
    assert.equal(evaluateApiKeys([], now).status, 'error');
  });

  it('warn when the site never used its key', () => {
    assert.equal(evaluateApiKeys([{ last_used_at: null }], now).status, 'warn');
  });

  it('warn when the key has not been used for over a week', () => {
    assert.equal(evaluateApiKeys([{ last_used_at: '2026-10-20T00:00:00Z' }], now).status, 'warn');
  });

  it('ok when any key was used recently', () => {
    const c = evaluateApiKeys([{ last_used_at: null }, { last_used_at: '2026-11-08T10:00:00Z' }], now);
    assert.equal(c.status, 'ok');
    assert.equal(c.facts.activeKeys, 2);
    assert.equal(c.facts.lastUsedAt, '2026-11-08T10:00:00.000Z');
  });
});

describe('evaluateRecipients', () => {
  it('prefers Notification Email(s) over Contact Email', () => {
    const c = evaluateRecipients({ notification_emails: 'a@x.pt, b@x.pt', contact_email: 'c@x.pt' }, undefined);
    assert.equal(c.status, 'ok');
    assert.deepEqual(c.facts.recipients, ['a@x.pt', 'b@x.pt']);
    assert.equal(c.facts.source, 'notification_emails');
  });

  it('falls back to Contact Email', () => {
    const c = evaluateRecipients({ contact_email: 'c@x.pt' }, undefined);
    assert.equal(c.facts.source, 'contact_email');
    assert.equal(c.status, 'ok');
  });

  it('warns when only the agency-wide env fallback is set', () => {
    const c = evaluateRecipients(null, 'agency@kiban.pt');
    assert.equal(c.status, 'warn');
    assert.equal(c.facts.source, 'env');
  });

  it('errors with no recipients at all', () => {
    assert.equal(evaluateRecipients({}, undefined).status, 'error');
  });
});
