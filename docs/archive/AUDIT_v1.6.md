# kibanCMS v1.6 Holistic Audit

**Date:** 2026-04-17
**Scope:** Architecture + Security
**Previous audit:** 2026-04-03 (see `memory/project_state_v1.md`)

## Executive summary

The codebase absorbed three large architectural changes in 14 days (bookings/tours split, coupons add-on, Resend email) without an integration pass. Core CMS plumbing (RLS, tenant resolver, JWT validation, Stripe config caching) is in good shape and most v1.1 security issues from the prior audit are now fixed. However, **the Stripe webhook endpoint is unreachable** due to a router mount bug — every booking paid via the CMS silently fails to confirm. Two other critical issues sit alongside it: the coupon "race-safe" claim does not hold (the guarded UPDATE cannot detect 0-row updates in supabase-js), and the multi-tenant webhook has no tenant context, so in multi-tenant mode payments will write to the wrong tenant's DB. The add-on registry pattern is inconsistent but workable; the `/bookings/*` legacy router is duplicated heavily with `/bookings/v2/*` and needs a retirement plan.

## Diff since 2026-04-03

| Prior issue | Status |
|-------------|--------|
| RLS uses `created_by` vs `author_id` | **Fixed** — `database/migrations/CLEAN_RESET.sql:361-365` uses `author_id` throughout |
| Migration 003 references non-existent tables | **Fixed** — 003 moved to `database/migrations/_archived/`; `CLEAN_RESET.sql` is canonical |
| Duplicate webhook implementations (003 vs 009) | **Fixed** — both archived; `CLEAN_RESET.sql:197-233` is canonical |
| Auth provider double init + TOKEN_REFRESHED loop | **Fixed** (as noted in prior audit) |
| Profiles publicly readable | **Open** — `CLEAN_RESET.sql:342-343` still `FOR SELECT TO authenticated USING (true)` |
| Media upload UI wiring | **Not re-verified this round** — out of scope (b) |
| 0% unit test coverage | **Still open** — only `apps/api/src/__tests__/smoke.test.ts` exists, requires running server + env |
| No content validation against collection schema | **Partially fixed** — `apps/api/src/lib/validate-content.ts` exists (72 LOC), used in `entries.ts`; no `multiselect`/`weekly_schedule`/`fixed_slots` handling |
| Inconsistent API responses (DELETE format) | **Not re-verified** — out of scope |
| Exposed Supabase service_role key | **Fixed** — commit `351b683`; confirmed no `eyJ*` tokens in tracked files, `clients/` gitignored |

## Architecture

### What's healthy

- **Tenant-aware Supabase proxy** (`apps/api/src/lib/supabase.ts:38-63`) — cleanly resolves the per-request client via `AsyncLocalStorage`. Routes import `supabase` unchanged. Good.
- **JWT tenant-binding is implicit and correct** for the admin path — `validateJWT` (`middleware/auth.ts:135`) calls `supabaseAdmin.auth.getUser(token)` against the current tenant's client, so a JWT from tenant A sent with `X-Tenant: B` fails signature verification. Fine.
- **Raw body for Stripe webhook** is correctly registered before `express.json()` at `server.ts:84`.
- **Rate-limit tiering** (`server.ts:91-157`) — four tiers (100/15m generic, 20/15m forms, 10/1m AI, 60/15m admin) is sensible.
- **Stripe config LRU cache** (`payments.ts:87`, `bookings-v2.ts:81`) — 60s TTL, per-key LRU, handles rotation.
- **Collection-as-storage** scales for now: entry content is JSONB, filtered via `content->>field`. Supabase escapes these; no raw concat spotted.

### What's concerning

1. **Add-on registry pattern drift** — `apps/admin/src/config/addons-registry.ts` mixes 3 patterns:
   - Collections-only: `newsletter`, `seo`, `forms`, `bookings`, `tours`, `coupons`, `stripe-payments`, `redirects`, `webhooks-visual`, `i18n` (10/13).
   - `settingsRoute` only (no collections): `cookie-notice`, `accessibility` (2/13).
   - Empty shell: `ai-content` (0 collections, no route).
   - `configFields` used only by `forms` (1/13).
   No canonical path. When someone adds the 13th add-on they pick whichever shape they saw last. Each shape is rendered by separate code paths in admin. No shared contract.

