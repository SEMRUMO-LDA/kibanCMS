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

## Capturing hard-coded texts ("Capturar")

Most sites have copy that lives in the site's code, not in Kiban (the hero
title, section intros, buttons). Admins can make any such text or image
editable without touching the site:

1. In the editor bar press **Capturar**, hover the text or image (pink
   outline) and click it. Give it a name ("Título – Clínica de Saúde").
2. Kiban creates the **Conteúdo do site** collection (first time) and one
   entry per captured element: page path, the value, and an anchor (the
   original text plus the element's CSS path). The value starts equal to the
   original, so nothing changes for visitors yet.
3. The element is now editable like any other: edit on the site (pending in
   beta, approved in the admin) or in Content → Conteúdo do site.
4. The widgets loader asks `/api/v1/widgets/site-content?path=` on every page
   view and swaps the current values in, for every visitor. It finds the
   element by its CSS path first; when the site's HTML changed, by the
   original text (fallback). Values are cached per page in `localStorage`, so
   repeat visits swap before the first paint settles; the first visit may show
   the original text for a fraction of a second.

Limits and caveats:

- Plain text and images only: the swap sets the element's text, so inline
  formatting inside a captured element (a `<b>` in a paragraph) is lost once
  the text is changed. Elements with more than three child elements cannot
  be captured.
- Search engines that run JavaScript (Google) index the swapped text; others,
  and social previews, see the original. Page titles and meta tags are not
  covered.
- If the site is rebuilt and neither the CSS path nor the original text
  matches any more, the entry simply stops applying. Fix it by editing the
  entry's anchor fields in the admin (or capture again).
- "Edição no site" = **Desligado** also stops the swaps: the site shows
  exactly what its code contains.
- Up to 200 captures per page. Audit action: `inline_edit_capture`.

For the long run, the site's developer can bake the content in: tag the
elements with `data-kiban="site-content/<entry-slug>/text"` (or `/image`), or
fetch the entries from the API at build time; the runtime swap then has
nothing to do.

### Site-wide texts (header, footer, contacts)

When capturing, choose **Em todas as páginas**: the entry is stored with page
`*` and the loader applies it on every page (after that page's own
captures). The editor finds it on any page by its original text. Use it for
the footer line, the phone number, the opening hours.

## Notes on the site ("Nota")

Feedback without screenshots: in the editor bar press **Nota**, click the
spot (any element, orange dashed outline) and write what should change.
Kiban stores it in the private **Notas do site** collection (never public),
emails the operator's notification inbox (the same recipients as form
notifications, reply-to the author), and shows a numbered pin on the spot
for whoever opens the editor next. Click a pin to read it or mark it done.

In the admin, **Inbox → Notas do site** lists them with the page and the
nearby text; "Abrir no site" opens the page in the editor with the pin
visible; "Concluída" closes it (reopen possible). Anchors: CSS path plus
offset inside the element; when the element no longer exists the pin is
parked at the bottom-left corner with a grey colour. Up to 100 open notes
per page. Audit actions: `site_note_create`, `site_note_done`,
`site_note_reopen`.

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

POST  /api/v1/inline-edit/site-content             X-Kiban-Edit (admins)
      body { path, scope?: 'page'|'site', kind: 'text'|'image', label?, tag, selector, original }
      → { entry, created }                         (idempotent per page + original)

POST  /api/v1/inline-edit/notes                    X-Kiban-Edit
      body { page, text, selector?, anchor_text?, x?, y? }
      → { id, page, text, status, selector, anchor_text, x, y, by, at }   (201; emails the operator)
PATCH /api/v1/inline-edit/notes/:id                X-Kiban-Edit   body { status: 'open'|'done' }
GET   /api/v1/inline-edit/resolve                  … also returns notes[] (open notes of the page)

GET   /api/v1/widgets/site-content?path=           API key (the loader, every page view)
      → { path, items: [{ id, slug, kind, selector, original, value }] }

POST  /api/v1/inline-edit/pending/:id/apply        JWT (editor+)   body { indexes?: number[] }
POST  /api/v1/inline-edit/pending/:id/discard      JWT (editor+)   body { indexes?: number[] }
```

## Phase 2 (not built)

Rich text editing with a small toolbar, direct publishing per role in beta,
editing site-wide strings (header, footer), and "add a new item" for lists.
