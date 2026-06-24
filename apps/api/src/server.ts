import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import collectionsRouter from './routes/collections.js';
import entriesRouter from './routes/entries.js';
import webhooksRouter from './routes/webhooks.js';
import mediaRouter from './routes/media.js';
import usersRouter from './routes/users.js';
import aiRouter from './routes/ai.js';
import aiContentRouter from './routes/ai-content.js';
import dashboardRouter from './routes/dashboard.js';
import activityRouter from './routes/activity.js';
import mediaIntelRouter from './routes/media-intelligence.js';
import redirectsRouter from './routes/redirects.js';
import formsRouter from './routes/forms.js';
import paymentsRouter, { webhookHandler as paymentsWebhookHandler } from './routes/payments.js';
import bookingsV2Router from './routes/bookings-v2.js';
import checkoutRouter from './routes/checkout.js';
import previewRouter from './routes/preview.js';
import trashRouter from './routes/trash.js';
import seoRouter from './routes/seo.js';
import toursRouter from './routes/tours.js';
import couponsRouter from './routes/coupons.js';
import affiliatesRouter from './routes/affiliates.js';
import emailRouter from './routes/email.js';
import i18nRouter from './routes/i18n.js';
import newsletterRouter from './routes/newsletter.js';
import brevoRouter from './routes/brevo.js';
import { channelManagerRouter } from './routes/channel-manager.js';
import authRouter from './routes/auth.js';
import snapshotsRouter from './routes/snapshots.js';
import { supabase as supabaseImport } from './lib/supabase.js';
import { validateApiKey, validateJWT, validateAny, configureCors } from './middleware/auth.js';
import { tenantMiddleware, tenantStore } from './middleware/tenant.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { loadTenants, resolveTenant, getAllTenants } from './config/tenants.js';
import { startWebhookWorker } from './lib/webhook-worker.js';
import { startScheduledPublisher } from './lib/scheduled-publisher.js';
import { startPostTourReviewWorker } from './lib/post-tour-reviews-worker.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// Load tenant configuration (must be before app starts)
loadTenants();

const app: express.Express = express();
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const envOrigins = process.env.ALLOWED_ORIGINS?.split(',') || (NODE_ENV === 'production' ? [] : ['*']);
// Merge env origins with tenant origins so widgets work cross-origin
const tenantOrigins = getAllTenants().flatMap(t => t.origins);
const allowedOrigins = [...new Set([...envOrigins, ...tenantOrigins])];

// CORS configuration - MUST BE FIRST, before helmet
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('[CORS] Blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Tenant'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// Security middleware (AFTER CORS, disabled in dev)
if (NODE_ENV === 'production') {
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for API
    crossOriginResourcePolicy: false, // Disable CORP for API
  }));
}

// Stripe webhook needs raw body for signature verification (must be before json parser)
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));

// Channel Manager webhooks (Bokun, FareHarbor, …) — HMAC over raw body, so
// keep the buffer untouched. Stash it on req.rawBody too for handler use.
app.use('/api/v1/channel-manager/webhook', express.raw({
  type: '*/*',
  limit: '5mb',
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// Body parsing (limit increased for base64 media uploads)
app.use(express.json({ limit: '55mb' }));
app.use(express.urlencoded({ extended: true, limit: '55mb' }));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: {
      message: 'Too many requests from this IP, please try again later.',
      status: 429,
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to API routes only
app.use('/api/v1', limiter);

// Request ID — unique ID for every request (tracing)
app.use(requestIdMiddleware);

// Health check endpoint (no auth required) - Must be BEFORE tenantMiddleware!
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'KibanCMS Unified Server',
    version: '1.5.0',
    mode: NODE_ENV,
  });
});

// Tenant resolution — sets up per-request Supabase clients
app.use(tenantMiddleware);

