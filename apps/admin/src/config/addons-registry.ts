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
  description: 'Contact forms, leads, and email notifications via webhook',
  longDescription: 'Receive form submissions from any frontend via API. Leads are stored in the CMS and can trigger email notifications through webhooks (Resend, Mailgun, Zapier, Make). Includes ready-to-use integration snippets.',
  icon: 'file-input',
  color: '#9333ea',
  category: 'content',
  version: '2.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Form Submissions',
      slug: 'form-submissions',
      description: 'Incoming form submissions and leads from your websites',
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
    {
      name: 'Forms Config',
      slug: 'forms-config',
      description: 'Email notification settings per form',
      type: 'custom',
      fields: [
        { id: 'form_name', name: 'form_name', label: 'Form Name', type: 'text', required: true, helpText: 'Must match the form_name sent from the frontend (e.g. "contact")' },
        { id: 'notification_emails', name: 'notification_emails', label: 'Notification Emails', type: 'text', required: true, helpText: 'Comma-separated emails to receive notifications' },
        { id: 'email_subject_template', name: 'email_subject_template', label: 'Email Subject', type: 'text', placeholder: 'New {form_name} from {name}', helpText: 'Variables: {form_name}, {name}, {email}, {subject}' },
        { id: 'webhook_url', name: 'webhook_url', label: 'Webhook URL', type: 'url', helpText: 'External webhook for email dispatch (Resend, Zapier, Make, etc.)' },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean', helpText: 'Enable/disable notifications for this form' },
        { id: 'auto_reply', name: 'auto_reply', label: 'Auto-reply Message', type: 'textarea', helpText: 'Optional message sent to the person who submitted the form' },
      ],
    },
  ],
  configFields: [
    { id: 'default_notification_email', name: 'default_notification_email', label: 'Default Notification Email', type: 'email', helpText: 'Fallback email for forms without specific config' },
    { id: 'webhook_url', name: 'webhook_url', label: 'Global Webhook URL', type: 'url', helpText: 'Webhook called on every form submission (e.g. Zapier, Make, Resend)' },
    { id: 'webhook_secret', name: 'webhook_secret', label: 'Webhook Secret', type: 'text', helpText: 'HMAC secret for verifying webhook authenticity' },
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
// REDIRECTS ADD-ON
// ============================================

const redirects: AddonDefinition = {
  id: 'redirects',
  name: 'Redirects Manager',
  description: 'URL redirect rules for SEO migration and broken link management',
  longDescription: 'Manage 301/302 redirects with a simple table interface. Essential for site migrations to preserve SEO rankings. Clients can add redirect rules without touching server config.',
  icon: 'arrow-right',
  color: '#059669',
  category: 'tools',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Redirects',
      slug: 'redirects',
      description: 'URL redirect rules (301/302)',
      type: 'custom',
      fields: [
        { id: 'from_path', name: 'from_path', label: 'From Path', type: 'text', required: true, placeholder: '/old-page', helpText: 'The old URL path (without domain)' },
        { id: 'to_path', name: 'to_path', label: 'To Path', type: 'text', required: true, placeholder: '/new-page', helpText: 'The new URL path or full URL' },
        { id: 'type', name: 'type', label: 'Redirect Type', type: 'select', required: true },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean' },
        { id: 'notes', name: 'notes', label: 'Notes', type: 'text', placeholder: 'Reason for redirect' },
        { id: 'hit_count', name: 'hit_count', label: 'Hit Count', type: 'number' },
      ],
    },
  ],
};

// ============================================
// WEBHOOKS VISUAL ADD-ON
// ============================================

const webhooksVisual: AddonDefinition = {
  id: 'webhooks-visual',
  name: 'Automations',
  description: 'Visual no-code webhook and automation builder',
  longDescription: 'Create automations without code: "When a form is submitted → Send to Zapier/Make". Visual interface for connecting your CMS to external services like Mailchimp, Slack, and custom webhooks.',
  icon: 'zap',
  color: '#8b5cf6',
  category: 'tools',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Automations',
      slug: 'automations',
      description: 'Visual automation rules',
      type: 'custom',
      fields: [
        { id: 'name', name: 'name', label: 'Automation Name', type: 'text', required: true, placeholder: 'New form → Mailchimp' },
        { id: 'trigger_event', name: 'trigger_event', label: 'Trigger Event', type: 'select', required: true },
        { id: 'trigger_collection', name: 'trigger_collection', label: 'Trigger Collection', type: 'text', placeholder: 'form-submissions' },
        { id: 'webhook_url', name: 'webhook_url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.zapier.com/...' },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean' },
        { id: 'last_triggered', name: 'last_triggered', label: 'Last Triggered', type: 'date' },
        { id: 'total_runs', name: 'total_runs', label: 'Total Runs', type: 'number' },
        { id: 'last_error', name: 'last_error', label: 'Last Error', type: 'text' },
      ],
    },
  ],
};

