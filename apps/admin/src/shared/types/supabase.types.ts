/**
 * Supabase Database types for the tables/functions the admin queries directly.
 *
 * Mirrors database/migrations/CLEAN_RESET.sql + 006 + 008, in the format
 * supabase-js v2.x expects (Relationships/CompositeTypes are required — the
 * old hand-written format made every query resolve to `never`).
 *
 * Can be regenerated against a tenant with:
 *   supabase gen types typescript --project-id <ref> > src/shared/types/supabase.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'super_admin' | 'admin' | 'editor' | 'author' | 'viewer';
export type ContentStatus = 'draft' | 'review' | 'scheduled' | 'published' | 'archived';
export type CollectionType = 'post' | 'page' | 'custom';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          onboarding_completed: boolean;
          project_manifesto: Json | null;
          preferences: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          role?: UserRole;
          onboarding_completed?: boolean;
          project_manifesto?: Json | null;
          preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          /** Rejected by the database for end users (migration 008) — use api.updateUser. */
          role?: UserRole;
          onboarding_completed?: boolean;
          project_manifesto?: Json | null;
          preferences?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          type: CollectionType;
          fields: Json;
          settings: Json | null;
          icon: string | null;
          color: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          type?: CollectionType;
          fields?: Json;
          settings?: Json | null;
          icon?: string | null;
          color?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['collections']['Insert']>;
        Relationships: [
          { foreignKeyName: 'collections_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      entries: {
        Row: {
          id: string;
          collection_id: string;
          title: string;
          slug: string;
          content: Json;
          excerpt: string | null;
          featured_image: string | null;
          status: ContentStatus;
          published_at: string | null;
          author_id: string;
          meta: Json | null;
          tags: string[] | null;
          version: number;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          title: string;
          slug: string;
          content?: Json;
          excerpt?: string | null;
          featured_image?: string | null;
          status?: ContentStatus;
          published_at?: string | null;
          author_id: string;
          meta?: Json | null;
          tags?: string[] | null;
          version?: number;
          deleted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['entries']['Insert']>;
        Relationships: [
          { foreignKeyName: 'entries_collection_id_fkey'; columns: ['collection_id']; isOneToOne: false; referencedRelation: 'collections'; referencedColumns: ['id'] },
          { foreignKeyName: 'entries_author_id_fkey'; columns: ['author_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      media: {
        Row: {
          id: string;
          filename: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
          bucket_name: string;
          dimensions: Json | null;
          alt_text: string | null;
          caption: string | null;
          metadata: Json | null;
          uploaded_by: string;
          folder_path: string | null;
          is_public: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          filename: string;
          original_name: string;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
          bucket_name?: string;
          dimensions?: Json | null;
          alt_text?: string | null;
          caption?: string | null;
          metadata?: Json | null;
          uploaded_by: string;
          folder_path?: string | null;
          is_public?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['media']['Insert']>;
        Relationships: [
          { foreignKeyName: 'media_uploaded_by_fkey'; columns: ['uploaded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      entry_revisions: {
        Row: {
          id: string;
          entry_id: string;
          version: number;
          title: string;
          content: Json;
          excerpt: string | null;
          meta: Json | null;
          revised_by: string;
          revision_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          version: number;
          title: string;
          content: Json;
          excerpt?: string | null;
          meta?: Json | null;
          revised_by: string;
          revision_notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['entry_revisions']['Insert']>;
        Relationships: [
          { foreignKeyName: 'entry_revisions_entry_id_fkey'; columns: ['entry_id']; isOneToOne: false; referencedRelation: 'entries'; referencedColumns: ['id'] },
          { foreignKeyName: 'entry_revisions_revised_by_fkey'; columns: ['revised_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      api_keys: {
        Row: {
          id: string;
          profile_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          created_at: string;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          profile_id: string;
          name?: string;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          created_at?: string;
          revoked_at?: string | null;
        };
        Update: Partial<Database['public']['Tables']['api_keys']['Insert']>;
        Relationships: [
          { foreignKeyName: 'api_keys_profile_id_fkey'; columns: ['profile_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      addon_registry: {
        Row: {
          id: string;
          addon_id: string;
          status: Json;
          config: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          addon_id: string;
          status?: Json;
          config?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['addon_registry']['Insert']>;
        Relationships: [];
      };
      addon_configs: {
        Row: {
          id: string;
          addon_id: string;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          addon_id: string;
          config: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['addon_configs']['Insert']>;
        Relationships: [
          { foreignKeyName: 'addon_configs_addon_id_fkey'; columns: ['addon_id']; isOneToOne: true; referencedRelation: 'addon_registry'; referencedColumns: ['addon_id'] },
        ];
      };
      addon_cookie_notice_consents: {
        Row: {
          id: string;
          visitor_id: string;
          consent_given: boolean;
          categories: Json;
          ip_address: string | null;
          user_agent: string | null;
          consent_date: string;
        };
        Insert: {
          id?: string;
          visitor_id: string;
          consent_given?: boolean;
          categories?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          consent_date?: string;
        };
        Update: Partial<Database['public']['Tables']['addon_cookie_notice_consents']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_new_api_key_for_user: {
        Args: { user_profile_id: string; key_name?: string };
        Returns: { api_key: string; key_id: string; key_prefix: string; created_at: string }[];
      };
      generate_api_key: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      hash_api_key: {
        Args: { key_value: string };
        Returns: string;
      };
      get_key_prefix: {
        Args: { key_value: string };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
      content_status: ContentStatus;
      collection_type: CollectionType;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
