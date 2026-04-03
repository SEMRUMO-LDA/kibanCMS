/**
 * Add-ons Registry
 * Defines all available add-ons and their capabilities.
 * Each add-on can auto-create collections and has its own config UI.
 */

export interface AddonFieldDef {
  id: string;
  name: string;
  label: string;
  type: string;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  maxLength?: number;
}

export interface AddonCollection {
  name: string;
  slug: string;
  description: string;
  type: 'custom';
  fields: AddonFieldDef[];
}

export interface AddonDefinition {
  id: string;
  name: string;
  description: string;
  longDescription: string;
  icon: string; // lucide icon name
  color: string; // hex accent color
  category: 'marketing' | 'content' | 'commerce' | 'tools';
  version: string;
  author: string;
  collections: AddonCollection[];
  configFields?: AddonFieldDef[];
}

// ============================================
// NEWSLETTER ADD-ON
// ============================================

const newsletter: AddonDefinition = {
  id: 'newsletter',
  name: 'Newsletter',
  description: 'Email subscriber management and campaign tracking',
  longDescription: 'Capture email subscribers from your website, manage subscriber lists, and track newsletter campaigns. Includes embed code generator for signup forms.',
  icon: 'mail',
  color: '#2563eb',
  category: 'marketing',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Newsletter Subscribers',
      slug: 'newsletter-subscribers',
      description: 'Email subscribers captured from your website',
      type: 'custom',
      fields: [
        { id: 'email', name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'subscriber@example.com' },
        { id: 'name', name: 'name', label: 'Name', type: 'text', placeholder: 'Subscriber name' },
        { id: 'source', name: 'source', label: 'Source', type: 'text', helpText: 'Where did they subscribe from?', placeholder: 'homepage, blog, footer' },
        { id: 'subscribed_at', name: 'subscribed_at', label: 'Subscribed At', type: 'date', required: true },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean' },
        { id: 'tags', name: 'tags', label: 'Tags', type: 'text', placeholder: 'vip, early-adopter' },
      ],
    },
    {
      name: 'Newsletter Campaigns',
      slug: 'newsletter-campaigns',
      description: 'Track newsletter campaigns and their performance',
      type: 'custom',
      fields: [
        { id: 'subject', name: 'subject', label: 'Subject Line', type: 'text', required: true, maxLength: 200 },
        { id: 'content', name: 'content', label: 'Email Content', type: 'richtext', required: true },
        { id: 'sent_at', name: 'sent_at', label: 'Sent At', type: 'date' },
        { id: 'recipients', name: 'recipients', label: 'Recipients Count', type: 'number' },
        { id: 'open_rate', name: 'open_rate', label: 'Open Rate (%)', type: 'number' },
        { id: 'click_rate', name: 'click_rate', label: 'Click Rate (%)', type: 'number' },
      ],
    },
  ],
};

// ============================================
// SEO ADD-ON
// ============================================

const seo: AddonDefinition = {
  id: 'seo',
  name: 'SEO',
  description: 'Search engine optimization tools and meta management',
  longDescription: 'Automatically add SEO fields to all your entries — meta title, description, Open Graph tags, and canonical URLs. Includes sitemap generation hints and structured data support.',
  icon: 'search',
  color: '#16a34a',
  category: 'tools',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'SEO Settings',
      slug: 'seo-settings',
      description: 'Global SEO configuration and defaults',
      type: 'custom',
      fields: [
        { id: 'site_title', name: 'site_title', label: 'Site Title', type: 'text', required: true, maxLength: 60, helpText: 'Default title tag for your site' },
        { id: 'site_description', name: 'site_description', label: 'Site Description', type: 'textarea', maxLength: 160, helpText: 'Default meta description' },
        { id: 'og_image', name: 'og_image', label: 'Default OG Image', type: 'image', helpText: 'Default social media share image' },
        { id: 'favicon_url', name: 'favicon_url', label: 'Favicon URL', type: 'url', placeholder: 'https://example.com/favicon.ico' },
        { id: 'robots_txt', name: 'robots_txt', label: 'robots.txt Content', type: 'textarea', placeholder: 'User-agent: *\nAllow: /' },
        { id: 'google_analytics', name: 'google_analytics', label: 'Google Analytics ID', type: 'text', placeholder: 'G-XXXXXXXXXX' },
        { id: 'structured_data', name: 'structured_data', label: 'JSON-LD Schema', type: 'textarea', helpText: 'Global structured data (JSON-LD format)' },
      ],
    },
  ],
};