// ============================================
// AI CONTENT ASSISTANT ADD-ON
// ============================================

const aiContent: AddonDefinition = {
  id: 'ai-content',
  name: 'AI Content Assistant',
  description: 'AI-powered content tools: alt-text, translation, tone adjustment',
  longDescription: 'Boost editor productivity with AI tools integrated directly into the content editor. Generate image alt-text automatically, translate entries between languages, and adjust text tone with one click.',
  icon: 'sparkles',
  color: '#f59e0b',
  category: 'tools',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [], // No collections needed — features are integrated into the editor
};

// ============================================
// STRIPE PAYMENTS ADD-ON
// ============================================

const stripePayments: AddonDefinition = {
  id: 'stripe-payments',
  name: 'Stripe Payments',
  description: 'Accept payments via Stripe Checkout with transaction tracking',
  longDescription: 'Accept one-time payments from any frontend using Stripe Checkout. Customers are redirected to a secure Stripe-hosted page — zero PCI complexity. All transactions are logged in the CMS. Includes Apple Pay, Google Pay, and 3D Secure out of the box.',
  icon: 'credit-card',
  color: '#635BFF',
  category: 'commerce',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Stripe Transactions',
      slug: 'stripe-transactions',
      description: 'Payment transactions processed through Stripe',
      type: 'custom',
      fields: [
        { id: 'stripe_session_id', name: 'stripe_session_id', label: 'Session ID', type: 'text', required: true },
        { id: 'stripe_payment_intent', name: 'stripe_payment_intent', label: 'Payment Intent', type: 'text' },
        { id: 'amount', name: 'amount', label: 'Amount (cents)', type: 'number', required: true },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', required: true, placeholder: 'eur' },
        { id: 'payment_status', name: 'payment_status', label: 'Status', type: 'text', required: true, helpText: 'paid, unpaid, expired, refunded' },
        { id: 'customer_email', name: 'customer_email', label: 'Customer Email', type: 'email' },
        { id: 'customer_name', name: 'customer_name', label: 'Customer Name', type: 'text' },
        { id: 'product_name', name: 'product_name', label: 'Product / Description', type: 'text' },
        { id: 'metadata', name: 'metadata', label: 'Metadata', type: 'textarea', helpText: 'Custom data sent from the frontend (JSON)' },
        { id: 'paid_at', name: 'paid_at', label: 'Paid At', type: 'date' },
      ],
    },
    {
      name: 'Stripe Products',
      slug: 'stripe-products',
      description: 'Products and services available for purchase',
      type: 'custom',
      fields: [
        { id: 'product_name', name: 'product_name', label: 'Product Name', type: 'text', required: true },
        { id: 'description', name: 'description', label: 'Description', type: 'textarea' },
        { id: 'price', name: 'price', label: 'Price (cents)', type: 'number', required: true, helpText: 'Amount in cents (e.g. 2500 = 25.00 EUR)' },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', required: true, placeholder: 'eur' },
        { id: 'image_url', name: 'image_url', label: 'Product Image URL', type: 'url' },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean', helpText: 'Only active products can be purchased' },
      ],
    },
  ],
  configFields: [
    { id: 'stripe_publishable_key', name: 'stripe_publishable_key', label: 'Publishable Key', type: 'text', required: true, helpText: 'Starts with pk_live_ or pk_test_' },
    { id: 'stripe_webhook_secret', name: 'stripe_webhook_secret', label: 'Webhook Signing Secret', type: 'text', helpText: 'Starts with whsec_ — from Stripe Dashboard > Webhooks' },
    { id: 'default_currency', name: 'default_currency', label: 'Default Currency', type: 'text', placeholder: 'eur', helpText: 'ISO 4217 code (eur, usd, gbp)' },
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
  redirects,
  webhooksVisual,
  aiContent,
  stripePayments,
];

export function getAddon(id: string): AddonDefinition | undefined {
  return ADDONS_REGISTRY.find(a => a.id === id);
}
