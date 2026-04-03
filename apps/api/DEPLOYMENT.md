# 🚀 KibanCMS Unified Server - Deployment Guide

This server serves both the **API REST** and the **Admin UI** from a single Node.js process.

---

## 📦 **What's Included**

```
Single Server (Port 5001)
├── /api/v1/*        → REST API (authenticated)
├── /health          → Health check
└── /*               → Admin UI (React SPA)
```

---

## 🛠️ **Local Development**

### Development Mode (API + Admin separate)
```bash
# Terminal 1: API Server
cd apps/api
pnpm dev

# Terminal 2: Admin UI (Vite dev server)
cd apps/admin
pnpm dev

# Terminal 3: Example Frontend
cd apps/example
pnpm dev
```

**URLs:**
- API: http://localhost:5001/api/v1
- Admin: http://localhost:5176 (Vite)
- Example: http://localhost:3000

---

## 🏗️ **Production Build**

### Step 1: Build Everything
```bash
cd apps/api
pnpm build
```

This will:
1. Build TypeScript API → `dist/`
2. Build React Admin → `../admin/dist/`

### Step 2: Start Production Server
```bash
pnpm start:prod
```

**Single server serves:**
- http://localhost:5001/api/v1/* → API
- http://localhost:5001/* → Admin UI

---

## ☁️ **Deploy to Railway**

### 1. Create Railway Project
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Init project
railway init
```

### 2. Configure Build
Create `railway.toml` in project root:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "cd apps/api && pnpm install && pnpm build"

[deploy]
startCommand = "cd apps/api && pnpm start:prod"
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

### 3. Environment Variables
```bash
railway variables set SUPABASE_URL=https://xxx.supabase.co
railway variables set SUPABASE_ANON_KEY=your_key
railway variables set PORT=5001
railway variables set NODE_ENV=production
railway variables set ALLOWED_ORIGINS=https://yoursite.com
```

### 4. Deploy
```bash
railway up
```

---

## 🌍 **Deploy to Heroku**

### 1. Create Heroku App
```bash
heroku create kiban-cms-api
```

### 2. Configure Buildpacks
```bash
heroku buildpacks:set heroku/nodejs
```

### 3. Add Environment Variables
```bash
heroku config:set SUPABASE_URL=https://xxx.supabase.co
heroku config:set SUPABASE_ANON_KEY=your_key
heroku config:set NODE_ENV=production
heroku config:set ALLOWED_ORIGINS=https://yoursite.com
```

### 4. Create `Procfile` in project root
```
web: cd apps/api && pnpm start:prod
```

### 5. Deploy
```bash
git push heroku main
```

---

## 🐳 **Deploy with Docker**

### Dockerfile (in `apps/api/`)
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api ./apps/api
COPY apps/admin ./apps/admin

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build
RUN cd apps/api && pnpm build

# Expose port
EXPOSE 5001

# Start
CMD ["pnpm", "--filter", "@kiban/api", "start:prod"]
```

### Build & Run
```bash
docker build -t kiban-cms .
docker run -p 5001:5001 \
  -e SUPABASE_URL=xxx \
  -e SUPABASE_ANON_KEY=xxx \
  -e NODE_ENV=production \
  kiban-cms
```

---

## 🔒 **Security Checklist**

- [ ] Set `NODE_ENV=production`
- [ ] Configure `ALLOWED_ORIGINS` (no `*` in production)
- [ ] Use HTTPS (Let's Encrypt / Cloudflare)
- [ ] Set up rate limiting (already configured)
- [ ] Enable Helmet security headers (already configured)
- [ ] Use Supabase SERVICE_ROLE_KEY for sensitive operations

---

## 📊 **Monitoring**

### Health Check
```bash
curl https://your-domain.com/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-04-01T20:00:00.000Z",
  "service": "KibanCMS Unified Server",
  "version": "1.0.0",
  "mode": "production"
}
```

### Railway/Heroku Logs
```bash
railway logs
# or
heroku logs --tail
```

---

## 🎯 **Custom Domain**

### Railway
```bash
railway domain
# Follow prompts to add custom domain
```

### Heroku
```bash
heroku domains:add api.yourdomain.com
```

### DNS Configuration
```
Type: CNAME
Name: api
Value: your-railway-app.railway.app
```

---

## 🚀 **Performance Tips**

1. **Enable compression:**
```typescript
import compression from 'compression';
app.use(compression());
```

2. **Add Redis caching:**
```bash
railway redis create
```

3. **Use CDN for static assets:**
- Cloudflare
- Railway Edge

4. **Scale horizontally:**
```bash
railway scale --replicas 3
```

---

## 📝 **Deployment Checklist**

- [ ] Environment variables configured
- [ ] Admin UI built (`pnpm build:admin`)
- [ ] API built (`pnpm build:api`)
- [ ] Health check working
- [ ] CORS configured
- [ ] Custom domain set up
- [ ] SSL certificate active
- [ ] Monitoring configured

---

## 🆘 **Troubleshooting**

### Admin UI not loading
- Check if `apps/admin/dist/` exists
- Verify build ran successfully: `cd apps/admin && pnpm build`
- Check server logs

### API 401 errors
- Verify API key exists in Supabase
- Check `Authorization: Bearer` header
- Run migration `007_api_keys.sql`

### Port conflicts
- Change `PORT` environment variable
- Railway/Heroku auto-assign ports

---

**Need help?** Check `apps/api/README.md` or open an issue.
