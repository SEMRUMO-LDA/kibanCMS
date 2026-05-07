/**
 * Channel adapter registry.
 *
 * Routes look up adapters by id. Adding a new provider is one import + one
 * map entry — the rest of the system (webhook routing, validation, audit)
 * works generically through the ChannelAdapter interface.
 */

import type { ChannelAdapter } from './types.js';
import { BokunAdapter } from './bokun.js';

const REGISTRY: Record<string, ChannelAdapter> = {
  [BokunAdapter.id]: BokunAdapter,
};

export function getAdapter(provider: string): ChannelAdapter | undefined {
  return REGISTRY[provider];
}

export function listAdapters(): ChannelAdapter[] {
  return Object.values(REGISTRY);
}

export type { ChannelAdapter, ChannelCredentials, NormalizedBooking, WebhookEvent } from './types.js';
