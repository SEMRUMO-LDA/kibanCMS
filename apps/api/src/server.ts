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
import siteHealthRouter from './routes/site-health.js';
import { marketingAdminRouter, trackHandler } from './routes/marketing.js';
import {
  buildBootstrap, WIDGET_STATIC_DIR, WIDGETS_VERSION,
  getEnabledWidgets, getClusterConfig, getAddonConfig, getWhatsAppConfig, DEFAULT_CLUSTER_CONFIG,
} from './lib/widgets-bootstrap.js';
import { siteContentForPage } from './lib/site-content.js';
import { getPopupsConfig } from './lib/popups.js';
import i18nRouter from './routes/i18n.js';
import newsletterRouter, { newsletterConfirmHandler, newsletterUnsubscribeLinkHandler } from './routes/newsletter.js';
import brevoRouter from './routes/brevo.js';
import { channelManagerRouter } from './routes/channel-manager.js';
import authRouter from './routes/auth.js';
import snapshotsRouter from './routes/snapshots.js';
import {
  inlineEditRouter, createSessionHandler, validateEditToken, applyPendingHandler, discardPendingHandler,
} from './routes/inline-edit.js';
import { supabase as supabaseImport } from './lib/supabase.js';
import { validateApiKey, validateJWT, validateAny, configureCors, apiKeyReadOnly, requireAdmin, requireEditor } from './middleware/auth.js';
import { logger } from './lib/logger.js';
import { getOptimizedImage, ImageError } from './lib/image-optimizer.js';
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

// Railway terminates TLS at its edge proxy and forwards X-Forwarded-For.
// Without this, req.ip is the proxy's address, so every visitor (across all
// tenants) shares one rate-limit bucket.
app.set('trust proxy', 1);

// ── Image optimisation (public) ───────────────────────────────
// Registered BEFORE the global CORS middleware: images are public and are
// embedded on client sites (<img>, next/image, crossorigin fetches).
// See lib/image-optimizer.ts. Only this CMS's public storage URLs are accepted.
const imageLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500, // a page with many images, many visitors behind one IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.get('/api/v1/img', imageLimiter, async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const result = await getOptimizedImage(
      String(req.query.src || ''),
      Number(req.query.w),
      Number(req.query.q),
      req.get('accept'),
    );
    if ('redirect' in result) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.redirect(302, result.redirect);
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=2592000, stale-while-revalidate=86400');
    res.setHeader('Vary', 'Accept');
    res.setHeader('X-Image-Source', result.source);
    res.send(result.body);
  } catch (err: any) {
    if (err instanceof ImageError) {
      return res.status(err.status).json({ error: { message: err.message, status: err.status } });
    }
    logger.error('Image optimisation failed', { error: err?.message });
    res.status(500).json({ error: { message: 'Image optimisation failed', status: 500 } });
  }
});
const PORT = process.env.PORT || 5001;
const NODE_ENV = process.env.NODE_ENV || 'development';
const envOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) || (NODE_ENV === 'production' ? [] : ['*']);
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
      // Disallowed origin: answer without CORS headers (the browser blocks the
      // read) instead of turning every such request into a 500.
      console.log('[CORS] Blocked origin:', origin);
      callback(null, false);
    }
  },
  credentials: false, // bearer tokens, never cookies
  maxAge: 86400, // cache preflights for a day: the widgets make several XHRs per page
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Tenant', 'X-Kiban-Edit'],
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

// Body parsing. Only media / AI routes carry base64 payloads; a 55 MB limit
// everywhere let anyone park a 50 MB "form submission" in the database.
app.use(['/api/v1/media', '/api/v1/ai', '/api/v1/media-intel'], express.json({ limit: '55mb' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiting - 100 requests per 15 minutes per IP.
// Widget boot traffic (8 small GETs per page view, shared by every visitor
// behind one NAT) and signature-verified webhooks get their own buckets so
// they neither starve nor get starved by the general one.
const WIDGET_BOOT_RE = /^\/api\/v1\/(widgets\/|seo(?:\?|$)|(?:cookie-notice|accessibility|whatsapp-widget|popups)\/(?:config|widget\.js)|i18n\/(?:widget(?:\.js)?|languages)(?:\?|$))/;
const WEBHOOK_RE = /^\/api\/v1\/(payments|channel-manager)\/webhook/;
// Inline editing: one resolve per page plus one save per edit — its own bucket (below)
const INLINE_EDIT_RE = /^\/api\/v1\/inline-edit\//;
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
  skip: (req) => WIDGET_BOOT_RE.test(req.originalUrl) || WEBHOOK_RE.test(req.originalUrl) || INLINE_EDIT_RE.test(req.originalUrl),
});
const inlineEditLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many editing requests, slow down a little.', status: 429 } },
});
const widgetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !WIDGET_BOOT_RE.test(req.originalUrl),
});
// Login: one Supabase sign-in per tenant per attempt — keep credential stuffing cheap to stop.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !(req.method === 'POST' && req.path === '/login'),
  message: { error: { message: 'Too many login attempts, try again in a few minutes.', status: 429 } },
});
// Public checkout/booking/payment session creation: each call can hold seats
// for an hour or mint a payment page on the merchant's Stripe account.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // per IP; offices / mobile carriers share one
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'POST' || (req as any).authType === 'jwt',
  message: { error: { message: 'Too many checkout attempts, please try again later.', status: 429 } },
});

