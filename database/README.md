# Database

Each tenant (client) has its own Supabase project.

- **Schema and migrations:** see [`migrations/README.md`](migrations/README.md).
  New tenants get `CLEAN_RESET.sql` + every numbered migration (`pnpm new-client`);
  existing tenants run the generated [`UPGRADE_TENANT.sql`](UPGRADE_TENANT.sql)
  in the Supabase SQL Editor after every release that adds a migration.
- **Seeds:** `seeds/` holds client-specific data; never run them on other tenants.
- **Health:** Settings → Health in the admin shows the schema version each tenant
  has (`kiban_schema_status()`) and what is missing.
