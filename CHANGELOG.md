# Changelog

All notable changes to kibanCMS. Production = `main` (Railway). Per-tenant SQL
changes are listed under **Database** and must be run with
`database/UPGRADE_TENANT.sql` in each tenant's Supabase.

## 1.7.0 — 2026-11-11

### Added
- **Editar no site (beta)** — edit texts and images by clicking them on the
  live site, through the widgets loader and a signed 4-hour token. Per-site
  switch (Settings → General: off / beta / on); in beta, admins only and
  every change waits for approval in the entry editor. Lists (team, services,
  testimonials) are matched by text; shared texts are resolved by context or
  locked. Docs: `docs/INLINE_EDITING.md`.
- **Capturar** — make hard-coded site copy editable: the element becomes an
  entry of the `site-content` collection (anchor = original text + CSS
  path) and the loader swaps the current value in for every visitor; "em
  todas as páginas" for header/footer texts.
- **Nota** — feedback pinned on the live site: stored in the private
  `site-notes` collection, emailed to the operator, shown as numbered pins;
  admin page Inbox → Notas do site.
- **Popups e barras de anúncio** add-on — bars or popups with link / WhatsApp
  / newsletter form / coupon code actions, page targeting, triggers
  (immediate, delay, scroll, exit intent), frequency, dates, priority.
  Docs: `docs/POPUPS_SETUP.md`.
- Settings → API: Cloudflare Turnstile **site key** (used by the popup
  newsletter form when the secret key is set).
- `/health` and the admin sidebar now report the version from `package.json`.

### Fixed
- Settings → General could not be saved in any tenant that already had the
  `site-settings` collection ("Collection with this slug already exists").
- Every signed token (preview links, newsletter confirm/unsubscribe,
  editing sessions) returned 500 on multi-tenant deployments without
  `PREVIEW_SECRET`; one `signingSecret()` now falls back to the default
  tenant's service key. Setting `PREVIEW_SECRET` is still recommended.

### Security (holistic review of 2026-11-11)
- Duplicating an entry no longer bypasses the private-collection check (an
  author/editor could clone `stripe-config` and read the keys).
- The i18n translation log (`i18n-translations`) is private, machine
  translation refuses private/config collections and checks the entry
  belongs to the named collection (migration 015).
- `/activity` needs the editor role, `/activity/audit` the admin role.
- Settings singletons (`site-settings`, `seo-settings`) are redacted for
  non-admin users as they already were for API keys (CAPI token, Turnstile
  secret, notification addresses).
- Checkout errors return a constant message; a failed checkout releases the
  seats and cancels the order it had just created (bookings and unified
  checkout).
- Channel Manager webhooks carry the tenant in the URL and run in it.
- Media uploads need a content role; storage error details stay in the logs.
- Audit log IP comes from the trusted proxy, not from `X-Forwarded-For`.
- `site-notes` is private in the API and, with migration 014, in the
  database row-level security.
- Captured image URLs only reach `<img src>` when they are http(s) or
  site-relative; everything the popups widget renders is escaped.

### Fixed (review)
- Sitemap and `llms.txt` no longer list `site-content`, `site-notes` and
  `popups` entries as pages.
- Site-wide captures swap every occurrence of the text (header + footer);
  elements tagged by an earlier pass are found first; `/widgets/site-content`
  is cached per tenant for a minute and the browser keeps it 5 minutes.
- `/inline-edit/resolve` batches `data-kiban` refs and caches collection
  counts; the bootstrap reads popups once.
- Popup campaign dates are whole days in the site's time zone; the
  scroll trigger fires on pages shorter than the viewport.
- Admin: popups number fields get real defaults (5 s, 7 days, priority 10);
  the sidebar is keyboard-operable and refreshes after saving Settings;
  a version conflict no longer shows "Saved"; entry loads cannot show a
  stale entry; images in entry fields upload through the API pipeline;
  preview data is posted only to the preview origin; heavy pages are
  lazy-loaded (first chunk down from 1.5 MB).
- Forms rate limit only counts submissions; `/api/v1/ai` mounted once.

### Changed
- pnpm 10 (lockfile v9), `packageManager`, Dockerfile and CI updated.
- Removed the unused `apps/example` (Next 14 with known CVEs),
  `packages/kiban-client`, `database/migrations-v2-backup`,
  `supabase/functions` and the ad-hoc seed scripts.

### Database
- `014_site_notes_private.sql` (schema v14): `site-notes` joins the editor
  tier of the RLS; `kiban_schema_status()` → 14.

## 1.6.0 — 2026-11-10

### Added
- Widgets: one bootstrap request for the loader and all widgets, versioned
  widget scripts cached for a year.
- Admin: real pagination and server-side search in entries and media lists.
- GDPR: newsletter double opt-in (on by default), signed unsubscribe links,
  lead retention setting.
- Meta Conversions API + Pixel autoload and Google tags with Consent Mode v2,
  all gated by cookie consent.

### Security
- Holistic review (schema v13): RLS by collection tier for logged-in users,
  author links `SET NULL` instead of cascade deletes, slug reuse after Trash,
  Trash-aware webhook trigger, JSONB indexes, fixed `search_path` on
  SECURITY DEFINER helpers.