// Apply rate limiting to API routes only
app.use('/api/v1', limiter);
app.use('/api/v1', widgetLimiter);

// Request ID — unique ID for every request (tracing)
app.use(requestIdMiddleware);

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

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  const ctx = tenantStore.getStore();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'KibanCMS Unified Server',
    version: '1.5.0',
    mode: NODE_ENV,
    tenant: ctx?.tenant?.id || 'default',
  });
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
app.use('/api/v1/auth', loginLimiter, authRouter);

// API routes
// Collections/Users use JWT (for admin UI) - entries/webhooks/media use API keys (for public API)
app.use('/api/v1/collections', adminLimiter, validateJWT, collectionsRouter);
app.use('/api/v1/users', adminLimiter, validateJWT, usersRouter);
// API keys are public (embedded in client sites): read-only on entries/media,
// never allowed to manage webhooks (they would stream every entry out).
app.use('/api/v1/entries', validateAny, apiKeyReadOnly, entriesRouter);
app.use('/api/v1/media', validateAny, apiKeyReadOnly, mediaRouter);
app.use('/api/v1/webhooks', validateJWT, requireAdmin, webhooksRouter);
app.use('/api/v1/ai', aiLimiter, validateJWT, aiRouter);
app.use('/api/v1/ai', aiLimiter, validateJWT, aiContentRouter);
app.use('/api/v1/dashboard', validateJWT, dashboardRouter);
app.use('/api/v1/activity', validateJWT, activityRouter);
app.use('/api/v1/media-intel', validateJWT, mediaIntelRouter);
app.use('/api/v1/forms', formsLimiter, validateAny, formsRouter); // API Key (submit) + JWT (admin listing), stricter rate limit
// Signed one-click links opened from emails (no API key): confirm a
// subscription, unsubscribe. Registered before the API-key router.
app.get('/api/v1/newsletter/confirm', formsLimiter, (req, res, next) => newsletterConfirmHandler(req, res).catch(next));
app.get('/api/v1/newsletter/unsubscribe', formsLimiter, (req, res, next) => newsletterUnsubscribeLinkHandler(req, res).catch(next));
app.use('/api/v1/newsletter', formsLimiter, validateApiKey, newsletterRouter); // Same rate limit as forms
app.use('/api/v1/brevo', adminLimiter, validateJWT, requireAdmin, brevoRouter); // Brevo admin endpoints — JWT only
// Stripe webhook — mounted as a direct POST handler (not via router) so the
// request body reaches the handler without falling through to the generic
// `/payments` mount (which requires API key and would 401 Stripe's unsigned
// requests). Audit v1.6 C1. The raw-body parser is already configured at line 84.
app.post('/api/v1/payments/webhook', paymentsWebhookHandler);
app.use('/api/v1/payments', validateAny, checkoutLimiter, paymentsRouter); // Payments — JWT (admin) + API Key (frontend)
// Bookings: v2 is mounted at both /v2 (public API contract for frontends) and
// the bare /bookings path (admin UI convenience). Same router, same behaviour.
app.use('/api/v1/bookings/v2', validateAny, checkoutLimiter, bookingsV2Router);
app.use('/api/v1/bookings', validateAny, checkoutLimiter, bookingsV2Router);
// Unified checkout — single endpoint for bookings + products + custom amounts
app.use('/api/v1/checkout', validateAny, checkoutLimiter, checkoutRouter);
// Preview: GET /entry is public (token gates access), POST /token requires an
// editor login (tokens expose draft content).
app.use('/api/v1/preview', (req, res, next) => {
  if (req.method === 'GET' && req.path === '/entry') return next();
  return validateJWT(req as any, res, (err?: any) => (err ? next(err) : requireEditor(req as any, res, next)));
}, previewRouter);
// Trash — admin-only soft-delete management
app.use('/api/v1/trash', validateJWT, trashRouter);
// Inline editing ("Editar no site"). The admin creates a session (JWT) and
// approves pending changes (JWT, editor+); the overlay on the live site uses
// the signed session token (X-Kiban-Edit). See docs/INLINE_EDITING.md.
app.post('/api/v1/inline-edit/session', inlineEditLimiter, validateJWT, (req, res, next) => createSessionHandler(req, res).catch(next));
app.post('/api/v1/inline-edit/pending/:id/apply', inlineEditLimiter, validateJWT, requireEditor, (req, res, next) => applyPendingHandler(req, res).catch(next));
app.post('/api/v1/inline-edit/pending/:id/discard', inlineEditLimiter, validateJWT, requireEditor, (req, res, next) => discardPendingHandler(req, res).catch(next));
app.use('/api/v1/inline-edit', inlineEditLimiter, validateEditToken, inlineEditRouter);
// SEO settings — public to API-key holders so frontends can render meta tags.
// robots.txt, sitemap.xml and llms.txt are fully public: search engines and AI
// crawlers don't authenticate, and they only contain published content.
// (The old app.get('/api/v1/seo/robots.txt', … seoRouter) never matched — the
// router saw the full path — so robots.txt returned 401 since April.)
const PUBLIC_SEO_PATHS = new Set(['/robots.txt', '/sitemap.xml', '/llms.txt']);
app.use('/api/v1/seo', (req, res, next) => {
  if (req.method === 'GET' && PUBLIC_SEO_PATHS.has(req.path)) return next();
  return validateAny(req as any, res, next);
}, seoRouter);
app.use('/api/v1/tours', validateAny, toursRouter); // Tours — rich catalog; delegates booking/checkout to Bookings v2.
app.use('/api/v1/coupons', validateAny, couponsRouter); // Coupons — public /validate endpoint (JWT or API Key).

