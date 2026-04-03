/**
 * React hooks for KibanCMS
 *
 * @example
 * ```typescript
 * import { useEntries, useEntry } from '@kiban/client/react';
 *
 * function BlogList() {
 *   const { data, loading, error } = useEntries('blog', { status: 'published' });
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error}</div>;
 *
 *   return (
 *     <ul>
 *       {data?.map(post => (
 *         <li key={post.id}>{post.title}</li>
 *       ))}
 *     </ul>
 *   );
 * }
 * ```
 */

import { useState, useEffect } from 'react';
import { KibanClient } from './client';
import type { Entry, QueryOptions, Collection } from './types';

interface UseDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * React hook to fetch entries from a collection
 */
export function useEntries(
  client: KibanClient,
  collectionSlug: string,
  options?: QueryOptions
): UseDataResult<Entry[]> {
  const [data, setData] = useState<Entry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const entries = await client.getEntries(collectionSlug, options);
      setData(entries);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch entries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [collectionSlug, JSON.stringify(options)]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * React hook to fetch a single entry by slug
 */
export function useEntry(
  client: KibanClient,
  collectionSlug: string,
  entrySlug: string
): UseDataResult<Entry> {
  const [data, setData] = useState<Entry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const entry = await client.getEntry(collectionSlug, entrySlug);
      setData(entry);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch entry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [collectionSlug, entrySlug]);

  return { data, loading, error, refetch: fetchData };
}

/**
 * React hook to fetch all collections
 */
export function useCollections(client: KibanClient): UseDataResult<Collection[]> {
  const [data, setData] = useState<Collection[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const collections = await client.getCollections();
      setData(collections);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch collections');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error, refetch: fetchData };
}

/**
 * React hook to fetch a single collection
 */
export function useCollection(client: KibanClient, slug: string): UseDataResult<Collection> {
  const [data, setData] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const collection = await client.getCollection(slug);
      setData(collection);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch collection');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [slug]);

  return { data, loading, error, refetch: fetchData };
}
