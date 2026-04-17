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
  /** Predefined options for select / multiselect fields. */
  options?: Array<{ label: string; value: string }>;
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
  category: 'marketing' | 'content' | 'commerce' | 'tools' | 'compliance';
  version: string;
  author: string;
  collections: AddonCollection[];
  configFields?: AddonFieldDef[];
  /** Route path for addons with dedicated settings pages (no collections) */
  settingsRoute?: string;
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
  name: 'SEO & Analytics',
  description: 'Complete SEO, Open Graph, analytics, and indexing management',
  longDescription: 'Manage all SEO settings from one place: meta tags, Open Graph for social sharing, Twitter Cards, favicon, robots.txt, sitemap, Google Analytics, Tag Manager, and structured data (JSON-LD). Everything a frontend needs to rank well and look great when shared.',
  icon: 'search',
  color: '#16a34a',
  category: 'tools',
  version: '2.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'SEO Settings',
      slug: 'seo-settings',
      description: 'Global SEO, Open Graph, analytics, and indexing configuration',
      type: 'custom',
      fields: [
        // Meta Tags
        { id: 'meta_title', name: 'meta_title', label: 'Meta Title', type: 'text', required: true, maxLength: 60, helpText: 'Default <title> tag (max 60 chars)' },
        { id: 'meta_description', name: 'meta_description', label: 'Meta Description', type: 'textarea', maxLength: 160, helpText: 'Default meta description (max 160 chars)' },
        { id: 'favicon_url', name: 'favicon_url', label: 'Favicon URL', type: 'url', placeholder: 'https://example.com/favicon.ico' },
        { id: 'canonical_url', name: 'canonical_url', label: 'Canonical URL', type: 'url', helpText: 'Default canonical URL (usually your domain)' },
        // Open Graph
        { id: 'og_title', name: 'og_title', label: 'OG Title', type: 'text', helpText: 'Title for social sharing (falls back to Meta Title)' },
        { id: 'og_description', name: 'og_description', label: 'OG Description', type: 'textarea', helpText: 'Description for social sharing (falls back to Meta Description)' },
        { id: 'og_image', name: 'og_image', label: 'OG Image', type: 'image', helpText: 'Social share image — 1200x630px recommended' },
        { id: 'og_type', name: 'og_type', label: 'OG Type', type: 'text', placeholder: 'website', helpText: 'website, article, product, etc.' },
        // Twitter Card
        { id: 'twitter_card', name: 'twitter_card', label: 'Twitter Card Type', type: 'text', placeholder: 'summary_large_image', helpText: 'summary, summary_large_image, app, player' },
        { id: 'twitter_handle', name: 'twitter_handle', label: 'Twitter Handle', type: 'text', placeholder: '@yoursite' },
        // Analytics
        { id: 'google_analytics', name: 'google_analytics', label: 'Google Analytics ID', type: 'text', placeholder: 'G-XXXXXXXXXX' },
        { id: 'google_tag_manager', name: 'google_tag_manager', label: 'Google Tag Manager', type: 'text', placeholder: 'GTM-XXXXXXX' },
        { id: 'facebook_pixel', name: 'facebook_pixel', label: 'Facebook Pixel ID', type: 'text', placeholder: '1234567890' },
        // Indexing
        { id: 'robots_txt', name: 'robots_txt', label: 'robots.txt', type: 'textarea', placeholder: 'User-agent: *\nAllow: /', helpText: 'Controls search engine crawling' },
        { id: 'noindex_default', name: 'noindex_default', label: 'No-index by Default', type: 'boolean', helpText: 'Block search engines from indexing (useful for staging)' },
        // Structured Data
        { id: 'structured_data', name: 'structured_data', label: 'JSON-LD Schema', type: 'textarea', helpText: 'Global structured data in JSON-LD format' },
        // Sitemap & Multilingual
        { id: 'sitemap_url', name: 'sitemap_url', label: 'Sitemap URL', type: 'url', placeholder: 'https://example.com/sitemap.xml', helpText: 'URL of the XML sitemap for search engines' },
        { id: 'hreflang', name: 'hreflang', label: 'Hreflang Tags', type: 'textarea', helpText: 'One per line: lang|url (e.g. pt|https://example.pt, en|https://example.com)' },
        // Domain Verification
        { id: 'google_site_verification', name: 'google_site_verification', label: 'Google Search Console', type: 'text', placeholder: 'google-site-verification=xxx', helpText: 'Verification meta tag content from Google Search Console' },
        { id: 'bing_site_verification', name: 'bing_site_verification', label: 'Bing Webmaster', type: 'text', placeholder: 'msvalidate.01=xxx', helpText: 'Verification meta tag content from Bing Webmaster Tools' },
        { id: 'pinterest_verification', name: 'pinterest_verification', label: 'Pinterest', type: 'text', helpText: 'Pinterest domain verification code' },
        // Custom Code
        { id: 'custom_head_code', name: 'custom_head_code', label: 'Custom Head Code', type: 'textarea', helpText: 'Injected before </head> — scripts, meta tags, etc.' },
        { id: 'custom_body_code', name: 'custom_body_code', label: 'Custom Body Code', type: 'textarea', helpText: 'Injected before </body> — tracking scripts, chat widgets, etc.' },
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
// BOOKINGS ADD-ON (generic — any scheduled resource)
// ============================================

const bookings: AddonDefinition = {
  id: 'bookings',
  name: 'Bookings',
  description: 'Generic booking system for any scheduled resource — appointments, classes, rentals, services',
  longDescription: 'Schedule any resource: hairdresser slots, dentist appointments, equipment rentals, consulting sessions, meeting rooms. Supports both weekly recurring schedules (with buffer time) and fixed daily time slots. Online payment via Stripe Checkout. For tours with rich content (itinerary, meeting points, inclusions), install the Tours add-on alongside.',
  icon: 'calendar-check',
  color: '#ea580c',
  category: 'commerce',
  version: '3.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Bookable Resources',
      slug: 'bookable-resources',
      description: 'Services, appointments, classes, or equipment that customers can book',
      type: 'custom',
      fields: [
        { id: 'title', name: 'title', label: 'Resource Name', type: 'text', required: true, placeholder: 'Hair cut, Kayak rental, Consultation' },
        { id: 'description', name: 'description', label: 'Description', type: 'richtext' },
        { id: 'image', name: 'image', label: 'Cover Image', type: 'image' },
        { id: 'duration_minutes', name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', required: true, placeholder: '60' },
        { id: 'capacity', name: 'capacity', label: 'Capacity per Slot', type: 'number', required: true, helpText: '1 for 1-on-1 appointments, higher for group activities', placeholder: '1' },
        { id: 'price', name: 'price', label: 'Price', type: 'number', required: true, placeholder: '35', helpText: 'Price per booking in currency units' },
        { id: 'price_secondary', name: 'price_secondary', label: 'Secondary Price', type: 'number', helpText: 'Optional — e.g. child price for group activities' },
        { id: 'price_secondary_label', name: 'price_secondary_label', label: 'Secondary Price Label', type: 'text', placeholder: 'Child (4–12 years)' },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', placeholder: 'eur', helpText: 'ISO 4217 code (eur, usd, gbp)' },
        { id: 'schedule_type', name: 'schedule_type', label: 'Schedule Type', type: 'select', required: true, helpText: 'recurring = weekly hours (e.g. Mon-Fri 9-18). fixed_slots = fixed daily times (e.g. 10:00, 14:00, 17:00)' },
        { id: 'weekly_schedule', name: 'weekly_schedule', label: 'Weekly Schedule', type: 'weekly_schedule', helpText: 'Used when schedule_type=recurring. Set open windows per day of week.' },
        { id: 'slot_interval_minutes', name: 'slot_interval_minutes', label: 'Slot Interval (minutes)', type: 'number', helpText: 'Used with recurring. Gap between generated slots (e.g. 30 = slots every 30 min)', placeholder: '30' },
        { id: 'fixed_slots', name: 'fixed_slots', label: 'Fixed Time Slots', type: 'fixed_slots', helpText: 'Used when schedule_type=fixed_slots. Add each daily start time.' },
        { id: 'buffer_minutes', name: 'buffer_minutes', label: 'Buffer Between Bookings (minutes)', type: 'number', helpText: 'Cleanup/reset gap after each booking', placeholder: '0' },
        { id: 'booking_window_days', name: 'booking_window_days', label: 'Booking Window (days)', type: 'number', helpText: 'How far ahead customers can book', placeholder: '60' },
        { id: 'min_notice_hours', name: 'min_notice_hours', label: 'Minimum Notice (hours)', type: 'number', helpText: 'Minimum advance notice required', placeholder: '2' },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean', helpText: 'Inactive resources cannot be booked' },
      ],
    },
    {
      name: 'Bookings',
      slug: 'bookings',
      description: 'Customer bookings with payment status tracking',
      type: 'custom',
      fields: [
        { id: 'customer_name', name: 'customer_name', label: 'Customer Name', type: 'text', required: true },
        { id: 'customer_email', name: 'customer_email', label: 'Customer Email', type: 'email', required: true },
        { id: 'customer_phone', name: 'customer_phone', label: 'Customer Phone', type: 'text' },
        { id: 'resource_slug', name: 'resource_slug', label: 'Resource', type: 'text', required: true, helpText: 'Slug of the booked resource' },
        { id: 'resource_title', name: 'resource_title', label: 'Resource Name', type: 'text', helpText: 'Denormalized for display' },
        { id: 'date', name: 'date', label: 'Date', type: 'date', required: true },
        { id: 'time_slot', name: 'time_slot', label: 'Time', type: 'text', required: true, placeholder: '14:00' },
        { id: 'party_size', name: 'party_size', label: 'Party Size', type: 'number', required: true, helpText: 'Primary participants (e.g. adults)' },
        { id: 'party_size_secondary', name: 'party_size_secondary', label: 'Secondary Party', type: 'number', helpText: 'E.g. children' },
        { id: 'total_participants', name: 'total_participants', label: 'Total Participants', type: 'number' },
        { id: 'amount', name: 'amount', label: 'Amount (cents)', type: 'number' },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', placeholder: 'eur' },
        { id: 'booking_status', name: 'booking_status', label: 'Status', type: 'select', required: true, helpText: 'pending, confirmed, cancelled, refunded' },
        { id: 'stripe_session_id', name: 'stripe_session_id', label: 'Stripe Session', type: 'text' },
        { id: 'source', name: 'source', label: 'Source', type: 'text', helpText: 'Origin: direct, tours-addon, import' },
        { id: 'metadata', name: 'metadata', label: 'Metadata (JSON)', type: 'textarea', helpText: 'Extra data from integrating addons (e.g. tour_id). JSON object.' },
        { id: 'notes', name: 'notes', label: 'Notes', type: 'textarea' },
        { id: 'confirmed_at', name: 'confirmed_at', label: 'Confirmed At', type: 'date' },
        { id: 'cancelled_at', name: 'cancelled_at', label: 'Cancelled At', type: 'date' },
      ],
    },
  ],
};