// Channel Manager.
//   - /webhook/:provider is public (auth = HMAC against the stored webhook_secret)
//   - everything else (CRUD connections, log, providers) is admin-only (JWT).
// One mount, conditional auth — same pattern as /preview.
app.use('/api/v1/channel-manager', (req, res, next) => {
  if (req.method === 'POST' && req.path.startsWith('/webhook/')) return next();
  return validateJWT(req as any, res, (err?: any) => {
    if (err) return next(err);
    return requireAdmin(req as any, res, next);
  });
}, channelManagerRouter);
app.use('/api/v1/affiliates', adminLimiter, validateJWT, requireAdmin, affiliatesRouter); // Affiliates — admin-only (commission management).
app.use('/api/v1/email', adminLimiter, validateJWT, requireAdmin, emailRouter);
const trackLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false }); // own bucket: clicks must not eat the forms quota
app.post('/api/v1/marketing/track', trackLimiter, validateApiKey, trackHandler); // Contact clicks from the widgets script → Meta CAPI (consent-gated)
app.use('/api/v1/marketing', adminLimiter, validateJWT, requireEditor, marketingAdminRouter); // Dashboard marketing card + consent CSV (admin)
app.use('/api/v1/site-health', adminLimiter, validateJWT, requireAdmin, siteHealthRouter); // Settings → Health + Connect site (admin only) // Email diagnostics — admin only (test send).
app.use('/api/v1/snapshots', validateJWT, requireEditor, snapshotsRouter); // Snapshots — admin only (JWT)
// i18n widget — public static JS file (no auth)
app.get('/api/v1/i18n/widget.js', (req, res) => sendWidgetScript(req, res, 'i18n-widget.js'));
app.use('/api/v1/i18n', validateAny, i18nRouter); // i18n — JWT (admin) + API Key (frontend)
app.use('/api/v1/redirects', redirectsRouter); // Public — no auth needed

// ── Universal Widget Loader ────────────────────────────────────────
// Single script tag that auto-loads all enabled widget add-ons.
// Usage: <script src="https://your-cms.com/api/v1/widgets/loader.js" data-api-key="KEY"></script>
//
// Widget scripts: the loader injects them with `?v=<build hash>`, so those
// URLs never change content and can be cached for a year. Unversioned URLs
// (the loader itself, hand-written embeds) keep a 5-minute TTL.
function sendWidgetScript(req: express.Request, res: express.Response, file: string) {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', req.query.v
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=300, must-revalidate');
  res.sendFile(path.join(WIDGET_STATIC_DIR, file));
}
app.get('/api/v1/widgets/loader.js', (req, res) => sendWidgetScript(req, res, 'widgets-loader.js'));
// Inline editing overlay — the loader injects it only when an editing token is present
app.get('/api/v1/widgets/edit-overlay.js', (req, res) => sendWidgetScript(req, res, 'edit-overlay.js'));

