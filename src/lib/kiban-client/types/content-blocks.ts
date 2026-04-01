/**
 * Content Block Types - AST Structure
 * AI-friendly JSON structure for content representation
 */

// ============================================
// BLOCK TYPES
// ============================================

export enum BlockType {
  // Text blocks
  HEADING = 'heading',
  PARAGRAPH = 'paragraph',
  QUOTE = 'quote',
  CODE = 'code',

  // Media blocks
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  GALLERY = 'gallery',

  // Interactive blocks
  EMBED = 'embed',
  MAP = 'map',
  FORM = 'form',
  POLL = 'poll',

  // Layout blocks
  COLUMNS = 'columns',
  TABS = 'tabs',
  ACCORDION = 'accordion',
  DIVIDER = 'divider',
  SPACER = 'spacer',

  // Data blocks
  TABLE = 'table',
  CHART = 'chart',
  TIMELINE = 'timeline',

  // Rich blocks
  CALLOUT = 'callout',
  TOGGLE = 'toggle',
  CARD = 'card',
  CTA = 'cta',

  // List blocks
  BULLET_LIST = 'bulletList',
  NUMBERED_LIST = 'numberedList',
  CHECKLIST = 'checklist',

  // AI blocks
  AI_GENERATED = 'aiGenerated',
  AI_SUGGESTION = 'aiSuggestion',

  // Custom
  CUSTOM = 'custom'
}

// ============================================
// BASE BLOCK STRUCTURE
// ============================================

export interface BaseBlock {
  id: string;
  type: BlockType;
  version: number;
  metadata?: BlockMetadata;
  ai?: AIMetadata;
  analytics?: BlockAnalytics;
}

export interface BlockMetadata {
  created_at: string;
  updated_at: string;
  created_by?: string;
  locked?: boolean;
  hidden?: boolean;
  className?: string;
  style?: Record<string, any>;
  attributes?: Record<string, any>;
}

export interface AIMetadata {
  generated?: boolean;
  model?: string;
  prompt?: string;
  confidence?: number;
  suggestions?: string[];
  embedding?: number[];
}

export interface BlockAnalytics {
  views?: number;
  interactions?: number;
  time_spent?: number;
  conversion_rate?: number;
}

// ============================================
// TEXT BLOCKS
// ============================================

export interface HeadingBlock extends BaseBlock {
  type: BlockType.HEADING;
  content: {
    text: string;
    level: 1 | 2 | 3 | 4 | 5 | 6;
    anchor?: string;
  };
}

export interface ParagraphBlock extends BaseBlock {
  type: BlockType.PARAGRAPH;
  content: {
    text: string;
    marks?: TextMark[];
  };
}

export interface TextMark {
  type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'link' | 'highlight';
  from: number;
  to: number;
  attrs?: {
    href?: string;
    target?: string;
    color?: string;
  };
}

export interface QuoteBlock extends BaseBlock {
  type: BlockType.QUOTE;
  content: {
    text: string;
    citation?: string;
    author?: string;
  };
}

export interface CodeBlock extends BaseBlock {
  type: BlockType.CODE;
  content: {
    code: string;
    language: string;
    filename?: string;
    highlights?: number[];
  };
}

// ============================================
// MEDIA BLOCKS
// ============================================

export interface ImageBlock extends BaseBlock {
  type: BlockType.IMAGE;
  content: {
    src: string;
    alt: string;
    caption?: string;
    width?: number;
    height?: number;
    blurhash?: string;
    srcset?: string[];
    focal_point?: { x: number; y: number };
  };
}

export interface VideoBlock extends BaseBlock {
  type: BlockType.VIDEO;
  content: {
    src: string;
    poster?: string;
    caption?: string;
    width?: number;
    height?: number;
    duration?: number;
    autoplay?: boolean;
    loop?: boolean;
    muted?: boolean;
  };
}

export interface GalleryBlock extends BaseBlock {
  type: BlockType.GALLERY;
  content: {
    images: Array<{
      id: string;
      src: string;
      alt: string;
      caption?: string;
      width?: number;
      height?: number;
    }>;
    layout?: 'grid' | 'carousel' | 'masonry';
    columns?: number;
  };
}

// ============================================
// INTERACTIVE BLOCKS
// ============================================

export interface EmbedBlock extends BaseBlock {
  type: BlockType.EMBED;
  content: {
    url: string;
    provider?: string;
    html?: string;
    width?: number;
    height?: number;
    aspectRatio?: string;
  };
}

export interface MapBlock extends BaseBlock {
  type: BlockType.MAP;
  content: {
    center: { lat: number; lng: number };
    zoom?: number;
    markers?: Array<{
      id: string;
      position: { lat: number; lng: number };
      title?: string;
      description?: string;
    }>;
    style?: string;
    interactive?: boolean;
  };
}