// ============================================
// TOURS ADD-ON (rich tour schema — extends Bookings)
// ============================================

const tours: AddonDefinition = {
  id: 'tours',
  name: 'Tours',
  description: 'Rich tour management for tour operators — itinerary, meeting points, pricing, policies',
  longDescription: 'Built on top of the Bookings add-on. Provides a complete TripAdvisor-style tour schema: itinerary stops, meeting points, inclusions/exclusions, accessibility info, cancellation tiers, languages, age limits, media gallery, highlights, and FAQ. Each published tour is automatically mirrored to a bookable resource so customers can book via Stripe Checkout. Requires the Bookings and Stripe Payments add-ons.',
  icon: 'map',
  color: '#0891b2',
  category: 'commerce',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Tours',
      slug: 'tours',
      description: 'Tour experiences with rich content. Auto-syncs to a bookable resource on publish.',
      type: 'custom',
      fields: [
        // Basic info
        { id: 'title', name: 'title', label: 'Tour Name', type: 'text', required: true, placeholder: 'Benagil Cave & Coast Tour' },
        { id: 'subtitle', name: 'subtitle', label: 'Subtitle', type: 'text', placeholder: '5-hour guided walking tour' },
        { id: 'short_description', name: 'short_description', label: 'Short Description', type: 'textarea', maxLength: 250, helpText: 'Used in listings and cards' },
        { id: 'full_description', name: 'full_description', label: 'Full Description', type: 'richtext', required: true },
        { id: 'product_code', name: 'product_code', label: 'Product Code', type: 'text', helpText: 'Internal reference (e.g. 404454P3)' },
        // Categorization
        { id: 'tour_type', name: 'tour_type', label: 'Tour Type', type: 'select', required: true, helpText: 'walking, boat, kayak, bus, private, coasteering, tuktuk, safari, tasting' },
        { id: 'categories', name: 'categories', label: 'Categories', type: 'textarea', helpText: 'One per line: nature, adventure, coastal, cultural, family, romantic' },
        { id: 'difficulty_level', name: 'difficulty_level', label: 'Difficulty', type: 'select', helpText: 'easy, moderate, challenging, extreme' },
        // Capacity & duration
        { id: 'duration_minutes', name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', required: true, placeholder: '300' },
        { id: 'capacity', name: 'capacity', label: 'Capacity', type: 'number', required: true, placeholder: '15', helpText: 'Maximum number of participants per tour departure' },
        { id: 'min_age', name: 'min_age', label: 'Minimum Age', type: 'number', placeholder: '6' },
        { id: 'max_age', name: 'max_age', label: 'Maximum Age', type: 'number', placeholder: '70' },
        { id: 'languages', name: 'languages', label: 'Languages Offered', type: 'multiselect', helpText: 'Languages the tour guide can speak', options: [
          { label: 'Português', value: 'pt' },
          { label: 'English', value: 'en' },
          { label: 'Español', value: 'es' },
          { label: 'Français', value: 'fr' },
          { label: 'Deutsch', value: 'de' },
          { label: 'Italiano', value: 'it' },
          { label: 'Nederlands', value: 'nl' },
          { label: '中文', value: 'zh' },
        ] },
        // Pricing
        { id: 'price_adult', name: 'price_adult', label: 'Price Adult', type: 'number', required: true, helpText: 'Per adult in currency units (e.g. 45)' },
        { id: 'price_child', name: 'price_child', label: 'Price Child', type: 'number', helpText: 'Optional child price' },
        { id: 'child_age_range', name: 'child_age_range', label: 'Child Age Range', type: 'text', placeholder: '4–12 years' },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', placeholder: 'eur' },
        // Schedule
        { id: 'schedule_type', name: 'schedule_type', label: 'Schedule Type', type: 'select', required: true, helpText: 'recurring or fixed_slots' },
        { id: 'fixed_slots', name: 'fixed_slots', label: 'Fixed Time Slots', type: 'fixed_slots', helpText: 'Used if schedule_type=fixed_slots. Each daily start time.' },
        { id: 'weekly_schedule', name: 'weekly_schedule', label: 'Weekly Schedule', type: 'weekly_schedule', helpText: 'Used if schedule_type=recurring. Open windows per day of week.' },
        { id: 'slot_interval_minutes', name: 'slot_interval_minutes', label: 'Slot Interval', type: 'number', placeholder: '30' },
        // Rich content
        { id: 'cover_image', name: 'cover_image', label: 'Cover Image', type: 'image' },
        { id: 'gallery', name: 'gallery', label: 'Photo Gallery (JSON)', type: 'textarea', helpText: 'JSON array of image URLs' },
        { id: 'highlights', name: 'highlights', label: 'Highlights', type: 'textarea', helpText: '3–5 bullet points, one per line' },
        { id: 'itinerary', name: 'itinerary', label: 'Itinerary', type: 'textarea', helpText: 'Describe the tour route, stops, and approximate timing in your own words' },
        { id: 'meeting_point', name: 'meeting_point', label: 'Meeting Point', type: 'textarea', helpText: 'Where customers should meet. You can include address, landmark hints, arrival instructions, or parking notes.', placeholder: 'McDonalds, Lugar da Corrieira, Albufeira. Please arrive 10 min early. Parking available nearby.' },
        { id: 'pickup_zones', name: 'pickup_zones', label: 'Pickup Zones', type: 'textarea', helpText: 'Zones where hotel pickup is offered. One per line (e.g. Albufeira, Armação de Pêra)' },
        { id: 'inclusions', name: 'inclusions', label: 'What\'s Included', type: 'textarea', required: true, helpText: 'One item per line (e.g. Professional guide, All taxes, Hotel pickup)', placeholder: 'Professional guide\nAll taxes and fees\nBottled water' },
        { id: 'exclusions', name: 'exclusions', label: 'What\'s Not Included', type: 'textarea', required: true, helpText: 'One item per line (e.g. Snacks, Gratuities, Insurance)', placeholder: 'Snacks and meals\nGratuities\nPersonal insurance' },
        { id: 'what_to_bring', name: 'what_to_bring', label: 'What to Bring', type: 'textarea', helpText: 'Recommendations for customers. One per line.', placeholder: 'Sunscreen\nComfortable walking shoes\nWater bottle' },
        { id: 'additional_info', name: 'additional_info', label: 'Additional Information', type: 'textarea', helpText: 'Any extra notes customers should know (tips, what to expect, preparation advice)' },
        // Accessibility & health
        { id: 'accessibility_info', name: 'accessibility_info', label: 'Accessibility (JSON)', type: 'textarea', helpText: 'JSON: {"wheelchair":false,"stroller":false,"service_animals":true,"public_transport":true}' },
        { id: 'health_restrictions', name: 'health_restrictions', label: 'Health Restrictions', type: 'textarea', helpText: 'One per line' },
        { id: 'physical_requirements', name: 'physical_requirements', label: 'Physical Requirements', type: 'textarea' },
        // Policies
        { id: 'cancellation_policy', name: 'cancellation_policy', label: 'Cancellation Policy (JSON)', type: 'textarea', helpText: 'JSON tiers: [{"hours_before":24,"refund_percent":100}]' },
        { id: 'weather_policy', name: 'weather_policy', label: 'Weather Policy', type: 'select', helpText: 'full_refund, reschedule, partial, no_refund' },
        // Extras
        { id: 'faq', name: 'faq', label: 'FAQ (JSON)', type: 'textarea', helpText: 'JSON: [{"question":"...","answer":"..."}]' },
        { id: 'fine_print', name: 'fine_print', label: 'Fine Print', type: 'richtext' },
        // Flags
        { id: 'is_digital_ticket', name: 'is_digital_ticket', label: 'Digital Ticket', type: 'boolean' },
        { id: 'instant_confirmation', name: 'instant_confirmation', label: 'Instant Confirmation', type: 'boolean' },
        { id: 'travellers_choice', name: 'travellers_choice', label: 'Travellers Choice', type: 'boolean' },
        { id: 'likely_to_sell_out', name: 'likely_to_sell_out', label: 'Likely to Sell Out', type: 'boolean' },
        // Ratings
        { id: 'rating', name: 'rating', label: 'Average Rating', type: 'number', helpText: '1-5' },
        { id: 'rating_count', name: 'rating_count', label: 'Rating Count', type: 'number' },
        // Link to bookings
        { id: 'resource_slug', name: 'resource_slug', label: 'Bookable Resource Slug', type: 'text', helpText: 'Auto-linked to the Bookings add-on. Leave empty to auto-generate on publish.' },
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
      name: 'Stripe Config',
      slug: 'stripe-config',
      description: 'Stripe API keys and settings (create one entry with slug "default")',
      type: 'custom',
      fields: [
        { id: 'stripe_publishable_key', name: 'stripe_publishable_key', label: 'Publishable Key', type: 'text', required: true, helpText: 'Starts with pk_live_ or pk_test_. Safe for frontend.' },
        { id: 'stripe_secret_key', name: 'stripe_secret_key', label: 'Secret Key', type: 'text', required: true, helpText: 'Starts with sk_live_ or sk_test_. NEVER expose in frontend.' },
        { id: 'stripe_webhook_secret', name: 'stripe_webhook_secret', label: 'Webhook Secret', type: 'text', helpText: 'Starts with whsec_ — from Stripe Dashboard > Webhooks' },
        { id: 'default_currency', name: 'default_currency', label: 'Default Currency', type: 'text', placeholder: 'eur', helpText: 'ISO 4217 code (eur, usd, gbp)' },
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
  ],
};

// ============================================
// INTERNATIONALIZATION ADD-ON
// ============================================

const i18n: AddonDefinition = {
  id: 'i18n',
  name: 'Internationalization',
  description: 'Multi-language content with automatic translation and language switcher',
  longDescription: 'Add multi-language support to your content. Detect your default language, enable additional languages, and translate content automatically using Google Cloud Translation API. Each client uses their own API key. Includes an embeddable language switcher widget and a ?lang= API parameter for frontends.',
  icon: 'globe',
  color: '#6366f1',
  category: 'content',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'i18n Config',
      slug: 'i18n-config',
      description: 'Language settings and translation configuration',
      type: 'custom',
      fields: [
        { id: 'default_language', name: 'default_language', label: 'Default Language', type: 'text', required: true, placeholder: 'pt', helpText: 'ISO 639-1 code of your source content language' },
        { id: 'default_language_name', name: 'default_language_name', label: 'Default Language Name', type: 'text', placeholder: 'Portugues' },
        { id: 'enabled_languages', name: 'enabled_languages', label: 'Enabled Languages (JSON)', type: 'textarea', required: true, helpText: 'JSON array: [{"code":"en","name":"English"},{"code":"fr","name":"Francais"}]' },
        { id: 'google_translate_api_key', name: 'google_translate_api_key', label: 'Google Translate API Key', type: 'text', required: true, helpText: 'Your Google Cloud Translation API key (per-client). Get one at console.cloud.google.com' },
        { id: 'auto_translate', name: 'auto_translate', label: 'Auto-translate on Publish', type: 'boolean', helpText: 'Automatically translate entries when published' },
        { id: 'translatable_collections', name: 'translatable_collections', label: 'Translatable Collections (JSON)', type: 'textarea', helpText: 'JSON array of collection slugs to translate. Empty = all collections.' },
        { id: 'widget_enabled', name: 'widget_enabled', label: 'Enable Language Widget', type: 'boolean' },
        { id: 'widget_position', name: 'widget_position', label: 'Widget Position', type: 'text', placeholder: 'bottom-right', helpText: 'bottom-right, bottom-left, top-right, top-left' },
        { id: 'widget_style', name: 'widget_style', label: 'Widget Style', type: 'text', placeholder: 'dropdown', helpText: 'dropdown, flags, minimal' },
      ],
    },
    {
      name: 'Translation Log',
      slug: 'i18n-translations',
      description: 'Translation status and audit log per entry per language',
      type: 'custom',
      fields: [
        { id: 'entry_id', name: 'entry_id', label: 'Entry ID', type: 'text', required: true },
        { id: 'collection_slug', name: 'collection_slug', label: 'Collection', type: 'text', required: true },
        { id: 'language', name: 'language', label: 'Language', type: 'text', required: true, helpText: 'Target language code (en, fr, es...)' },
        { id: 'status', name: 'status', label: 'Status', type: 'text', required: true, helpText: 'pending, auto-translated, reviewed, published' },
        { id: 'translated_fields', name: 'translated_fields', label: 'Translated Content (JSON)', type: 'textarea' },
        { id: 'content_hash', name: 'content_hash', label: 'Content Hash', type: 'text', helpText: 'SHA-256 of source content for change detection' },
        { id: 'translated_at', name: 'translated_at', label: 'Translated At', type: 'date' },
        { id: 'reviewed_by', name: 'reviewed_by', label: 'Reviewed By', type: 'text' },
        { id: 'reviewed_at', name: 'reviewed_at', label: 'Reviewed At', type: 'date' },
        { id: 'error', name: 'error', label: 'Error', type: 'text' },
      ],
    },
  ],
};

