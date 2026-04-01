/**
 * Database types for kibanCMS
 * Auto-generated types based on Supabase schema
 */

// ============================================
// ENUMS
// ============================================

export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer'
}

export enum ContentStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived'
}

export enum CollectionType {
  POST = 'post',
  PAGE = 'page',
  CUSTOM = 'custom'
}

// ============================================
// DATABASE TABLES
// ============================================

export interface Profile {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  preferences: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  type: CollectionType;
  fields: CollectionField[];
  settings: CollectionSettings;
  icon?: string | null;
  color?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Entry {
  id: string;
  collection_id: string;
  title: string;
  slug: string;
  content: Record<string, any>;
  excerpt?: string | null;
  featured_image?: string | null;
  status: ContentStatus;
  published_at?: string | null;
  author_id: string;
  meta: EntryMeta;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
  // Relations
  collection?: Collection;
  author?: Profile;
  featured_image_data?: Media;
}

export interface Media {
  id: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  bucket_name: string;
  dimensions?: MediaDimensions | null;
  alt_text?: string | null;
  caption?: string | null;
  metadata: Record<string, any>;
  uploaded_by: string;
  folder_path: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  // Relations
  uploader?: Profile;
}

export interface EntryRevision {
  id: string;
  entry_id: string;
  version: number;
  title: string;
  content: Record<string, any>;
  excerpt?: string | null;
  meta?: Record<string, any> | null;
  revised_by: string;
  revision_notes?: string | null;
  created_at: string;
  // Relations
  entry?: Entry;
  revisor?: Profile;
}

// ============================================
// FIELD TYPES FOR COLLECTIONS
// ============================================

export type FieldType =
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'number'
  | 'date'
  | 'datetime'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'image'
  | 'file'
  | 'relation'
  | 'json'
  | 'color'
  | 'url'
  | 'email';

export interface CollectionField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  defaultValue?: any;
  placeholder?: string;
  helpText?: string;
  validation?: FieldValidation;
  options?: SelectOption[]; // For select/multiselect
  relationTo?: string; // For relation fields
  multiple?: boolean; // For relation/file fields
  maxLength?: number; // For text fields
  minLength?: number; // For text fields
  max?: number; // For number fields
  min?: number; // For number fields
}

export interface FieldValidation {
  pattern?: string;
  message?: string;
  custom?: string; // Custom validation function name
}

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
  icon?: string;
}

// ============================================
// SETTINGS AND METADATA
// ============================================

export interface CollectionSettings {
  singleton?: boolean; // Only one entry allowed
  sortable?: boolean; // Entries can be manually sorted
  searchable?: boolean; // Enable search
  versionable?: boolean; // Track versions
  allowComments?: boolean;
  defaultStatus?: ContentStatus;
  permalinkPattern?: string; // e.g., "/blog/:slug"
  apiEnabled?: boolean;
  apiEndpoint?: string;
}

export interface EntryMeta {
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[];
  og_title?: string;
  og_description?: string;
  og_image?: string;
  canonical_url?: string;
  robots?: string;
  schema?: Record<string, any>; // JSON-LD schema
  custom?: Record<string, any>; // Custom metadata
}

export interface MediaDimensions {
  width: number;
  height: number;
}

// ============================================
// API RESPONSES
// ============================================

export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, any>;
}

// ============================================
// QUERY FILTERS
// ============================================

export interface QueryFilters {
  status?: ContentStatus | ContentStatus[];
  collection_id?: string;
  author_id?: string;
  tags?: string[];
  search?: string;
  published_after?: string;
  published_before?: string;
  sort_by?: 'created_at' | 'updated_at' | 'published_at' | 'title';
  sort_order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// ============================================
// FORM DATA
// ============================================

export interface CreateEntryData {
  collection_id: string;
  title: string;
  slug?: string; // Auto-generated if not provided
  content: Record<string, any>;
  excerpt?: string;
  featured_image?: string;
  status?: ContentStatus;
  published_at?: string;
  meta?: EntryMeta;
  tags?: string[];
}

export interface UpdateEntryData extends Partial<CreateEntryData> {
  id: string;
}

export interface CreateCollectionData {
  name: string;
  slug?: string; // Auto-generated if not provided
  description?: string;
  type?: CollectionType;
  fields: CollectionField[];
  settings?: CollectionSettings;
  icon?: string;
  color?: string;
}

export interface UpdateCollectionData extends Partial<CreateCollectionData> {
  id: string;
}

// ============================================
// UTILITY TYPES
// ============================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type WithTimestamps<T> = T & {
  created_at: string;
  updated_at: string;
};

export type WithAuthor<T> = T & {
  author: Profile;
};

export type WithCollection<T> = T & {
  collection: Collection;
};