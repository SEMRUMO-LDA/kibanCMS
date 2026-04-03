/**
 * @kiban/client - Official JavaScript/TypeScript SDK for KibanCMS
 *
 * @example
 * ```typescript
 * import { KibanClient } from '@kiban/client';
 *
 * const kiban = new KibanClient({
 *   url: 'https://your-cms.com',
 *   apiKey: 'kiban_live_xxxxx'
 * });
 *
 * // Get all collections
 * const collections = await kiban.getCollections();
 *
 * // Get entries from a collection
 * const posts = await kiban.getEntries('blog', {
 *   status: 'published',
 *   limit: 10
 * });
 *
 * // Get a single entry
 * const post = await kiban.getEntry('blog', 'my-post-slug');
 *
 * // Fluent API
 * const posts = await kiban.collection('blog').find({ status: 'published' });
 * ```
 */

export { KibanClient } from './client';
export type {
  KibanClientConfig,
  Collection,
  Entry,
  QueryOptions,
  CollectionQuery,
  FieldDefinition,
  ApiResponse,
  ApiError,
} from './types';
