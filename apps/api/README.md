# KibanCMS API Server

REST API server for KibanCMS - handles authentication and data access for frontend applications.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

### 3. Run Development Server

```bash
pnpm dev
```

The API will be available at `http://localhost:5000`

### 4. Build for Production

```bash
pnpm build
pnpm start
```

## 📋 Endpoints

All endpoints require authentication via API key:

```
Authorization: Bearer kiban_live_xxxxxxxxxxxxx
```

### Collections

- `GET /api/v1/collections` - List all collections
- `GET /api/v1/collections/:slug` - Get collection details

### Entries

- `GET /api/v1/entries/:collection` - List entries
  - Query params: `status`, `limit`, `offset`, `sort`, `order`
- `GET /api/v1/entries/:collection/:slug` - Get single entry

### Health Check

- `GET /health` - Server health status (no auth required)

## 🔒 Security Features

- ✅ API Key authentication with SHA-256 hashing
- ✅ Rate limiting (100 requests per 15 min per IP)
- ✅ CORS configuration
- ✅ Helmet security headers
- ✅ Input validation

## 📖 Documentation

See `FRONTEND_INTEGRATION_GUIDE.md` in the project root for complete API documentation and usage examples.

## 🛠️ Development

```bash
# Run with auto-reload
pnpm dev

# Type checking
pnpm build

# Linting
pnpm lint
```

## 🚢 Deployment

This API can be deployed to:
- Railway
- Heroku
- DigitalOcean App Platform
- AWS Elastic Beanstalk
- Any Node.js hosting

Environment variables required:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `PORT` (optional, defaults to 5000)
- `ALLOWED_ORIGINS` (comma-separated list of allowed origins)
