# Database Migrations

Each client (tenant) has its own Supabase project. Every tenant must have
**all** of the files below applied, in this order.

| File | What it adds | Safe to re-run |
|---|---|---|
| `CLEAN_RESET.sql` | Core schema (profiles, collections, entries, media, api_keys, webhooks, add-on tables). **Destructive: drops and recreates the core tables.** Only for a brand-new tenant. | No |
| `002_collection_snapshots.sql` | Collection snapshots / rollback | Yes |
| `003_coupon_usage_rpc.sql` | `bump_coupon_usage` (coupon usage limits) | Yes |
| `004_soft_delete_trash.sql` | `entries.deleted_at` (Trash) | Yes |
| `006_addon_system.sql` | Add-on registry/config tables | Yes |
| `007_channel_manager.sql` | Channel Manager tables | Yes |
| `008_security_hardening.sql` | Role-escalation fix, API-key RPC, cookie-consent table, `media` bucket + upload policies, webhook/snapshot policies, indexes | Yes |
| `009_schema_status.sql` | `kiban_schema_status()` used by Settings → Health. **Bump its `schema_version` (and `EXPECTED_SCHEMA_VERSION` in the API) with every new migration** — the latest definition lives in the newest migration. | Yes |
| `010_addons_improvements.sql` | Translation cache table, lead status/notes fields on form submissions, sitemap collections field on SEO settings, schema status v10 | Yes |
| `011_meta_capi_fields.sql` | Meta Pixel autoload + Conversions API fields on SEO settings (form fields only) | Yes |

## New tenant

`pnpm new-client` applies everything automatically. To do it by hand, run the
files above in order in the tenant's Supabase SQL Editor.

## Existing tenant

Never run `CLEAN_RESET.sql` on a tenant with real data. Paste
**`database/UPGRADE_TENANT.sql`** into the tenant's SQL Editor and run it: it
contains 002 → 011 in one transaction (all or nothing) and ends with a
checklist query. Repeat for every tenant.

`UPGRADE_TENANT.sql` is generated — after adding or changing a numbered
migration, run `bash scripts/build-upgrade-sql.sh` and commit the result.

## Seeds

`database/seeds/` holds client-specific data (e.g. the LUNES galleries). These
are not migrations: don't run them on other tenants.

## Archived

`_archived/` is historical only. Do not run those files; everything still
needed was folded into the files above.