// Stricter rate limit for form submissions (anti-spam)
const formsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 submissions per 15 min per IP
  message: {
    error: {
      message: 'Too many form submissions. Please try again later.',
      status: 429,
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI route rate limit — protect external API quotas (Gemini, etc.)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 AI requests per minute per IP
  message: {
    error: {
      message: 'Too many AI requests. Please try again in a moment.',
      status: 429,
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Sensitive admin routes — prevent enumeration attacks
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // 60 requests per 15 min per IP
  message: {
    error: {
      message: 'Too many requests. Please try again later.',
      status: 429,
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});


// Tenant config endpoint — frontend fetches Supabase credentials from here
app.get('/api/v1/config', (req, res) => {
  const ctx = tenantStore.getStore();
  if (!ctx) {
    res.status(500).json({ error: { message: 'No tenant context', status: 500 } });
    return;
  }

  res.json({
    data: {
      supabaseUrl: ctx.tenant.supabaseUrl,
      supabaseAnonKey: ctx.tenant.supabaseAnonKey,
      tenantId: ctx.tenant.id,
    },
    timestamp: new Date().toISOString(),
  });
});

// Auth route — no auth middleware (this IS the auth)
app.use('/api/v1/auth', authRouter);

// API routes
// Collections/Users use JWT (for admin UI) - entries/webhooks/media use API keys (for public API)
app.use('/api/v1/collections', adminLimiter, validateJWT, collectionsRouter);
app.use('/api/v1/users', adminLimiter, validateJWT, usersRouter);
app.use('/api/v1/entries', validateAny, entriesRouter);
app.use('/api/v1/media', validateAny, mediaRouter);
app.use('/api/v1/webhooks', validateAny, webhooksRouter);
app.use('/api/v1/ai', aiLimiter, validateJWT, aiRouter);
app.use('/api/v1/ai', aiLimiter, validateJWT, aiContentRouter);
app.use('/api/v1/dashboard', validateJWT, dashboardRouter);
app.use('/api/v1/activity', validateJWT, activityRouter);
app.use('/api/v1/media-intel', validateJWT, mediaIntelRouter);
app.use('/api/v1/forms', formsLimiter, validateApiKey, formsRouter); // API Key + stricter rate limit
app.use('/api/v1/newsletter', formsLimiter, validateApiKey, newsletterRouter); // Same rate limit as forms
app.use('/api/v1/brevo', adminLimiter, validateJWT, brevoRouter); // Brevo admin endpoints — JWT only
// Stripe webhook — mounted as a direct POST handler (not via router) so the
// request body reaches the handler without falling through to the generic
// `/payments` mount (which requires API key and would 401 Stripe's unsigned
// requests). Audit v1.6 C1. The raw-body parser is already configured at line 84.
app.post('/api/v1/payments/webhook', paymentsWebhookHandler);
app.use('/api/v1/payments', validateAny, paymentsRouter); // Payments — JWT (admin) + API Key (frontend)
// Bookings: v2 is mounted at both /v2 (public API contract for frontends) and
// the bare /bookings path (admin UI convenience). Same router, same behaviour.
app.use('/api/v1/bookings/v2', validateAny, bookingsV2Router);
app.use('/api/v1/bookings', validateAny, bookingsV2Router);
// Unified checkout — single endpoint for bookings + products + custom amounts
app.use('/api/v1/checkout', validateAny, checkoutRouter);
// Preview: GET /entry is public (token gates access), POST /token requires JWT.
// Conditionally skip JWT auth for the public token-gated read endpoint.
app.use('/api/v1/preview', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/entry') return next();
  return validateJWT(req as any, res, next);
}, previewRouter);
// Trash — admin-only soft-delete management
app.use('/api/v1/trash', validateJWT, trashRouter);
// SEO settings — public to API-key holders so frontends can render meta tags.
// robots.txt is fully public (search engines don't auth).
app.get('/api/v1/seo/robots.txt', (req, res, next) => seoRouter(req as any, res, next));
app.use('/api/v1/seo', validateAny, seoRouter);
app.use('/api/v1/tours', validateAny, toursRouter); // Tours — rich catalog; delegates booking/checkout to Bookings v2.
app.use('/api/v1/coupons', validateAny, couponsRouter); // Coupons — public /validate endpoint (JWT or API Key).

// Channel Manager.
//   - /webhook/:provider is public (auth = HMAC against the stored webhook_secret)
//   - everything else (CRUD connections, log, providers) is admin-only (JWT).
// One mount, conditional auth — same pattern as /preview.
app.use('/api/v1/channel-manager', (req, res, next) => {
  if (req.method === 'POST' && req.path.startsWith('/webhook/')) return next();
  return validateJWT(req as any, res, next);
}, channelManagerRouter);
app.use('/api/v1/affiliates', adminLimiter, validateJWT, affiliatesRouter); // Affiliates — admin-only (commission management).
app.use('/api/v1/email', adminLimiter, validateJWT, emailRouter); // Email diagnostics — admin only (test send).
app.use('/api/v1/snapshots', validateJWT, snapshotsRouter); // Snapshots — admin only (JWT)
// i18n widget — public static JS file (no auth)
app.get('/api/v1/i18n/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  // Short TTL + must-revalidate so widget bug fixes reach users within minutes,
  // not hours. The widget is small (~12KB) so the bandwidth hit is negligible.
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  // Production: __dirname = /app/apps/api/dist → static at /app/apps/api/static
  // Development: __dirname = apps/api/src → static at apps/api/src/static
  const staticPath = NODE_ENV === 'production'
    ? path.join(__dirname, '../static/i18n-widget.js')
    : path.join(__dirname, 'static/i18n-widget.js');
  res.sendFile(staticPath);
});
app.use('/api/v1/i18n', validateAny, i18nRouter); // i18n — JWT (admin) + API Key (frontend)
app.use('/api/v1/redirects', redirectsRouter); // Public — no auth needed

// ── Universal Widget Loader ────────────────────────────────────────
// Single script tag that auto-loads all enabled widget add-ons.
// Usage: <script src="https://your-cms.com/api/v1/widgets/loader.js" data-api-key="KEY"></script>
app.get('/api/v1/widgets/loader.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  const staticPath = NODE_ENV === 'production'
    ? path.join(__dirname, '../static/widgets-loader.js')
    : path.join(__dirname, 'static/widgets-loader.js');
  res.sendFile(staticPath);
});

// Which widget add-ons are enabled — called by the loader to decide what to inject.
// Returns an array of addon_id strings for add-ons that have widgets AND are enabled.
//
// Mirrors the admin's "installed/enabled" semantics in apps/admin/src/pages/Addons.tsx:
//   - Settings-based widgets (cookie-notice, accessibility) are installed by default
//     and only excluded when addon_configs has an explicit `enabled:false`.
//   - Collection-based widgets (whatsapp-widget, i18n) are installed only if their
//     defining collection exists; enabled state then comes from a collection entry
//     (whatsapp-widget) or addon_configs (i18n).
const SETTINGS_WIDGET_ADDON_IDS = ['cookie-notice', 'accessibility'];

app.get('/api/v1/widgets/enabled', validateApiKey, async (_req, res) => {
  try {
    const { data: configs } = await supabaseImport
      .from('addon_configs')
      .select('addon_id, config')
      .in('addon_id', [...SETTINGS_WIDGET_ADDON_IDS, 'i18n']);

    const explicitlyDisabled = new Set(
      (configs || [])
        .filter(row => row.config?.enabled === false)
        .map(row => row.addon_id)
    );

    const enabled: string[] = SETTINGS_WIDGET_ADDON_IDS.filter(id => !explicitlyDisabled.has(id));

    // WhatsApp widget — installed if its collection exists; enabled state lives in
    // a published entry with slug='config'.
    const { data: waCol } = await supabaseImport.from('collections').select('id').eq('slug', 'whatsapp-widget').maybeSingle();
    if (waCol) {
      const { data: entry } = await supabaseImport
        .from('entries')
        .select('content')
        .eq('collection_id', waCol.id)
        .eq('slug', 'config')
        .eq('status', 'published')
        .maybeSingle();
      if (entry?.content?.enabled) enabled.push('whatsapp-widget');
    }

    // i18n — installed if its config collection exists; enabled unless addon_configs
    // explicitly disables it.
    const { data: i18nCol } = await supabaseImport.from('collections').select('id').eq('slug', 'i18n-config').maybeSingle();
    if (i18nCol && !explicitlyDisabled.has('i18n')) {
      enabled.push('i18n');
    }

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ data: enabled, timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: [], timestamp: new Date().toISOString() });
  }
});