// ============================================
// FORMS ADD-ON
// ============================================

const forms: AddonDefinition = {
  id: 'forms',
  name: 'Forms',
  description: 'Contact forms, surveys, and submission management',
  longDescription: 'Create custom forms for contact pages, surveys, and feedback collection. All submissions are stored in your CMS and accessible via API. Includes embed code for any website.',
  icon: 'file-input',
  color: '#9333ea',
  category: 'content',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Form Submissions',
      slug: 'form-submissions',
      description: 'Incoming form submissions from your website',
      type: 'custom',
      fields: [
        { id: 'form_name', name: 'form_name', label: 'Form Name', type: 'text', required: true, helpText: 'Which form was submitted (contact, feedback, etc.)' },
        { id: 'name', name: 'name', label: 'Name', type: 'text' },
        { id: 'email', name: 'email', label: 'Email', type: 'email', required: true },
        { id: 'phone', name: 'phone', label: 'Phone', type: 'text' },
        { id: 'subject', name: 'subject', label: 'Subject', type: 'text' },
        { id: 'message', name: 'message', label: 'Message', type: 'textarea', required: true },
        { id: 'submitted_at', name: 'submitted_at', label: 'Submitted At', type: 'date', required: true },
        { id: 'is_read', name: 'is_read', label: 'Read', type: 'boolean' },
        { id: 'source_url', name: 'source_url', label: 'Source Page', type: 'url', helpText: 'Page where the form was submitted from' },
      ],
    },
  ],
};

// ============================================
// BOOKINGS ADD-ON
// ============================================

const bookings: AddonDefinition = {
  id: 'bookings',
  name: 'Bookings',
  description: 'Reservation and appointment scheduling system',
  longDescription: 'Manage bookings, appointments, and reservations. Perfect for restaurants, clinics, salons, and service businesses. Includes time slots, status tracking, and customer info.',
  icon: 'calendar-check',
  color: '#ea580c',
  category: 'commerce',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Bookings',
      slug: 'bookings',
      description: 'Customer reservations and appointments',
      type: 'custom',
      fields: [
        { id: 'customer_name', name: 'customer_name', label: 'Customer Name', type: 'text', required: true },
        { id: 'customer_email', name: 'customer_email', label: 'Customer Email', type: 'email', required: true },
        { id: 'customer_phone', name: 'customer_phone', label: 'Customer Phone', type: 'text', required: true },
        { id: 'service', name: 'service', label: 'Service / Type', type: 'text', required: true, helpText: 'What is being booked?', placeholder: 'Haircut, Consultation, Table for 4' },
        { id: 'date', name: 'date', label: 'Date', type: 'date', required: true },
        { id: 'time_slot', name: 'time_slot', label: 'Time Slot', type: 'text', required: true, placeholder: '14:00 - 15:00' },
        { id: 'duration_minutes', name: 'duration_minutes', label: 'Duration (min)', type: 'number' },
        { id: 'guests', name: 'guests', label: 'Number of Guests', type: 'number' },
        { id: 'notes', name: 'notes', label: 'Notes', type: 'textarea', helpText: 'Special requests or instructions' },
        { id: 'booking_status', name: 'booking_status', label: 'Status', type: 'select', required: true },
        { id: 'confirmed_at', name: 'confirmed_at', label: 'Confirmed At', type: 'date' },
      ],
    },
    {
      name: 'Services',
      slug: 'booking-services',
      description: 'Available services and their details',
      type: 'custom',
      fields: [
        { id: 'service_name', name: 'service_name', label: 'Service Name', type: 'text', required: true },
        { id: 'description', name: 'description', label: 'Description', type: 'textarea' },
        { id: 'duration_minutes', name: 'duration_minutes', label: 'Duration (min)', type: 'number', required: true },
        { id: 'price', name: 'price', label: 'Price', type: 'number' },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', placeholder: 'EUR' },
        { id: 'is_available', name: 'is_available', label: 'Available', type: 'boolean' },
        { id: 'image', name: 'image', label: 'Image', type: 'image' },
      ],
    },
  ],
};

// ============================================
// REGISTRY
// ============================================

export const ADDONS_REGISTRY: AddonDefinition[] = [
  newsletter,
  seo,
  forms,
  bookings,
];

export function getAddon(id: string): AddonDefinition | undefined {
  return ADDONS_REGISTRY.find(a => a.id === id);
}
