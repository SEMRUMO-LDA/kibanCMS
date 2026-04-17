# Coupons Add-on

Discount codes applied at Bookings checkout. Supports percentage or fixed-amount
discounts, usage limits, scope rules, and first-time-customer gating. Built to
be correct under concurrency (race-safe) and to delegate final-amount math to
Stripe when available, eliminating a whole class of "double-discount" bugs.

> **Status:** v1.0.0 — available as of kibanCMS v1.6.
> **Dependencies:** `bookings` add-on (hard). `stripe-payments` (soft — the add-on works without it, but Stripe-native coupons are the recommended path in production).
> **Category:** Commerce.

---

## Why a dedicated add-on (and not a field on Bookings)

A single `discount` field on a booking drifts. Coupons need their own lifecycle:
they are created once, reused many times, expire, hit usage limits, apply to
subsets of resources, and need to be auditable for reconciliation. They also
interact with Stripe, which has a full-featured `coupons` API of its own. The
cleanest design is a separate domain that Bookings composes with — mirroring
how real-world POS systems work.

This add-on is opt-in: installing it is enough to enable coupon support on any
checkout that goes through the Bookings add-on. Tours inherit this automatically
because Tours delegates booking to Bookings.

---

## Schema

Two collections are created on install.

### `coupons`

Source of truth for coupon definitions.

| Field | Type | Notes |
|---|---|---|
| `code` | text | Customer-facing code. Case-insensitive. Advice: avoid `0/O/1/I`. |
| `description` | text | Internal label (e.g. "Summer 2026") |
| `type` | select | `percentage` \| `fixed` |
| `value` | number | Percentage (1–100) **or** fixed amount in currency units |
| `currency` | text | Used only when `type=fixed`. ISO 4217. |
| `min_amount` | number | Minimum subtotal in currency units. Empty = no floor. |
| `max_discount` | number | Caps the absolute discount (ex: "20% off, max 50€") |
| `starts_at` / `expires_at` | date | Validity window. Either is optional. |
| `max_uses_total` | number | Global cap across all customers. Empty = unlimited. |
| `max_uses_per_customer` | number | Per-email cap. Empty / 0 = unlimited. |
| `usage_count` | number | **Do not edit manually.** Bumped atomically by the webhook. |
| `applies_to` | select | `all_resources` \| `specific_resources` |
| `resource_slugs` | textarea | One slug per line. Used only when `applies_to=specific_resources`. |
| `new_customers_only` | boolean | Rejects the code if the email has any prior **confirmed** booking. |
| `stackable` | boolean | Reserved — future multi-coupon flows. Default false. |
| `stripe_coupon_id` | text | Cached Stripe coupon ID. Read-only — managed by the add-on. |
| `is_active` | boolean | Emergency kill-switch without deleting the row. |

### `coupon-redemptions`

One row per checkout where a coupon was applied. Pure audit log — never edit
by hand. State transitions:

```
 pending ─── stripe:session.completed ──▶ confirmed
    │
    └── stripe:session.expired ──▶ expired
    │
    └── coupon exhausted mid-checkout ──▶ cancelled (reason: coupon_exhausted)
```

| Field | Notes |
|---|---|
| `coupon_code` | Normalised upper-case code |
| `booking_id` | The `entries.id` of the booking |
| `customer_email` | Lower-cased |
| `subtotal_cents` / `discount_cents` / `currency` | Captured at checkout time |
| `stripe_session_id` | Links back to Stripe for reconciliation |
| `status` | `pending` / `confirmed` / `expired` / `cancelled` |
| `redeemed_at` / `confirmed_at` | Timestamps |

---

## Architecture — how bullet-proofing actually works

Four classes of bugs that normally wreck coupons, and how we prevent each one.

### 1. Race on `max_uses_total`

Two customers grab the last seat of `SUMMER25` in the same second.

**Defence:** `usage_count` is only bumped inside the Stripe webhook handler
(`checkout.session.completed`), serialized via PostgreSQL row-level locking.
The UPDATE is guarded by a WHERE clause on the previously observed
`usage_count` value — if another handler wrote first, our UPDATE affects 0
rows and we abort that redemption as `cancelled` with reason
`coupon_exhausted`. No overselling. See
[lib/coupons.ts → confirmRedemption](../apps/api/src/lib/coupons.ts).