// ============================================
// COOKIE NOTICE ADD-ON (GDPR)
// ============================================

const cookieNotice: AddonDefinition = {
  id: 'cookie-notice',
  name: 'Cookie Notice',
  description: 'GDPR-compliant cookie consent banner with granular controls',
  longDescription: 'Display a customisable cookie consent banner to comply with GDPR/ePrivacy. Visitors choose which cookie categories to accept (necessary, analytics, marketing, preferences). All consent records are stored for audit. Includes dark/light themes, custom CSS, and a consent analytics dashboard.',
  icon: 'cookie',
  color: '#f59e0b',
  category: 'compliance',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [],
  settingsRoute: '/addons/cookie-notice',
};

// ============================================
// ACCESSIBILITY ADD-ON (EAA 2025)
// ============================================

const accessibility: AddonDefinition = {
  id: 'accessibility',
  name: 'Accessibility',
  description: 'EAA 2025-compliant accessibility widget with real CSS adjustments',
  longDescription: 'Help your site comply with the European Accessibility Act (EAA) effective June 2025. Provides a floating widget with real CSS-based adjustments: font size, high contrast, reduced motion, line spacing, large cursor, and readable text alignment. No overlays, no hacks — pure CSS applied to the page.',
  icon: 'accessibility',
  color: '#0ea5e9',
  category: 'compliance',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [],
  settingsRoute: '/addons/accessibility',
};