2. **Route versioning convention is undefined** — `/bookings/*` and `/bookings/v2/*` coexist (`server.ts:209-210`). The v2 file (`bookings-v2.ts`, 837 LOC) duplicates `getCollectionId`, `getAdminProfileId`, Stripe config loader, Stripe client LRU — all identical to `bookings.ts` (lines 26-82 of v2, lines 14-82 of v1). Legacy file still serves the `/tours` endpoint (`bookings.ts:111-155`) even though there's now a dedicated `tours.ts`. No deprecation header, no sunset date, no documented plan.

3. **`example` Next.js app** — out of date with the backend. Not re-verified this round but noting: the split created `/v2/` routes and the example was not touched in any of the 14-day commits. Expected to be broken against a post-split backend.

4. **Content validation is field-type-incomplete** — `validate-content.ts` knows about `text`, `textarea`, `richtext`, `slug`, `number`, `boolean`, `date`, `select`, `image`. The bookings/tours addons introduced `multiselect`, `weekly_schedule`, `fixed_slots`, `email`, `url` — all fall through the switch silently (`validate-content.ts:31-67`), so any JSON is accepted for those fields. `entries.ts` calls this validator but doesn't notice.

5. **Auth route cross-tenant enumeration** (`apps/api/src/routes/auth.ts:64-77`) — `/auth/login` tries `signInWithPassword` against **every tenant in parallel** and returns whichever one accepts. This:
   - Emits N Supabase auth calls per login attempt, charging every tenant's quota.
   - Leaks which tenant an email belongs to via timing/error differentials.
   - Blocks any single tenant's Supabase rate limit from protecting the others.
   The admin UI likely already knows which tenant it's pointing at (the `X-Tenant` header is sent on subsequent requests), so login should accept a tenant hint and only try that one.

### Recommended changes

