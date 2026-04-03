/**
 * Collection Presets
 * Pre-configured collection templates for different use cases
 */

export interface CollectionPreset {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  type: 'post' | 'page' | 'custom';
  category: 'content' | 'commerce' | 'marketing' | 'portfolio';
  fields: any[];
}

export const COLLECTION_PRESETS: CollectionPreset[] = [
  // ========================================
  // CONTENT PRESETS
  // ========================================
  {
    id: 'blog-posts',
    name: 'Blog Posts',
    slug: 'blog',
    description: 'Articles, news, and blog content',
    icon: 'file-text',
    color: 'blue',
    type: 'post',
    category: 'content',
    fields: [
      {
        id: 'title',
        name: 'Title',
        type: 'text',
        required: true,
        maxLength: 200,
      },
      {
        id: 'slug',
        name: 'Slug',
        type: 'text',
        required: true,
        maxLength: 200,
        helpText: 'URL-friendly identifier',
      },
      {
        id: 'excerpt',
        name: 'Excerpt',
        type: 'textarea',
        required: false,
        maxLength: 500,
        helpText: 'Short summary for previews',
      },
      {
        id: 'body',
        name: 'Body Content',
        type: 'richtext',
        required: true,
        helpText: 'Main article content (Markdown supported)',
      },
      {
        id: 'featured_image',
        name: 'Featured Image',
        type: 'image',
        required: false,
      },
      {
        id: 'author',
        name: 'Author Name',
        type: 'text',
        required: false,
      },
      {
        id: 'published_date',
        name: 'Published Date',
        type: 'date',
        required: false,
      },
    ],
  },

  {
    id: 'pages',
    name: 'Pages',
    slug: 'pages',
    description: 'Static pages (About, Contact, etc)',
    icon: 'file',
    color: 'gray',
    type: 'page',
    category: 'content',
    fields: [
      {
        id: 'title',
        name: 'Page Title',
        type: 'text',
        required: true,
        maxLength: 200,
      },
      {
        id: 'slug',
        name: 'Slug',
        type: 'text',
        required: true,
        maxLength: 200,
      },
      {
        id: 'content',
        name: 'Content',
        type: 'richtext',
        required: true,
      },
      {
        id: 'seo_title',
        name: 'SEO Title',
        type: 'text',
        required: false,
        maxLength: 60,
      },
      {
        id: 'seo_description',
        name: 'SEO Description',
        type: 'textarea',
        required: false,
        maxLength: 160,
      },
    ],
  },

  // ========================================
  // PORTFOLIO PRESETS
  // ========================================
  {
    id: 'portfolio-projects',
    name: 'Portfolio Projects',
    slug: 'projects',
    description: 'Showcase your work and case studies',
    icon: 'briefcase',
    color: 'purple',
    type: 'custom',
    category: 'portfolio',
    fields: [
      {
        id: 'title',
        name: 'Project Title',
        type: 'text',
        required: true,
        maxLength: 200,
      },
      {
        id: 'slug',
        name: 'Slug',
        type: 'text',
        required: true,
        maxLength: 200,
      },
      {
        id: 'client',
        name: 'Client Name',
        type: 'text',
        required: false,
      },
      {
        id: 'description',
        name: 'Description',
        type: 'richtext',
        required: true,
      },
      {
        id: 'thumbnail',
        name: 'Thumbnail',
        type: 'image',
        required: false,
      },
      {
        id: 'year',
        name: 'Year',
        type: 'number',
        required: false,
        min: 2000,
        max: 2100,
      },
      {
        id: 'featured',
        name: 'Featured Project',
        type: 'boolean',
        required: false,
        helpText: 'Show on homepage',
      },
      {
        id: 'tags',
        name: 'Tags',
        type: 'text',
        required: false,
        helpText: 'Comma-separated tags',
      },
    ],
  },

  // ========================================
  // MARKETING PRESETS
  // ========================================
  {
    id: 'testimonials',
    name: 'Testimonials',
    slug: 'testimonials',
    description: 'Customer reviews and feedback',
    icon: 'quote',
    color: 'green',
    type: 'custom',
    category: 'marketing',
    fields: [
      {
        id: 'author_name',
        name: 'Author Name',
        type: 'text',
        required: true,
      },
      {
        id: 'author_role',
        name: 'Author Role',
        type: 'text',
        required: false,
        helpText: 'e.g., "CEO at Company"',
      },
      {
        id: 'author_photo',
        name: 'Author Photo',
        type: 'image',
        required: false,
      },
      {
        id: 'testimonial',
        name: 'Testimonial',
        type: 'textarea',
        required: true,
        maxLength: 500,
      },
      {
        id: 'rating',
        name: 'Rating',
        type: 'number',
        required: false,
        min: 1,
        max: 5,
        helpText: 'Rating out of 5',
      },
      {
        id: 'featured',
        name: 'Featured',
        type: 'boolean',
        required: false,
      },
    ],
  },

  {
    id: 'team-members',
    name: 'Team Members',
    slug: 'team',
    description: 'Your team and staff profiles',
    icon: 'users',
    color: 'orange',
    type: 'custom',
    category: 'marketing',
    fields: [
      {
        id: 'name',
        name: 'Full Name',
        type: 'text',
        required: true,
      },
      {
        id: 'role',
        name: 'Role/Position',
        type: 'text',
        required: true,
      },
      {
        id: 'photo',
        name: 'Photo',
        type: 'image',
        required: false,
      },
      {
        id: 'bio',
        name: 'Biography',
        type: 'textarea',
        required: false,
        maxLength: 500,
      },
      {
        id: 'email',
        name: 'Email',
        type: 'text',
        required: false,
      },
      {
        id: 'linkedin',
        name: 'LinkedIn URL',
        type: 'text',
        required: false,
      },
      {
        id: 'order',
        name: 'Display Order',
        type: 'number',
        required: false,
        helpText: 'Lower numbers appear first',
      },
    ],
  },

  // ========================================
  // COMMERCE PRESETS
  // ========================================
  {
    id: 'products',
    name: 'Products',
    slug: 'products',
    description: 'Product catalog and inventory',
    icon: 'package',
    color: 'red',
    type: 'custom',
    category: 'commerce',
    fields: [
      {
        id: 'name',
        name: 'Product Name',
        type: 'text',
        required: true,
        maxLength: 200,
      },
      {
        id: 'slug',
        name: 'Slug',
        type: 'text',
        required: true,
      },
      {
        id: 'description',
        name: 'Description',
        type: 'richtext',
        required: true,
      },
      {
        id: 'price',
        name: 'Price',
        type: 'number',
        required: true,
        min: 0,
        helpText: 'Price in your currency',
      },
      {
        id: 'image',
        name: 'Product Image',
        type: 'image',
        required: false,
      },
      {
        id: 'in_stock',
        name: 'In Stock',
        type: 'boolean',
        required: false,
      },
      {
        id: 'featured',
        name: 'Featured Product',
        type: 'boolean',
        required: false,
      },
    ],
  },

  {
    id: 'events',
    name: 'Events',
    slug: 'events',
    description: 'Upcoming events and calendar',
    icon: 'calendar',
    color: 'pink',
    type: 'custom',
    category: 'marketing',
    fields: [
      {
        id: 'title',
        name: 'Event Title',
        type: 'text',
        required: true,
      },
      {
        id: 'slug',
        name: 'Slug',
        type: 'text',
        required: true,
      },
      {
        id: 'description',
        name: 'Description',
        type: 'richtext',
        required: true,
      },
      {
        id: 'date',
        name: 'Event Date',
        type: 'date',
        required: true,
      },
      {
        id: 'location',
        name: 'Location',
        type: 'text',
        required: false,
      },
      {
        id: 'image',
        name: 'Event Image',
        type: 'image',
        required: false,
      },
      {
        id: 'registration_url',
        name: 'Registration URL',
        type: 'text',
        required: false,
      },
    ],
  },
];

// Helper to get presets by category
export function getPresetsByCategory(category: CollectionPreset['category']) {
  return COLLECTION_PRESETS.filter((preset) => preset.category === category);
}

// Helper to get preset by ID
export function getPresetById(id: string) {
  return COLLECTION_PRESETS.find((preset) => preset.id === id);
}