// One request with everything the loader and the widgets need (enabled list,
// cluster layout, analytics ids, each widget's config). Replaces eight.
app.get('/api/v1/widgets/bootstrap', validateApiKey, async (req, res) => {
  try {
    const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const data = await buildBootstrap(`${protocol}://${req.headers.host || 'localhost'}`);
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data, timestamp: new Date().toISOString() });
  } catch (err: any) {
    logger.error('Widgets bootstrap failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to load widgets configuration', status: 500 } });
  }
});
// Texts/images captured with "Editar no site": the loader swaps the current
// values into the page for every visitor (lib/site-content.ts). Empty when
// the feature is off for the site.
app.get('/api/v1/widgets/site-content', validateApiKey, async (req, res) => {
  try {
    const data = await siteContentForPage(req.query.path);
    res.setHeader('Cache-Control', 'private, max-age=60'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data, timestamp: new Date().toISOString() });
  } catch (err: any) {
    logger.error('Widgets site-content failed', { error: err.message });
    res.status(500).json({ error: { message: 'Failed to load site content', status: 500 } });
  }
});
app.get('/api/v1/widgets/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ data: { version: WIDGETS_VERSION }, timestamp: new Date().toISOString() });
});

// The individual endpoints stay for hand-written embeds and older cached loaders.
app.get('/api/v1/widgets/enabled', validateApiKey, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data: await getEnabledWidgets(), timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: [], timestamp: new Date().toISOString() });
  }
});
app.get('/api/v1/widgets/cluster-config', validateApiKey, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data: await getClusterConfig(), timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: DEFAULT_CLUSTER_CONFIG, timestamp: new Date().toISOString() });
  }
});

// Cookie Notice widget — public static JS file (no auth)
app.get('/api/v1/cookie-notice/widget.js', (req, res) => sendWidgetScript(req, res, 'cookie-notice-widget.js'));
// Cookie Notice config — API Key auth (frontend reads config)
app.get('/api/v1/cookie-notice/config', validateApiKey, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data: await getAddonConfig('cookie-notice'), timestamp: new Date().toISOString() });
  } catch { res.json({ data: { enabled: true }, timestamp: new Date().toISOString() }); }
});
// Cookie Notice consent — API Key auth (frontend sends consent)
app.post('/api/v1/cookie-notice/consent', validateApiKey, async (req, res) => {
  try {
    const { visitor_id, consent_given, categories } = req.body;
    if (!visitor_id) return res.status(400).json({ error: { message: 'Missing visitor_id', status: 400 } });
    const { error: insertErr } = await supabaseImport.from('addon_cookie_notice_consents').insert({
      visitor_id, consent_given: !!consent_given, categories: categories || {},
      ip_address: req.ip, user_agent: req.headers['user-agent'] || '',
    });
    // Consent records are GDPR proof: never report success if nothing was stored.
    if (insertErr) {
      logger.error('Cookie consent not stored', { error: insertErr.message, hint: 'Run database/migrations/008_security_hardening.sql on this tenant' });
      return res.status(500).json({ error: { message: 'Consent could not be stored', status: 500 } });
    }
    res.json({ data: { ok: true }, timestamp: new Date().toISOString() });
  } catch (err: any) { logger.error('Request failed', { path: req.path, error: err.message }); res.status(500).json({ error: { message: 'Internal server error', status: 500 } }); }
});

// WhatsApp Widget — public static JS file (no auth, served to any origin)
app.get('/api/v1/whatsapp-widget/widget.js', (req, res) => sendWidgetScript(req, res, 'whatsapp-widget.js'));
// WhatsApp Widget config — API Key auth (frontend reads config)
app.get('/api/v1/whatsapp-widget/config', validateApiKey, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data: await getWhatsAppConfig(), timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: { enabled: false }, timestamp: new Date().toISOString() });
  }
});

// Popups & announcement bars (add-on "Popups") — static widget + its config
// (the bootstrap already carries the config; this is the widget's fallback)
app.get('/api/v1/popups/widget.js', (req, res) => sendWidgetScript(req, res, 'popups-widget.js'));
app.get('/api/v1/popups/config', validateApiKey, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data: await getPopupsConfig(), timestamp: new Date().toISOString() });
  } catch {
    res.json({ data: { items: [], turnstileSiteKey: '' }, timestamp: new Date().toISOString() });
  }
});

// Accessibility widget — public static JS file (no auth)
app.get('/api/v1/accessibility/widget.js', (req, res) => sendWidgetScript(req, res, 'accessibility-widget.js'));
// Accessibility config — API Key auth (frontend reads config)
app.get('/api/v1/accessibility/config', validateApiKey, async (_req, res) => {
  try {
    res.setHeader('Cache-Control', 'private, max-age=300'); res.setHeader('Vary', 'Authorization, X-Tenant');
    res.json({ data: await getAddonConfig('accessibility'), timestamp: new Date().toISOString() });
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
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  const status = Number(err?.status || err?.statusCode) || 500;
  // Client errors (bad JSON, body too large) keep their message; upstream and
  // database messages (table/constraint names, provider errors) stay in the logs.
  const message = status < 500 && err?.message ? String(err.message) : 'Internal server error';
  res.status(status).json({
    error: {
      message,
      status,
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
app.listen(PORT, () => {
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