// ── Widget Cluster Config ──────────────────────────────────────────
// Persists which widgets the loader should collapse into the floating
// cluster, plus an optional accent colour that gets piped into the
// `--kiban-widget-tint` CSS variable. Read public (loader needs it),
// written by the admin UI directly via Supabase.
const DEFAULT_CLUSTER_CONFIG = {
  accentColor: null as string | null,
  includedWidgets: ['cookie-notice', 'accessibility', 'whatsapp-widget', 'i18n'],
};

app.get('/api/v1/widgets/cluster-config', validateApiKey, async (_req, res) => {
  try {
    const { data } = await supabaseImport
      .from('addon_configs')
      .select('config')
      .eq('addon_id', 'widget-cluster')
      .maybeSingle();
    const cfg = { ...DEFAULT_CLUSTER_CONFIG, ...(data?.config || {}) };
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ data: cfg, timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: DEFAULT_CLUSTER_CONFIG, timestamp: new Date().toISOString() });
  }
});

// Cookie Notice widget — public static JS file (no auth)
app.get('/api/v1/cookie-notice/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const staticPath = NODE_ENV === 'production'
    ? path.join(__dirname, '../static/cookie-notice-widget.js')
    : path.join(__dirname, 'static/cookie-notice-widget.js');
  res.sendFile(staticPath);
});
// Cookie Notice config — API Key auth (frontend reads config)
app.get('/api/v1/cookie-notice/config', validateApiKey, async (req, res) => {
  try {
    const { data } = await supabaseImport.from('addon_configs').select('config').eq('addon_id', 'cookie-notice').single();
    // No row = installed but never configured → default to enabled (matches admin logic)
    const config = data?.config || { enabled: true };
    res.json({ data: config, timestamp: new Date().toISOString() });
  } catch { res.json({ data: { enabled: true }, timestamp: new Date().toISOString() }); }
});
// Cookie Notice consent — API Key auth (frontend sends consent)
app.post('/api/v1/cookie-notice/consent', validateApiKey, async (req, res) => {
  try {
    const { visitor_id, consent_given, categories } = req.body;
    if (!visitor_id) return res.status(400).json({ error: { message: 'Missing visitor_id', status: 400 } });
    await supabaseImport.from('addon_cookie_notice_consents').insert({
      visitor_id, consent_given: !!consent_given, categories: categories || {},
      ip_address: req.ip, user_agent: req.headers['user-agent'] || '',
    });
    res.json({ data: { ok: true }, timestamp: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ error: { message: err.message, status: 500 } }); }
});