// ============================================
// COUPONS ADD-ON (discount codes — depends on Bookings)
// ============================================

const coupons: AddonDefinition = {
  id: 'coupons',
  name: 'Coupons',
  description: 'Discount codes for bookings — percentage or fixed, with usage limits and scope rules',
  longDescription: 'Create and manage discount coupons applied at checkout. Supports percentage or fixed-amount discounts, expiry dates, total/per-customer usage limits, resource whitelists, first-time customer rules, and optional stackability. When Stripe Payments is installed, coupons are mirrored as native Stripe coupons and applied to the Checkout Session — so Stripe is the single source of truth for the final amount, preventing double-discount bugs. Every redemption is audited in a separate collection for reconciliation. Requires the Bookings add-on.',
  icon: 'ticket-percent',
  color: '#dc2626',
  category: 'commerce',
  version: '1.0.0',
  author: 'kibanCMS',
  collections: [
    {
      name: 'Coupons',
      slug: 'coupons',
      description: 'Discount codes with rules and limits',
      type: 'custom',
      fields: [
        { id: 'code', name: 'code', label: 'Code', type: 'text', required: true, helpText: 'Alphanumeric code customers type at checkout. Case-insensitive. Avoid 0/O/1/I.', placeholder: 'SUMMER25' },
        { id: 'description', name: 'description', label: 'Description', type: 'text', helpText: 'Internal label (e.g. "Summer 2026 campaign")' },
        { id: 'type', name: 'type', label: 'Discount Type', type: 'select', required: true, helpText: 'percentage or fixed' },
        { id: 'value', name: 'value', label: 'Value', type: 'number', required: true, helpText: 'Percentage (1-100) or fixed amount in currency units', placeholder: '25' },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', placeholder: 'eur', helpText: 'Only used for fixed-amount coupons. ISO 4217.' },
        { id: 'min_amount', name: 'min_amount', label: 'Min Order Amount', type: 'number', helpText: 'Minimum subtotal required to apply (in currency units). Empty = no minimum.' },
        { id: 'max_discount', name: 'max_discount', label: 'Max Discount Cap', type: 'number', helpText: 'Cap on discount for percentage coupons (e.g. "20% off, max 50 EUR")' },
        { id: 'starts_at', name: 'starts_at', label: 'Starts At', type: 'date', helpText: 'Coupon not valid before this date' },
        { id: 'expires_at', name: 'expires_at', label: 'Expires At', type: 'date', helpText: 'Coupon not valid after this date' },
        { id: 'max_uses_total', name: 'max_uses_total', label: 'Max Uses (Total)', type: 'number', helpText: 'Global limit across all customers. Empty = unlimited.' },
        { id: 'max_uses_per_customer', name: 'max_uses_per_customer', label: 'Max Uses Per Customer', type: 'number', helpText: 'Empty or 0 = unlimited', placeholder: '1' },
        { id: 'usage_count', name: 'usage_count', label: 'Usage Count', type: 'number', helpText: 'Auto-updated on confirmed redemptions. Do not edit manually.' },
        { id: 'applies_to', name: 'applies_to', label: 'Applies To', type: 'select', required: true, helpText: 'all_resources or specific_resources' },
        { id: 'resource_slugs', name: 'resource_slugs', label: 'Resource Slugs', type: 'textarea', helpText: 'Used when applies_to=specific_resources. One slug per line.' },
        { id: 'new_customers_only', name: 'new_customers_only', label: 'New Customers Only', type: 'boolean', helpText: 'Reject if the email has any prior confirmed booking' },
        { id: 'stackable', name: 'stackable', label: 'Stackable', type: 'boolean', helpText: 'Allow combining with other coupons (default: false)' },
        { id: 'stripe_coupon_id', name: 'stripe_coupon_id', label: 'Stripe Coupon ID', type: 'text', helpText: 'Auto-linked to Stripe coupon. Read-only.' },
        { id: 'is_active', name: 'is_active', label: 'Active', type: 'boolean', helpText: 'Inactive coupons are always rejected' },
      ],
    },
    {
      name: 'Coupon Redemptions',
      slug: 'coupon-redemptions',
      description: 'Audit log of coupon uses — one row per checkout where a coupon was applied',
      type: 'custom',
      fields: [
        { id: 'coupon_code', name: 'coupon_code', label: 'Coupon Code', type: 'text', required: true },
        { id: 'booking_id', name: 'booking_id', label: 'Booking ID', type: 'text', required: true },
        { id: 'customer_email', name: 'customer_email', label: 'Customer Email', type: 'email', required: true },
        { id: 'subtotal_cents', name: 'subtotal_cents', label: 'Subtotal (cents)', type: 'number', required: true },
        { id: 'discount_cents', name: 'discount_cents', label: 'Discount (cents)', type: 'number', required: true },
        { id: 'currency', name: 'currency', label: 'Currency', type: 'text', required: true },
        { id: 'stripe_session_id', name: 'stripe_session_id', label: 'Stripe Session', type: 'text' },
        { id: 'status', name: 'status', label: 'Status', type: 'select', required: true, helpText: 'pending, confirmed, expired, cancelled' },
        { id: 'redeemed_at', name: 'redeemed_at', label: 'Redeemed At', type: 'date' },
        { id: 'confirmed_at', name: 'confirmed_at', label: 'Confirmed At', type: 'date' },
      ],
    },
  ],
};

// ============================================
// REGISTRY
// ============================================

export const ADDONS_REGISTRY: AddonDefinition[] = [
  cookieNotice,
  accessibility,
  newsletter,
  seo,
  forms,
  bookings,
  tours,
  coupons,
  redirects,
  webhooksVisual,
  aiContent,
  stripePayments,
  i18n,
];

export function getAddon(id: string): AddonDefinition | undefined {
  return ADDONS_REGISTRY.find(a => a.id === id);
}
