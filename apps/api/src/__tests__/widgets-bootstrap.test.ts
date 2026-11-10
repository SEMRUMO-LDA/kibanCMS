import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WIDGETS_VERSION, WIDGET_STATIC_DIR, WIDGET_FILES } from '../lib/widgets-bootstrap.js';

describe('widgets bootstrap', () => {
  it('finds the static widget scripts and hashes them into a version', () => {
    for (const f of WIDGET_FILES) assert.ok(existsSync(path.join(WIDGET_STATIC_DIR, f)), `${f} missing in ${WIDGET_STATIC_DIR}`);
    assert.match(WIDGETS_VERSION, /^[0-9a-f]{10}$/);
  });
});
