# kibanCMS

Headless CMS built by AORUBRO. Manages content for any frontend — websites, apps, e-commerce.

## Stack

- **API:** Node.js, Express, TypeScript
- **Admin:** React, Vite, Styled Components
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Deploy:** Docker on Railway

## Quick Start

```bash
git clone https://github.com/SEMRUMO-LDA/kibanCMS.git
cd kibanCMS
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# Fill in Supabase credentials in both .env files
pnpm dev
```

Admin: http://localhost:5173 | API: http://localhost:5001

## Project Structure

```
apps/
  admin/        React SPA (admin panel)
  api/          Express REST API
  example/      Next.js example frontend
packages/
  types/        Shared TypeScript types
  core/         KibanClient SDK
  kiban-client/  Published JS client
  ui/           React component library
  media/        Media processing
  addons/       Add-on system
database/
  migrations/   SQL for Supabase
docs/           All documentation
```

## Documentation

| Document | Description |
|----------|-------------|
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Complete reference for developers |
| [API Endpoints](docs/API_ENDPOINTS.md) | All 39 API endpoints documented |
| [Infrastructure Guide](docs/INFRASTRUCTURE_GUIDE.md) | Railway, Supabase, GitHub access |
| [Forms Email Setup](docs/FORMS_EMAIL_SETUP.md) | Contact form + email notifications |

## Deploy

Push to `main` triggers automatic deploy via Railway.

```bash
git push origin main
# Verify: curl https://kiban.pt/health
```

## License

MIT