// WhatsApp Widget — public static JS file (no auth, served to any origin)
app.get('/api/v1/whatsapp-widget/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  // 5-min cache + must-revalidate so config changes propagate quickly
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  const staticPath = NODE_ENV === 'production'
    ? path.join(__dirname, '../static/whatsapp-widget.js')
    : path.join(__dirname, 'static/whatsapp-widget.js');
  res.sendFile(staticPath);
});
// WhatsApp Widget config — API Key auth (frontend reads config)
// Reads the single entry with slug 'config' from the 'whatsapp-widget' collection.
app.get('/api/v1/whatsapp-widget/config', validateApiKey, async (_req, res) => {
  try {
    const { data: col } = await supabaseImport.from('collections').select('id').eq('slug', 'whatsapp-widget').maybeSingle();
    if (!col) return res.json({ data: { enabled: false }, timestamp: new Date().toISOString() });

    const { data: entry } = await supabaseImport
      .from('entries')
      .select('content')
      .eq('collection_id', col.id)
      .eq('slug', 'config')
      .eq('status', 'published')
      .maybeSingle();

    res.setHeader('Cache-Control', 'public, max-age=60'); // 1-min CDN cache
    res.json({ data: entry?.content || { enabled: false }, timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: { enabled: false }, timestamp: new Date().toISOString() });
  }
});

