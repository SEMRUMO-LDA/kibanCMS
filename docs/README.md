# kibanCMS — Documentation

## Running the platform

| Document | Description |
|----------|-------------|
| [New Client Setup](NEW_CLIENT_SETUP.md) | Add a new client (tenant) step by step |
| [Multi-Tenant Guide](MULTI_TENANT_GUIDE.md) | How one deploy serves many clients, `TENANTS` config |
| [Infrastructure Guide](INFRASTRUCTURE_GUIDE.md) | Railway, Supabase, GitHub — access and flows |
| [Database migrations](../database/migrations/README.md) | Which SQL files every tenant needs; `UPGRADE_TENANT.sql` |

## Building on the CMS

| Document | Description |
|----------|-------------|
| [Developer Guide](DEVELOPER_GUIDE.md) | Architecture, setup, API, addons, deploy, troubleshooting |
| [API Endpoints](API_ENDPOINTS.md) | Endpoints with auth, params, and response format |

## Add-ons

| Document | Description |
|----------|-------------|
| [Forms Email Setup](FORMS_EMAIL_SETUP.md) | Contact forms: emails via Resend, optional webhook |
| [Stripe Payments Setup](STRIPE_SETUP.md) | Accept payments via Stripe Checkout |
| [Coupons](ADDON_COUPONS.md) | Discount codes for bookings and checkout |
| [Newsletter Addon](NEWSLETTER_SETUP.md) | Email subscriptions from any frontend |
| [SEO & Analytics](SEO_SETUP.md) | SEO, Open Graph, analytics, structured data |
| [Performance & AI search](AI_PERFORMANCE.md) | Optimised images, AI crawler policy, llms.txt, automatic JSON-LD |
| [Meta Conversions API](META_CAPI.md) | Server-side Lead / Registration / Purchase events, GDPR consent |
| [Redirects Manager](REDIRECTS_SETUP.md) | 301/302 redirects for SEO and migrations |
| [Edição no site (Beta)](INLINE_EDITING.md) | Edit texts and images by clicking them on the live site; capture hard-coded copy; notes; approval flow |
| [Popups e barras de anúncio](POPUPS_SETUP.md) | Promotions, announcements and newsletter sign-ups as a bar or popup, scheduled and targeted, no site changes |

## Checking a client

In the client's admin panel: **Settings → Health** (is everything working?) and
**Settings → API → Connect my site** (key + Vercel variables + connection test).

Older documents (v1.4 roadmap/changelog, v1.6 audit, legacy HTML guide) are in
[`archive/`](archive/README.md).
