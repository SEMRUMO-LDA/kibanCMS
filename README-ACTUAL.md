# kibanCMS v0.1 (Beta)

**⚠️ STATUS: Early Beta - Not Production Ready**

A modern headless CMS built with TypeScript, Supabase, and React. Designed for agencies and developers who need a simple, self-hosted content management solution.

## Current State (April 2026)

### ✅ What Works

- **Collection Builder**: Visual UI to create content models
- **Basic CRUD API**: Create, read, update, delete entries
- **Admin Dashboard**: Functional but limited features
- **TypeScript SDK**: Basic client with read operations
- **Authentication**: Supabase Auth integration
- **API Keys**: Basic API key system (no scopes yet)

### ❌ What Doesn't Work Yet

- **Media Library**: UI exists but upload not implemented
- **User Management**: Page exists but empty
- **Webhooks**: Database ready but not functional
- **Search/Filter**: Very basic, needs improvement
- **Version History**: Tables exist, no UI
- **Bulk Operations**: API exists, not tested
- **Testing**: 0% test coverage

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase account (free tier works)

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/kibancms.git
cd kibancms

# Install dependencies
pnpm install

# Setup environment variables
cp apps/admin/.env.example apps/admin/.env
cp apps/api/.env.example apps/api/.env

# Edit .env files with your Supabase credentials
```

### Database Setup

1. Go to your Supabase SQL Editor
2. Run migrations in order:
   - `database/migrations/001_initial_schema.sql`
   - `database/migrations/007_api_keys.sql`
3. Run seed data: `scripts/emergency-seed.sql`

### Start Development

```bash
# Terminal 1 - Start API server (port 5001)
pnpm dev:api

# Terminal 2 - Start Admin UI (port 5173)
pnpm dev:admin
```

Visit: http://localhost:5173

## Project Structure

```
kibanCMS/
├── apps/
│   ├── admin/          # React admin panel
│   ├── api/            # Express.js API server
│   └── example/        # Example Next.js frontend
├── packages/
│   └── kiban-client/   # TypeScript SDK
├── database/
│   └── migrations/     # SQL migrations
└── scripts/            # Utility scripts
```

## API Endpoints

### Collections
- `GET /api/v1/collections` - List collections
- `GET /api/v1/collections/:slug` - Get collection
- `POST /api/v1/collections` - Create collection (JWT auth)
- `PUT /api/v1/collections/:slug` - Update collection (JWT auth)
- `DELETE /api/v1/collections/:slug` - Delete collection (JWT auth)

### Entries
- `GET /api/v1/entries/:collection` - List entries
- `GET /api/v1/entries/:collection/:slug` - Get entry
- `POST /api/v1/entries/:collection` - Create entry (API key)
- `PUT /api/v1/entries/:collection/:slug` - Update entry (API key)
- `DELETE /api/v1/entries/:collection/:slug` - Delete entry (API key)

## Known Issues

1. **Authentication Confusion**: Admin uses JWT, API uses API keys
2. **Missing Features**: Media upload, user management, webhooks
3. **No Tests**: Zero test coverage
4. **Performance**: No caching, offset pagination (slow)
5. **Security**: API keys have no scopes/permissions

## Roadmap to v1.0

### Phase 1: Core Stability (Current)
- [x] Basic CRUD operations
- [x] Collection builder
- [ ] Media upload
- [ ] Basic testing (40% coverage)

### Phase 2: Essential Features
- [ ] User & role management
- [ ] Content search & filtering
- [ ] Webhook system
- [ ] API key scopes

### Phase 3: Production Ready
- [ ] Caching layer
- [ ] Cursor pagination
- [ ] Audit logging
- [ ] 80% test coverage
- [ ] Documentation

## Contributing

This is an early beta. Expect breaking changes.

### Development

```bash
# Run type checking
pnpm typecheck

# Build packages
pnpm build

# Run tests (when implemented)
pnpm test
```

## Comparison with Alternatives

| Feature | kibanCMS | Strapi | Sanity | Contentful |
|---------|----------|---------|---------|------------|
| Self-hosted | ✅ | ✅ | ❌ | ❌ |
| TypeScript | ✅ | Partial | ✅ | N/A |
| Visual Builder | ✅ | ✅ | ✅ | ✅ |
| Media Library | ❌ | ✅ | ✅ | ✅ |
| GraphQL | ❌ | ✅ | ✅ | ✅ |
| Webhooks | ❌ | ✅ | ✅ | ✅ |
| i18n | ❌ | ✅ | ✅ | ✅ |
| Production Ready | ❌ | ✅ | ✅ | ✅ |

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/kibancms/issues)
- Docs: See `/docs` folder
- Discord: Coming soon

## License

MIT

---

**⚠️ WARNING**: This is beta software. Do not use in production without extensive testing.

## Emergency Fixes

If something breaks:

1. **Database issues**: Run `scripts/emergency-seed.sql`
2. **Auth issues**: Check Supabase credentials in `.env`
3. **API not working**: Ensure port 5001 is free
4. **Admin blank**: Check browser console for errors

## Debug Information

- Admin uses Supabase directly for some operations
- API uses different auth for different endpoints
- Collections use JWT auth (admin panel)
- Entries use API key auth (frontend)
- This will be unified in v1.0

---

Last updated: April 2, 2026
Version: 0.1.0-beta