export interface FormBlock extends BaseBlock {
  type: BlockType.FORM;
  content: {
    fields: FormField[];
    action?: string;
    method?: 'GET' | 'POST';
    submitLabel?: string;
  };
}

export interface FormField {
  id: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
  };
  options?: Array<{ value: string; label: string }>;
}

// ============================================
// LAYOUT BLOCKS
// ============================================

export interface ColumnsBlock extends BaseBlock {
  type: BlockType.COLUMNS;
  content: {
    columns: Array<{
      id: string;
      width?: string;
      blocks: ContentBlock[];
    }>;
    gap?: number;
    stackOn?: 'mobile' | 'tablet' | 'never';
  };
}

export interface TabsBlock extends BaseBlock {
  type: BlockType.TABS;
  content: {
    tabs: Array<{
      id: string;
      label: string;
      icon?: string;
      blocks: ContentBlock[];
    }>;
    defaultTab?: number;
  };
}

export interface AccordionBlock extends BaseBlock {
  type: BlockType.ACCORDION;
  content: {
    items: Array<{
      id: string;
      title: string;
      blocks: ContentBlock[];
      defaultOpen?: boolean;
    }>;
    allowMultiple?: boolean;
  };
}

// ============================================
// DATA BLOCKS
// ============================================

export interface TableBlock extends BaseBlock {
  type: BlockType.TABLE;
  content: {
    headers: string[];
    rows: Array<Array<string | number | boolean>>;
    footer?: string[];
    sortable?: boolean;
    searchable?: boolean;
  };
}

export interface ChartBlock extends BaseBlock {
  type: BlockType.CHART;
  content: {
    type: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter';
    data: {
      labels: string[];
      datasets: Array<{
        label: string;
        data: number[];
        color?: string;
      }>;
    };
    options?: Record<string, any>;
  };
}

// ============================================
// RICH BLOCKS
// ============================================

export interface CalloutBlock extends BaseBlock {
  type: BlockType.CALLOUT;
  content: {
    type: 'info' | 'warning' | 'error' | 'success' | 'tip';
    title?: string;
    text: string;
    icon?: string;
  };
}

export interface CardBlock extends BaseBlock {
  type: BlockType.CARD;
  content: {
    title?: string;
    subtitle?: string;
    image?: string;
    description?: string;
    actions?: Array<{
      label: string;
      href?: string;
      onClick?: string;
    }>;
  };
}

export interface CTABlock extends BaseBlock {
  type: BlockType.CTA;
  content: {
    title: string;
    description?: string;
    primaryAction: {
      label: string;
      href?: string;
      onClick?: string;
    };
    secondaryAction?: {
      label: string;
      href?: string;
      onClick?: string;
    };
    background?: string;
  };
}

// ============================================
// LIST BLOCKS
// ============================================

export interface ListBlock extends BaseBlock {
  type: BlockType.BULLET_LIST | BlockType.NUMBERED_LIST | BlockType.CHECKLIST;
  content: {
    items: Array<{
      id: string;
      text: string;
      checked?: boolean;
      nested?: ListBlock;
    }>;
  };
}

// ============================================
// AI BLOCKS
// ============================================

export interface AIGeneratedBlock extends BaseBlock {
  type: BlockType.AI_GENERATED;
  content: {
    prompt: string;
    result: ContentBlock[];
    model: string;
    tokens_used: number;
    regeneratable?: boolean;
  };
}

// ============================================
// CUSTOM BLOCK
// ============================================

export interface CustomBlock extends BaseBlock {
  type: BlockType.CUSTOM;
  content: {
    component: string;
    props: Record<string, any>;
  };
}

// ============================================
// UNION TYPE
// ============================================

export type ContentBlock =
  | HeadingBlock
  | ParagraphBlock
  | QuoteBlock
  | CodeBlock
  | ImageBlock
  | VideoBlock
  | GalleryBlock
  | EmbedBlock
  | MapBlock
  | FormBlock
  | ColumnsBlock
  | TabsBlock
  | AccordionBlock
  | TableBlock
  | ChartBlock
  | CalloutBlock
  | CardBlock
  | CTABlock
  | ListBlock
  | AIGeneratedBlock
  | CustomBlock;

// ============================================
// DOCUMENT STRUCTURE
// ============================================

export interface ContentDocument {
  version: number;
  blocks: ContentBlock[];
  metadata?: DocumentMetadata;
}

export interface DocumentMetadata {
  title?: string;
  description?: string;
  author?: string;
  created_at?: string;
  updated_at?: string;
  word_count?: number;
  reading_time?: number;
  language?: string;
}