# Edição no site ("Editar no site") — Beta

Edit texts and images **on the live site**, by clicking them. No SDK, no changes
to the client's site: the Kiban widgets loader that every site already includes
does the work.

```
Admin → "Editar no site"  →  site opens with #kiban-edit=<signed token>
                             loader stores the token, injects edit-overlay.js
                             overlay asks the API which entries are behind this URL
                             admin clicks a text/image, edits, "Guardar"
```

Visitors are never affected: the overlay script is only requested when a token
is present in the URL or in `sessionStorage`, and the API refuses everything
without a valid token.

## Enabling (per site)

**Settings → General → Edição no site (Beta)**

| Mode | Who sees the button | What "Guardar" does |
|------|---------------------|---------------------|
| Desligado (default) | nobody | — |
| Beta | admins | changes are stored as **pending**; nothing goes live until approved in the admin |
| Ligado | admins and editors | changes are applied to the entry immediately (published entries go live) |

Requirements: the Site URL filled in (Settings → General) and the widgets
loader on the site (`<script src="https://kiban.pt/api/v1/widgets/loader.js" data-api-key="…">`).

Turning the setting back to **Desligado** is the kill switch: the button
disappears and every token stops working at once, no deploy needed.

## What can be edited (phase 1)

- Entry **title**, **excerpt**, **featured image**
- Content fields of type `text`, `textarea`, `email`, `url`, `select`, `number`, `image`
- Collections without a field schema: their string, number and image values
- **Not yet**: rich text (shown with a lock and a hint), composite fields
  (schedules, FAQs, lists), config collections, customer data (bookings, leads…)

### How the page is matched to entries

1. The URL is parsed: `/en/tours/lisbon-tour` → language `en` (only when the
   site has that language enabled), slug `lisbon-tour`, collection hint `tours`.
   The home page tries `home`, `index`, `inicio`, `homepage`.
2. The API returns the matching entries of editable collections and their
   editable fields.
3. The overlay walks the page and marks every element whose text equals a field
   value, and every `<img>` whose URL (or inner URL of an optimiser such as
   `/api/v1/img?src=…` or `/_next/image?url=…`, or file name) equals an image field.
4. Lists have no URL of their own (team, services, testimonials on the home
   page), so small editable collections (up to 100 entries each, 300 in total,
   smallest first) are sent whole and matched by text as well. Values shorter
   than 3 characters are ignored for those. A text shared by several entries
   (two team members with the role "Fisioterapeuta") goes to the entry whose
   other fields sit in the same block (the name next to it); when that cannot
   be decided the element is shown locked, with the reason in the tooltip.

For content the matcher cannot see (big collections, rich text later), tag the
element explicitly:

```html
<h2 data-kiban="tours/lisbon-tour/title">…</h2>
<p data-kiban="pages/sobre/intro">…</p>           <!-- content field "intro" -->
<img data-kiban="tours/lisbon-tour/hero" src="…"> <!-- image field "hero" -->
```

Format: `collection-slug/entry-slug/field` (`field` is `title`, `excerpt`,
`featured_image` or a content field id). Tagged entries are fetched even when
the URL does not point at them.

### Languages

On `/en/…` (or when `<html lang="en">` and `en` is an enabled language) edits go
to the English translation (`meta.translations.en`), exactly what the public API
serves with `?lang=en`. Images and the excerpt are shared by all languages: edit
them in the default language.

## Approval (beta mode)

Pending changes live in the entry's `meta.inline_pending` (field, new value,
previous value, language, who, when). In the admin:

- the collection list shows a purple **"N no site"** badge on the entry
- the entry editor shows the changes with old → new and **Aplicar** / **Rejeitar**
  (per change or all at once). Applying saves the entry through the normal
  update path (validation, version check, audit log, cache invalidation,
  auto-translate).

On the site, pending values show a dotted purple outline with the pending text
in the tooltip, so the admin knows what is already queued.

## Security

- The token (`X-Kiban-Edit` header) is an HMAC-SHA256 signature over
  `{user, tenant, exp}` with the same secret as preview and newsletter links
  (`PREVIEW_SECRET`, else a service role key of the deployment; see
  `lib/signing-secret.ts`). 4-hour lifetime.
- Every request re-reads the site setting and the user's current role: turning
  the feature off or demoting the user takes effect immediately.
- Tenant-bound: a token for site A is rejected by site B's origin.
- Writes are limited to editable fields of editable collections; plain text is
  stripped of tags; images must be `http(s)` URLs. Rich text is refused.
- Optimistic locking (`version`): if the entry changed in the admin meanwhile,
  the overlay reports a conflict instead of overwriting.
- Uploads from the site go through the normal media pipeline into the
  `/site-edits` folder (images only).
- Audit log actions: `inline_edit_session`, `inline_edit_pending`, `inline_edit`,
  `inline_edit_apply`, `inline_edit_discard`.
- Own rate-limit bucket (300 requests / 15 min / IP).

## API

```
POST  /api/v1/inline-edit/session                 JWT (admin or editor per mode)
      body { path? }  → { token, expires_at, mode, save_mode, site_url, edit_url }

GET   /api/v1/inline-edit/resolve?path=&lang=&refs=   X-Kiban-Edit
      → { user, mode, save_mode, lang, source_lang, languages, entries[] }

PATCH /api/v1/inline-edit/entries/:id              X-Kiban-Edit
      body { version, lang, changes: [{ field, value }] }
      → { saved: 'pending' | 'live', version }

POST  /api/v1/inline-edit/media                    X-Kiban-Edit, multipart "file" (images)
      → { id, url }

POST  /api/v1/inline-edit/pending/:id/apply        JWT (editor+)   body { indexes?: number[] }
POST  /api/v1/inline-edit/pending/:id/discard      JWT (editor+)   body { indexes?: number[] }
```

## Phase 2 (not built)

Rich text editing with a small toolbar, direct publishing per role in beta,
editing site-wide strings (header, footer), and "add a new item" for lists.