// Accessibility widget — public static JS file (no auth)
app.get('/api/v1/accessibility/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const staticPath = NODE_ENV === 'production'
    ? path.join(__dirname, '../static/accessibility-widget.js')
    : path.join(__dirname, 'static/accessibility-widget.js');
  res.sendFile(staticPath);
});
// Accessibility config — API Key auth (frontend reads config)
app.get('/api/v1/accessibility/config', validateApiKey, async (req, res) => {
  try {
    const { data } = await supabaseImport.from('addon_configs').select('config').eq('addon_id', 'accessibility').single();
    // No row = installed but never configured → default to enabled (matches admin logic)
    const config = data?.config || { enabled: true };
    res.json({ data: config, timestamp: new Date().toISOString() });
  } catch { res.json({ data: { enabled: true }, timestamp: new Date().toISOString() }); }
});

// Serve Admin UI (static files from admin build)
if (NODE_ENV === 'production') {
  // In Docker: __dirname = /app/apps/api/dist → admin is at /app/apps/admin/dist
  // In local prod: __dirname = apps/api/dist → admin is at apps/admin/dist
  const adminBuildPath = path.join(__dirname, '../../admin/dist');

  // Serve static files
  app.use(express.static(adminBuildPath));

  // SPA fallback - serve index.html for all other routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        error: {
          message: 'API endpoint not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    res.sendFile(path.join(adminBuildPath, 'index.html'));
  });
} else {
  // Development mode - just handle 404 for non-API routes
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        error: {
          message: 'API endpoint not found',
          status: 404,
          timestamp: new Date().toISOString(),
        },
      });
    }

    res.status(404).send(`
      <html>
        <body>
          <h1>KibanCMS Unified Server - Development Mode</h1>
          <p>Admin UI is not served in development. Run it separately:</p>
          <code>cd apps/admin && pnpm dev</code>
          <hr>
          <h2>API Endpoints:</h2>
          <ul>
            <li><a href="/health">/health</a> - Health check</li>
            <li>/api/v1/collections - List collections</li>
            <li>/api/v1/entries/:collection - List entries</li>
          </ul>
        </body>
      </html>
    `);
  });
}

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: {
      message: err.message || 'Internal server error',
      status: 500,
      timestamp: new Date().toISOString(),
    },
  });
});

// Start background workers
const stopWebhookWorker = startWebhookWorker();
const stopScheduledPublisher = startScheduledPublisher();
const stopPostTourReviewWorker = startPostTourReviewWorker();

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  stopWebhookWorker();
  stopScheduledPublisher();
  stopPostTourReviewWorker();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  stopWebhookWorker();
  stopScheduledPublisher();
  stopPostTourReviewWorker();
  process.exit(0);
});

// Start server
app.listen(PORT as number, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 KibanCMS Unified Server                             ║
║                                                           ║
║   Status:  RUNNING                                       ║
║   Port:    ${PORT.toString().padEnd(44)}║
║   Mode:    ${NODE_ENV.padEnd(44)}║
║   Health:  http://localhost:${PORT}/health${' '.repeat(26)}║
║                                                           ║
${NODE_ENV === 'production' ?
`║   Admin UI: http://localhost:${PORT}${' '.repeat(30)}║
║                                                           ║` :
`║   Admin UI: Run separately (dev mode)                    ║
║             cd apps/admin && pnpm dev                    ║
║                                                           ║`}
║   API Endpoints:                                         ║
║   • CRUD   /api/v1/collections                           ║
║   • CRUD   /api/v1/entries/:collection                   ║
║   • CRUD   /api/v1/media                                 ║
║   • CRUD   /api/v1/users                                 ║
║   • CRUD   /api/v1/webhooks                              ║
║                                                           ║
║   🔄 Webhook Worker: ACTIVE                              ║
║                                                           ║
║   Documentation: FRONTEND_INTEGRATION_GUIDE.md           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
