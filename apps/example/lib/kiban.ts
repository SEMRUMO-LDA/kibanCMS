/**
 * Simple KibanCMS client
 * Fetches data from KibanCMS REST API
 */

const API_URL = process.env.NEXT_PUBLIC_KIBAN_API_URL || 'http://localhost:5000';
const API_KEY = process.env.KIBAN_API_KEY || '';

if (!API_KEY) {
  throw new Error('Missing API key. Please configure KIBAN_API_KEY in .env.local');
}

interface Entry {
  id: string;
  title: string;
  slug: string;
  content: Record<string, any>;
  excerpt: string | null;
  status: string;
  published_at: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: any;
  timestamp: string;
}

interface ApiError {
  error: {
    message: string;
    details?: any;
    status: number;
    timestamp: string;
  };
}

async function apiFetch<T>(endpoint: string): Promise<T> {
  const url = `${API_URL}/api/v1${endpoint}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    next: { revalidate: 60 }, // ISR: revalidate every 60 seconds
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.error.message || `API Error: ${response.status}`);
  }

  const json: ApiResponse<T> = await response.json();
  return json.data;
}

export async function getEntries(collectionSlug: string): Promise<Entry[]> {
  return apiFetch<Entry[]>(`/entries/${collectionSlug}?status=published`);
}

export async function getEntry(collectionSlug: string, entrySlug: string): Promise<Entry> {
  return apiFetch<Entry>(`/entries/${collectionSlug}/${entrySlug}`);
}

export type { Entry };