### 2. Double-apply (apply → back → apply again)

Customer opens Stripe, backs out, reloads the site, tries again.

**Defence:** each `POST /bookings/v2/checkout` writes a fresh `pending`
redemption row before Stripe is called. The per-customer rate-limit check
counts `pending + confirmed` redemptions by email, so the second attempt will
be caught by `max_uses_per_customer`. Pending rows self-clean when the
Stripe session expires (webhook `checkout.session.expired`).

### 3. Double-source-of-truth with Stripe

If we discount locally and also apply a Stripe coupon, we can undercharge.
If we only discount locally and ignore Stripe, refunds become manual.

**Defence:** when Stripe is configured, we create (or reuse) a native Stripe
coupon via `stripe.coupons.create` and attach it to the Session via
`discounts: [{ coupon: stripeCouponId }]`. The line-item amount stays at full
price; Stripe applies the discount. The Stripe `session.amount_total` is
therefore the *only* authoritative final amount. Our `discount_cents` on the
redemption row is informational — used for reporting, never for charging.
The ID is cached on `coupons.stripe_coupon_id` and reused for subsequent
checkouts.

### 4. Currency mismatch

A customer redeems `-10 EUR` on a booking priced in USD.

**Defence:** fixed-amount coupons store their `currency` and are rejected
before Stripe is called if it differs from the resource's currency. Percentage
coupons are currency-agnostic.

---

## API

All endpoints are mounted under `/api/v1/coupons`. Auth: JWT (admin UI) or
API key (frontend). See [API_ENDPOINTS.md](API_ENDPOINTS.md) for auth details.

### `POST /api/v1/coupons/validate`

Pure validation — no side effects. Safe to call on every keystroke.

**Request**

```json
{
  "code": "SUMMER25",
  "resource_slug": "benagil-tour",
  "customer_email": "maria@example.pt",
  "subtotal_cents": 9000,
  "currency": "eur"
}
```

**Response (valid)**

```json
{
  "data": {
    "valid": true,
    "code": "SUMMER25",
    "type": "percentage",
    "discount_cents": 2250
  }
}
```

**Response (invalid)**

```json
{
  "data": {
    "valid": false,
    "reason": "per_customer_limit",
    "message": "You have already used this coupon"
  }
}
```

Possible `reason` codes (i18n-able on the frontend):

| Reason | Meaning |
|---|---|
| `not_found` | No matching code |
| `inactive` | Kill-switched by admin |
| `not_started` | Before `starts_at` |
| `expired` | After `expires_at` |
| `exhausted` | `usage_count >= max_uses_total` |
| `scope` | Code not valid for this resource |
| `currency` | Fixed coupon vs. different resource currency |
| `min_amount` | Order below `min_amount` |
| `per_customer_limit` | Email hit `max_uses_per_customer` |
| `not_new_customer` | `new_customers_only` but email has prior confirmed booking |

### `POST /api/v1/bookings/v2/checkout` *(extended)*

The existing checkout endpoint now accepts an optional `coupon_code`:

```json
{
  "resource_slug": "benagil-tour",
  "date": "2026-06-12",
  "time_slot": "10:00",
  "party_size": 2,
  "customer_name": "Maria",
  "customer_email": "maria@example.pt",
  "coupon_code": "SUMMER25",
  "success_url": "https://site.pt/ok",
  "cancel_url": "https://site.pt/cancel"
}
```

**Response**

```json
{
  "data": {
    "booking_id": "…",
    "checkout_url": "https://checkout.stripe.com/…",
    "subtotal_cents": 9000,
    "discount_cents": 2250,
    "total_cents": 6750,
    "coupon_applied": "SUMMER25"
  }
}
```

If the code is invalid, the endpoint fails fast with `400` and a structured
`code` field matching the `reason` list above — the booking is **not** created,
no Stripe session is opened.

---

## Frontend integration (2026 recipe)

Minimum viable flow, optimistic-ish:

```ts
// 1. Debounced validate while the user types the code.
const preview = await fetch('/api/v1/coupons/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
  body: JSON.stringify({ code, resource_slug, customer_email, subtotal_cents, currency }),
}).then(r => r.json());

if (preview.data.valid) {
  showDiscount(preview.data.discount_cents); // "-€22.50"
} else {
  showReason(preview.data.reason);           // map to i18n string
}

// 2. At checkout, pass the code — the server validates again (truth is there).
await fetch('/api/v1/bookings/v2/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
  body: JSON.stringify({ ...bookingData, coupon_code: code }),
});
```

Never trust the preview for final totals — the server re-validates at checkout
and Stripe computes the final amount. The preview is just UI sugar.

---

## Admin workflow

1. **Install** the add-on from `/addons`. This creates `coupons` and
   `coupon-redemptions` collections.
2. **Create coupons** under `/content/coupons`. Typical setups:
   - Campaign: `SUMMER25`, percentage 25, `max_uses_total=100`,
     `expires_at=2026-09-30`.
   - First-timer: `WELCOME10`, percentage 10, `new_customers_only=true`,
     `max_uses_per_customer=1`.
   - Specific tours: `BENAGIL15`, `applies_to=specific_resources`,
     `resource_slugs=benagil-tour`.
3. **Monitor** redemptions under `/content/coupon-redemptions`. Filter by
   `status=confirmed` for revenue impact, `status=pending` for abandoned carts.
4. **Revoke** a compromised code instantly by toggling `is_active=false` — no
   deletion needed, preserves the audit trail.

---

## Operational notes

- **Stripe coupon retention:** when a kibanCMS coupon's `expires_at` passes,
  its Stripe twin expires naturally (we set `redeem_by`). We don't proactively
  delete Stripe coupons — doing so would orphan the audit link on old
  transactions.
- **Emergency kill-switch:** flipping `is_active=false` rejects validation
  server-side immediately. Stripe sessions already opened with the coupon
  will still apply (Stripe holds the session discount); this is acceptable
  given the typical 30-minute session TTL.
- **Reconciliation:** every `coupon-redemptions` row carries
  `stripe_session_id`, and every Stripe transaction carries `coupon_code` in
  metadata. Join on either to reconcile at month-end.
- **Per-customer limit caveat:** rate-limited by `customer_email` only. A
  determined user could evade with burner addresses; this is acceptable for
  the typical tourism / services use case. For stricter enforcement, add an
  IP hash or device fingerprint at a later stage.
- **Multi-tenant isolation:** every query scopes by collection ID which is
  tenant-scoped; no cross-tenant code collision risk.

---

## Files

| File | Role |
|---|---|
| [apps/admin/src/config/addons-registry.ts](../apps/admin/src/config/addons-registry.ts) | `coupons` add-on manifest (collections + fields) |
| [apps/api/src/lib/coupons.ts](../apps/api/src/lib/coupons.ts) | Domain logic — `validateCoupon`, `ensureStripeCoupon`, `recordPendingRedemption`, `confirmRedemption`, `cancelPendingRedemption` |
| [apps/api/src/routes/coupons.ts](../apps/api/src/routes/coupons.ts) | HTTP `POST /validate` |
| [apps/api/src/routes/bookings-v2.ts](../apps/api/src/routes/bookings-v2.ts) | Checkout integration — accepts `coupon_code`, applies Stripe coupon, records redemption |
| [apps/api/src/routes/payments.ts](../apps/api/src/routes/payments.ts) | Webhook — confirms redemption on `checkout.session.completed`, expires on `checkout.session.expired` |

---

## Out of scope for v1.0

Deliberately deferred until there's real demand — adding these without users
invites design by speculation.

- **Automatic (no-code) promotions** — "10% off all tours > 100€ in August".
  Would require a rules engine (evaluator, priority, conflict resolution).
- **Stacking** — the `stackable` field is reserved. First-pass implementation
  is single-coupon per booking.
- **Per-user referral codes** — single-use codes issued on sign-up. Overlaps
  with a future `referrals` add-on.
- **Bundled discounts** — "book 3 tours, get 1 free". Different enough that
  it belongs in a future `bundles` add-on, not here.
