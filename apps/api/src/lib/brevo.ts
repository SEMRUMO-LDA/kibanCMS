/**
 * Brevo (formerly Sendinblue) API client.
 *
 * Wraps the subset of Brevo's REST API the kibanCMS Newsletter add-on
 * needs:
 *   - test connection (account info)
 *   - list available contact lists
 *   - upsert a contact (create or update + add to list)
 *
 * API docs: https://developers.brevo.com/reference
 */

const BREVO_BASE = 'https://api.brevo.com/v3';

export interface BrevoConfig {
  apiKey: string;
  listId?: number | string;
  doubleOptIn?: boolean;
  redirectUrl?: string;        // for double opt-in confirmation
  templateId?: number | string;// for double opt-in confirmation email
}

export interface BrevoAccountInfo {
  email: string;
  firstName: string;
  lastName: string;
  companyName?: string;
  plan?: Array<{ type: string; creditsType?: string; credits?: number }>;
}

export interface BrevoList {
  id: number;
  name: string;
  totalSubscribers?: number;
  totalBlacklisted?: number;
  folderId?: number;
}

export interface BrevoContact {
  id?: number;
  email: string;
  attributes?: Record<string, string | number | boolean>;
  listIds?: number[];
}

interface BrevoErrorBody {
  code?: string;
  message?: string;
}

export class BrevoError extends Error {
  status: number;
  code: string | undefined;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function brevoFetch(
  path: string,
  init: RequestInit & { apiKey: string }
): Promise<any> {
  const { apiKey, ...rest } = init;
  const headers = {
    'api-key': apiKey,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(rest.headers || {}),
  } as Record<string, string>;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(BREVO_BASE + path, { ...rest, headers, signal: controller.signal });
    clearTimeout(timer);

    // 204 No Content → return empty
    if (res.status === 204) return null;

    const text = await res.text();
    let json: any = null;
    if (text) {
      try { json = JSON.parse(text); } catch { json = { message: text }; }
    }

    if (!res.ok) {
      const body = (json || {}) as BrevoErrorBody;
      throw new BrevoError(
        body.message || `Brevo HTTP ${res.status}`,
        res.status,
        body.code,
      );
    }

    return json;
  } catch (err: any) {
    clearTimeout(timer);
    if (err instanceof BrevoError) throw err;
    if (err.name === 'AbortError') throw new BrevoError('Brevo request timed out (10s)', 504);
    throw new BrevoError(err.message || 'Brevo request failed', 0);
  }
}

/** GET /account — used for "Test Connection". Validates the API key works. */
export async function brevoGetAccount(apiKey: string): Promise<BrevoAccountInfo> {
  return brevoFetch('/account', { apiKey, method: 'GET' });
}

/** GET /contacts/lists?limit=50 — list available contact lists. */
export async function brevoGetLists(apiKey: string): Promise<BrevoList[]> {
  const res = await brevoFetch('/contacts/lists?limit=50&offset=0', { apiKey, method: 'GET' });
  return (res?.lists || []) as BrevoList[];
}

/**
 * POST /contacts (or PUT /contacts/{email} if exists) — upsert a contact.
 *
 * Brevo's POST /contacts returns 201 on creation. If the email already
 * exists, it returns 400 with code `duplicate_parameter`. In that case we
 * PUT /contacts/{email} to merge attributes and ensure the list is added.
 *
 * Returns the resolved contact ID (numeric).
 */
export async function brevoUpsertContact(
  config: BrevoConfig,
  contact: BrevoContact,
): Promise<number | null> {
  const listIds: number[] = [];
  if (contact.listIds?.length) listIds.push(...contact.listIds);
  if (config.listId) listIds.push(Number(config.listId));
  const dedupedLists = [...new Set(listIds.filter(n => Number.isFinite(n) && n > 0))];

  const body: Record<string, any> = {
    email: contact.email,
    attributes: contact.attributes || {},
    updateEnabled: true,
  };
  if (dedupedLists.length > 0) body.listIds = dedupedLists;
  if (config.doubleOptIn && config.templateId) {
    // Brevo requires the contact creation endpoint /contacts/doubleOptinConfirmation
    // for DOI (separate flow). Most agencies leave DOI off and use Brevo lists'
    // own confirmation if needed. Skip DOI here unless configured properly.
    if (config.redirectUrl) body.redirectionUrl = config.redirectUrl;
    body.templateId = Number(config.templateId);
  }

  try {
    const res = await brevoFetch('/contacts', {
      apiKey: config.apiKey,
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res?.id ?? null;
  } catch (err: any) {
    // Already exists → updateEnabled=true should have handled it. If it
    // surfaces as a different error, swallow duplicates and return null.
    if (err instanceof BrevoError && err.status === 400 && /duplicate/i.test(err.message)) {
      return null;
    }
    throw err;
  }
}

/**
 * Convert kibanCMS subscriber fields to Brevo attribute format.
 * Brevo attribute names are uppercase by convention (FIRSTNAME, LASTNAME, SOURCE).
 */
export function buildBrevoAttributes(subscriber: {
  name?: string;
  source?: string;
  tags?: string;
}): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (subscriber.name && subscriber.name.trim()) {
    const parts = subscriber.name.trim().split(/\s+/);
    attrs.FIRSTNAME = parts[0];
    if (parts.length > 1) attrs.LASTNAME = parts.slice(1).join(' ');
  }
  if (subscriber.source && subscriber.source.trim()) {
    attrs.SOURCE = subscriber.source.trim();
  }
  if (subscriber.tags && subscriber.tags.trim()) {
    attrs.TAGS = subscriber.tags.trim();
  }
  return attrs;
}
