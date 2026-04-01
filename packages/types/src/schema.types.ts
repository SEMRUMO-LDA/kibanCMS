/**
 * Schema Types - Dynamic Configuration System
 * Types for manifest-driven CMS configuration
 */

// ============================================
// FIELD TYPES
// ============================================

export type FieldType =
  // Text
  | 'text'
  | 'textarea'
  | 'richtext'
  | 'slug'
  | 'email'
  | 'url'

  // Numbers
  | 'number'
  | 'integer'

  // Boolean
  | 'boolean'
  | 'switch'

  // Date/Time
  | 'date'
  | 'datetime'
  | 'time'

  // Selection
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'tags'

  // Media
  | 'media'
  | 'image'
  | 'file'

  // Advanced
  | 'color'
  | 'geo'
  | 'location'
  | 'json'
  | 'object'
  | 'array'
  | 'blocks'

  // Relations
  | 'relation'
  | 'reference';

// ============================================
// VALIDATION
// ============================================

export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom' | 'unique';
  value?: any;
  message?: string;
}

// ============================================
// FIELD SCHEMA
// ============================================

export interface FieldSchema {
  // Core properties
  name: string;
  type: FieldType;
  label: string;
  description?: string;
  placeholder?: string;
  helpText?: string;

  // Validation
  required?: boolean;
  unique?: boolean;
  validation?: ValidationRule[];

  // Behavior
  searchable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  readOnly?: boolean;

  // Default value
  defaultValue?: any;
  defaultValueFunction?: string; // Function name to generate default

  // Options (for select, radio, etc.)
  options?: SelectOption[];

  // Relationships
  relationship?: RelationshipConfig;

  // UI hints
  ui?: FieldUIHints;

  // Conditional display
  conditions?: FieldCondition[];

  // Localization
  localized?: boolean;

  // Media specific
  accept?: string; // File types
  maxSize?: number; // Max file size in bytes
  multiple?: boolean;

  // Number specific
  min?: number;
  max?: number;
  step?: number;

  // Text specific
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // Rich text specific
  toolbar?: string[]; // Editor toolbar options

  // Blocks specific
  allowedBlocks?: string[];
  maxBlocks?: number;
}

export interface SelectOption {
  value: string;
  label: string;
  color?: string;
  icon?: string;
  disabled?: boolean;
}

export interface RelationshipConfig {
  collection: string; // Target collection slug
  displayField?: string; // Field to display
  multiple?: boolean;
  searchFields?: string[]; // Fields to search in
  filters?: Record<string, any>; // Pre-filter related items
  cascadeDelete?: boolean;
}

export interface FieldUIHints {
  // Form display
  form?: {
    width?: 'full' | 'half' | 'third' | 'quarter';
    group?: string; // Group fields together
    order?: number;
    showIf?: string; // Conditional display expression
  };

  // List display
  list?: {
    show?: boolean;
    order?: number;
    width?: string;
    align?: 'left' | 'center' | 'right';
    truncate?: boolean;
    render?: string; // Custom render function name
    sortable?: boolean;
  };

  // Component overrides
  component?: string; // Custom component name
  props?: Record<string, any>; // Additional props
}

export interface FieldCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  value: any;
  action: 'show' | 'hide' | 'enable' | 'disable' | 'require';
}

// ============================================
// COLLECTION SCHEMA
// ============================================

export interface CollectionSchema {
  // Identification
  slug: string;
  label: string;
  labelSingular?: string;
  description?: string;
  icon?: string;
  color?: string;

  // Fields
  fields: FieldSchema[];

  // Features
  features?: {
    create?: boolean;
    update?: boolean;
    delete?: boolean;
    publish?: boolean;
    duplicate?: boolean;
    export?: boolean;
    import?: boolean;
    versioning?: boolean;
    trash?: boolean;
    preview?: boolean;
  };

  // Permissions
  permissions?: {
    create?: string[]; // Role names
    read?: string[];
    update?: string[];
    delete?: string[];
    publish?: string[];
  };

  // Behaviors
  singleton?: boolean; // Only one entry allowed
  sortable?: boolean; // Manual sorting
  hierarchical?: boolean; // Parent-child relationships
  timestamped?: boolean; // Auto created_at, updated_at
  softDelete?: boolean; // Use trash instead of hard delete

  // SEO
  seo?: {
    titleField?: string;
    descriptionField?: string;
    imageField?: string;
    urlPattern?: string; // e.g., "/blog/:slug"
  };

  // UI configuration
  ui?: CollectionUIConfig;

  // Hooks
  hooks?: {
    beforeCreate?: string;
    afterCreate?: string;
    beforeUpdate?: string;
    afterUpdate?: string;
    beforeDelete?: string;
    afterDelete?: string;
  };

  // API
  api?: {
    enabled?: boolean;
    endpoint?: string;
    methods?: ('GET' | 'POST' | 'PUT' | 'DELETE')[];
    rateLimit?: number;
  };
}

export interface CollectionUIConfig {
  // List view
  list?: {
    defaultView?: 'table' | 'grid' | 'cards';
    defaultSort?: { field: string; order: 'asc' | 'desc' };
    perPage?: number;
    actions?: string[];
    bulk?: string[];
    search?: boolean;
    filters?: boolean;
    pagination?: boolean;
  };

  // Form view
  form?: {
    layout?: 'single' | 'tabs' | 'steps' | 'accordion';
    sections?: FormSection[];
    submitLabel?: string;
    cancelLabel?: string;
    saveAsDraft?: boolean;
  };

  // Preview
  preview?: {
    enabled?: boolean;
    url?: string; // Preview URL pattern
    openInNewTab?: boolean;
  };
}

export interface FormSection {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  fields: string[]; // Field names
  collapsed?: boolean;
  conditions?: FieldCondition[];
}

// ============================================
// MANIFEST
// ============================================

export interface SchemaManifest {
  // Metadata
  version: string;
  name: string;
  description?: string;
  author?: string;
  license?: string;

  // Collections
  collections: CollectionSchema[];

  // Global settings
  settings?: {
    defaultLocale?: string;
    enabledLocales?: string[];
    timezone?: string;
    dateFormat?: string;
    timeFormat?: string;

    // Features
    features?: {
      ai?: boolean;
      geo?: boolean;
      media?: boolean;
      i18n?: boolean;
      versioning?: boolean;
      webhooks?: boolean;
      audit?: boolean;
      search?: boolean;
      cache?: boolean;
    };

    // Media
    media?: {
      maxFileSize?: number;
      allowedTypes?: string[];
      storage?: 'local' | 'supabase' | 's3' | 'cloudinary';
      transformations?: MediaTransformation[];
    };

    // SEO defaults
    seo?: {
      titleSuffix?: string;
      defaultImage?: string;
      robots?: string;
    };
  };

  // Custom components
  components?: {
    [key: string]: {
      path: string;
      props?: Record<string, any>;
    };
  };

  // Custom validators
  validators?: {
    [key: string]: string; // Function path/name
  };

  // Plugins
  plugins?: PluginConfig[];
}

export interface MediaTransformation {
  name: string;
  type: 'resize' | 'crop' | 'format' | 'quality' | 'watermark';
  params: Record<string, any>;
  applyTo?: string[]; // MIME types
}

export interface PluginConfig {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}

// ============================================
// UI HINTS
// ============================================

export type UIHints = {
  layout?: 'default' | 'compact' | 'comfortable' | 'spacious';
  theme?: 'light' | 'dark' | 'auto';
  accentColor?: string;
  fontFamily?: string;
  borderRadius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  animations?: boolean;
  density?: 'compact' | 'normal' | 'comfortable';
};