- **Define a canonical add-on shape** — `apps/admin/src/config/addons-registry.ts:28-42`. Severity: Medium. Either (a) all add-ons provide `collections + configFields + settingsRoute?`, with the admin renderer handling optional fields, or (b) split into two interface subtypes (`CollectionAddon` vs `RouteAddon`) with a discriminated union. Fix effort: 2-4h. Rationale: a 14th add-on will land soon; without a contract it'll invent a 4th shape.
- **Extract shared route helpers** — duplicated `getCollectionId`, `getAdminProfileId`, Stripe config/client pair live in `bookings.ts`, `bookings-v2.ts`, `tours.ts`, `coupons.ts` (via `lib/coupons.ts`), `payments.ts`. Move to `apps/api/src/lib/collections-helpers.ts` + `apps/api/src/lib/stripe-helpers.ts`. Effort: 2h. Keeps the Stripe cache coherent (today each file has its own `configCache` — a secret rotation invalidates only the caller's copy).
- **Deprecation plan for `/bookings/*`** — `server.ts:210`. Add a `Deprecation: ...` header, log a warning when hit, document a 60-day sunset in `docs/API_ENDPOINTS.md`. Effort: 1h.
- **Complete `validate-content.ts`** — add cases for `multiselect` (array of strings matching `options[].value`), `weekly_schedule` (object with `mon..sun` → array of `{start,end}`), `fixed_slots` (array of `HH:MM`), `email`, `url`. Effort: 2h.
- **Tenant-scoped login** — `auth.ts:33`. Accept optional `tenant_hint` in body; if present, only try that tenant. If the admin UI knows the tenant, it should pass it. Effort: 1h.

## Security

### Critical (blocks production)

#### C1. Stripe webhook is unreachable — all Stripe-confirmed bookings stay `pending` forever

`apps/api/src/server.ts:207-208`.

```
app.use('/api/v1/payments/webhook', paymentsRouter);               // mount A
app.use('/api/v1/payments', validateApiKey, paymentsRouter);       // mount B
```

The router handler is `router.post('/webhook', ...)` (`payments.ts:283`). Express routing:

- Mount A receives `POST /api/v1/payments/webhook`, strips prefix → internal path `/`. No route matches `/`. Falls through.
- Mount B receives same request, strips `/api/v1/payments` → internal `/webhook`. Matches — but `validateApiKey` runs first (`auth.ts:23-32`) and rejects anything without `Authorization: Bearer kiban_live_...`.
- Stripe sends `Stripe-Signature` header, no Bearer. → 401.

**Consequences:** Every `checkout.session.completed` from Stripe is rejected. `stripe-transactions` rows are never inserted. Bookings created via `/bookings/create` or `/bookings/v2/checkout` never transition from `pending` → `confirmed`. Coupon `confirmRedemption` never runs, so `usage_count` never increments, so a coupon with `max_uses_total=10` effectively has unlimited uses.

**Threat:** complete payment pipeline failure; silent; only visible by looking at Stripe dashboard vs CMS state.

**Fix:** remove the dead mount A (line 207); change mount B to skip `validateApiKey` for the webhook subpath, e.g.:

```ts
app.post('/api/v1/payments/webhook',
  express.raw({ type: 'application/json' }),
  paymentsWebhookHandler);
app.use('/api/v1/payments', validateApiKey, paymentsRouter);
```

Or register the webhook on its own router mounted without the auth middleware. Effort: 30min. **Verify with a live Stripe webhook test event after deploy.**

#### C2. Coupon `confirmRedemption` race is silent, not caught

`apps/api/src/lib/coupons.ts:381-392`.

```ts
const { error: bumpErr } = await supabase
  .from('entries')
  .update({ content: { ...(loaded.row.content as any), usage_count: newUsage } })
  .eq('id', loaded.row.id)
  .filter('content->>usage_count', 'eq', String(loaded.coupon.usage_count));

if (bumpErr) { /* log + return false */ }
// else fall through → mark redemption confirmed
```

The `filter('content->>usage_count', 'eq', <previous>)` is a WHERE guard — if another handler bumped first, the UPDATE matches 0 rows. **supabase-js returns `error: null` for a 0-row UPDATE.** `bumpErr` stays null, the function proceeds to mark the redemption confirmed, and Stripe was already charged. Net result: under concurrent webhook retries or two near-simultaneous checkouts, `max_uses_total` is breached and audit rows disagree with `usage_count`.

Additionally, the UPDATE writes the whole `content` JSONB (`{ ...(loaded.row.content as any), usage_count: newUsage }`). If an admin edits the coupon (e.g. extends `expires_at`) between the SELECT and UPDATE, those edits are silently stomped.

**Fix options (ranked):**

1. **Best:** add a Postgres RPC `bump_coupon_usage(coupon_id uuid, expected_usage int, max_uses int) returns boolean` that does the bump atomically inside a single statement, returning whether it succeeded. Call this instead of the SELECT+UPDATE pattern. No race; no content stomp. Effort: 2h.
2. **Minimal:** use `.select('id')` after `.update(...)` and check `data.length > 0`. If 0, treat as race — cancel the redemption. Doesn't fix the content stomp but closes the counter leak. Effort: 30min.

Severity remains **Critical** because it silently overcharges a coupon budget in a system where coupons can be used for promotions with real cost.

#### C3. Stripe webhook has no tenant context in multi-tenant mode

`apps/api/src/routes/payments.ts:283` + `apps/api/src/middleware/tenant.ts:47-91`.

Stripe webhooks arrive with no `X-Tenant` header and no useful `Origin`. The tenant middleware falls through to hostname resolution, and in multi-tenant mode where all tenants share one deployment, the hostname is the kibanCMS domain — which either matches the default tenant or nothing. The webhook then writes to whichever tenant the fallback resolved to.

**Threat:** a booking created in tenant `lunes` paid via tenant `lunes`'s Stripe keys will be confirmed against tenant `solfil`'s database (or whichever is default). Coupon redemption confirmation targets the wrong tenant. Cross-tenant data corruption under normal operation.

**Fix:** pass `tenant_id` in the Stripe session `metadata` (all three checkout creators already build this object — `bookings.ts:394-400`, `bookings-v2.ts:556-566`, `payments.ts:248-252`). In the webhook, read `event.data.object.metadata.tenant_id` and resolve the tenant client via `resolveTenantById` **before** any DB writes. If metadata is missing (legacy sessions), log and bail. Effort: 2h. Must be deployed before C1 fix goes live.

### High (should fix before next release)

#### H1. `/bookings/v2/*` mutation endpoints have no ownership check

`apps/api/src/routes/bookings-v2.ts:650-736`.

`POST /v2/:bookingId/confirm` and `POST /v2/:bookingId/cancel` accept `validateAny` — meaning any authenticated client (valid JWT or any valid API key) can confirm or cancel any booking by id. There's no check that the caller owns or administers that booking.

Same applies to the read endpoints `GET /v2/:bookingId/status` (`bookings-v2.ts:624`), `GET /v2/list` (`bookings-v2.ts:743`), `GET /v2/stats` (`bookings-v2.ts:796`) — within a tenant, any API key (including one scoped to a public-facing widget) can enumerate every booking's customer email, phone, and total.

**Threat:** one leaked public API key (e.g. from a frontend) → PII exposure + ability to cancel competitors' bookings in the same tenant.

**Fix:** split into public (customer-facing, `validateApiKey` OK) and admin (JWT required + role check) sub-routers. `confirm`, `cancel`, `list`, `stats` → JWT + `is_admin_or_editor`. `status/:bookingId` → keep `validateAny` but require the session hash in URL (hard to guess) or add an email-match challenge.

Identical issue applies to `apps/api/src/routes/bookings.ts:438,469,531,579,635`.

#### H2. Coupon `/validate` endpoint enables code enumeration

`apps/api/src/routes/coupons.ts:16` + `server.ts:212`.

`POST /api/v1/coupons/validate` is mounted behind `validateAny`, inherits only the global 100-req/15min limiter, and returns distinct `reason` codes: `not_found`, `inactive`, `expired`, `exhausted`, `scope`, `currency`, `min_amount`, `per_customer_limit`, `not_new_customer` (`coupons.ts:51-55`, `lib/coupons.ts:132-205`). An attacker with any API key can brute-force the coupon namespace at ~6/sec until hitting the limit, and distinguish "not_found" from "expired" etc.

**Fix:**
- Add a dedicated `couponLimiter` (10 req/min per IP) — template from `formsLimiter` in `server.ts:115`.
- Collapse all failure reasons to a single "invalid" response externally; keep detailed reason in server logs only.
- Effort: 30min.

#### H3. `X-Tenant` header trust model is implicit

`apps/api/src/middleware/tenant.ts:48-56`.

The middleware trusts `X-Tenant` unconditionally to select the Supabase client. The JWT path is safe (JWT fails to validate against wrong tenant's Supabase), but the API-key path also works because API keys live in each tenant's DB — so an API key only validates against its own tenant. OK in practice. However:

- Any public endpoint that does not validate auth (e.g. `/health`, `/api/v1/redirects` public route at `server.ts:226`, static widget endpoints at `server.ts:215, 229, 260`) will respond with a different tenant's data if `X-Tenant` is spoofed. For widgets and redirects this may leak tenant existence.
- There's no audit/log when `X-Tenant` doesn't match the origin — useful signal for detecting abuse.

**Fix:**
- Log a warning when `X-Tenant` is set but `Origin` resolves to a different tenant.
- On public endpoints (redirects, widgets), prefer `Origin` over `X-Tenant`.
- Effort: 1h.

#### H4. Profiles still publicly readable by authenticated users

`database/migrations/CLEAN_RESET.sql:342-343`. Flagged in 2026-04-03 audit, still open.

```sql
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
```

Any authenticated user can enumerate all profiles in the tenant — email addresses, roles, full names. Admin UI needs this for the Users page; public API does not.

**Fix:** restrict to `is_admin_or_editor()` OR `id = auth.uid()`. Admin UI is unaffected. Public frontends (which never directly query `profiles`) unaffected. Effort: 10min SQL migration.

#### H5. `/bookings/v2/checkout` inserts booking BEFORE Stripe session, with no rollback

`apps/api/src/routes/bookings-v2.ts:487-519, 540-569`.

Flow: insert booking → create Stripe Session → update booking with `session.id`. If Stripe throws between step 1 and 2 (network, rate limit, bad key), the booking row stays as `pending` with no `stripe_session_id`, consuming capacity forever unless the admin spots it. The prior flow in `bookings.ts` has the same shape but also runs a second SELECT inside `UPDATE` (`bookings.ts:410`) which doubles DB round-trips.

**Fix:** wrap in a try/catch and delete (or mark as `cancelled`) the booking row if the Stripe call throws. Or invert: create Stripe session first, then booking — but that leaks Stripe sessions when DB is down. Safest: create booking → Stripe session → update booking; on Stripe error, `UPDATE booking SET status='cancelled', cancel_reason='stripe_failed'`. Effort: 1h.

### Medium (this quarter)

#### M1. Stripe config cache duplicated across three files with independent TTL

`apps/api/src/routes/payments.ts:31-97`, `apps/api/src/routes/bookings-v2.ts:32-90`, `apps/api/src/routes/bookings.ts:23-81`.

Three `configCache` variables. Rotating the Stripe secret via the admin UI invalidates none of them. An admin rotating keys and testing Bookings v2 still hits the old key for up to 60s because `bookings-v2.configCache` is separate from `payments.configCache`.

**Fix:** extract to `apps/api/src/lib/stripe-config.ts` with one cache, one fetcher, one LRU of clients. Effort: 1h.

#### M2. Coupon load scans all coupons

`apps/api/src/lib/coupons.ts:112-125`. Comment acknowledges this. No index on `content->>'code'`. Fine for <1000 coupons; will burn as the catalog grows.

**Fix:** add a generated column `code_normalized TEXT GENERATED ALWAYS AS (upper(trim(content->>'code'))) STORED` on `entries` with a partial index `WHERE collection_id = (SELECT id FROM collections WHERE slug = 'coupons')`. Effort: 1h including migration.

#### M3. Webhook-mounting pattern fragile

`apps/api/src/server.ts:207`. The `app.use('/api/v1/payments/webhook', paymentsRouter)` line only exists to document intent; it's dead code (see C1). When fixing C1, delete this line. Otherwise future contributors will re-introduce the same bug by mirroring the pattern.

#### M4. Tour → bookable-resource sync is "fire and forget" on read

`apps/api/src/routes/tours.ts:225-261`. `syncTourToResource` is called on every `GET /tours/:slug` without awaiting, with `.catch(err => logger.warn(...))`. A failed sync (e.g. DB transient error) is logged and lost; the Tours detail page returns 200 but the underlying resource is never created, so booking attempts fail with a mysterious "resource not found".

**Fix:** expose a manual `POST /tours/:slug/sync` (already exists at `tours.ts:268`) and also run sync on the **admin publish trigger** (server-side) rather than on read. Effort: 2h.

#### M5. Login tries every tenant in parallel

See "Architecture → what's concerning → #5" above. Same fix applies; security side: this leaks tenant membership via response time deltas.

#### M6. `/api/v1/cookie-notice/config` returns data without tenant isolation check

`apps/api/src/server.ts:238-245`. The endpoint reads `addon_configs` via the current tenant's Supabase, so isolation is correct, but the fallback in the try/catch returns `{ enabled: true }` — meaning if the query errors, every tenant returns enabled=true regardless of what's configured. Better than leaking another tenant's data, but masks config errors. Fine-grained severity — low, noting because it's a new pattern.

### Low (housekeeping)

- **L1.** `apps/admin/src/config/addons-registry.ts:723-726` — `getAddon` does a linear scan. Build a map at module load. 5 min.
- **L2.** `apps/api/src/routes/bookings.ts:410` — nested SELECT inside UPDATE is a code smell and extra round-trip. Use the pattern from `bookings-v2.ts:586-597` (still ugly but slightly faster).
- **L3.** `apps/api/src/routes/auth.ts:61,70,74,86` — `console.log` in auth path. Either demote to `logger.debug` or remove — tenant IDs in logs are arguably PII.
- **L4.** `apps/api/src/server.ts:364-392` — decorative ASCII banner with emoji survives. Harmless but noisy in structured-log environments.
- **L5.** `database/migrations/_archived/` — 16 files. Consider deleting after a confirmed migration to `CLEAN_RESET.sql` on all tenants (prior audit noted this).
- **L6.** `apps/api/src/routes/coupons.ts:10` — `AuthRequest` imported but `req.profileId` never checked. The route assumes `validateAny` gated it, but a future refactor that drops the middleware would silently expose `/validate`.

## Technical debt inventory

- **Duplicated helpers** (~200 LOC repeated across 4 files):
  - `getCollectionId(slug)` — `bookings.ts:87`, `bookings-v2.ts:94`, `tours.ts:19`, `payments.ts:103`, `lib/coupons.ts:64`.
  - `getAdminProfileId()` — `bookings.ts:96`, `bookings-v2.ts:103`, `tours.ts:28`, `payments.ts:319` (inlined).
  - Stripe config loader + LRU — `bookings.ts:26-81`, `bookings-v2.ts:35-90`, `payments.ts:34-97`.
  - `parseJsonSafe` — `bookings-v2.ts:113-121`, `tours.ts:45-53`.
- **Dead code:**
  - `server.ts:207` (dead Stripe webhook mount — see C1).
  - `server.ts:30` — `configureCors` imported but never used in `server.ts`. It's defined in `auth.ts:196` and returned but not consumed. Dead export.
  - `bookings.ts` legacy tours-specific routes (`/tours`, `/availability`, `/create`) functionally superseded by `/tours/*` and `/v2/*`.
- **Inconsistent error envelopes:**
  - Most routes return `{ error: { message, status, timestamp } }`.
  - Webhook path at `payments.ts:287,294,304` omits `timestamp`.
  - `coupons.ts:40-57` returns a `data` object with `valid: false` — not an error envelope. Intentional since validation results are not errors, but the pattern isn't documented.

## Testing coverage

- **Current:** one smoke test file (`apps/api/src/__tests__/smoke.test.ts`, 244 LOC) that requires a running server, a valid API key, and a valid JWT. Runs 20 HTTP assertions. No unit tests. No tests for the coupon library, tenant middleware, content validator, or Stripe webhook handler. Coverage is effectively 0% by line.

- **Top 3 areas that need tests now:**
  1. `apps/api/src/lib/coupons.ts` — `validateCoupon` (all 9 rejection reasons), `confirmRedemption` under simulated race (two concurrent calls). Tests must run against a test Supabase project or a Postgres-in-docker fixture. Priority: highest; this is where bugs have business impact.
  2. `apps/api/src/middleware/tenant.ts` + `apps/api/src/middleware/auth.ts` — JWT-vs-tenant binding, `X-Tenant` spoofing, API key tenant scoping. Unit-testable with a Supabase client mock. Priority: high; security perimeter.
  3. `apps/api/src/routes/payments.ts:283` — Stripe webhook signature verification + `checkout.session.completed` handler with + without coupon + with + without booking_id. Mock Stripe SDK. Priority: high; this is what C1 and C3 broke.

---

_Auditor: automated holistic review, 2026-04-17. No regressions from 2026-04-03; two brand-new criticals introduced by the last 14 days of work._
